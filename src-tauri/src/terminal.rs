//! Terminal management module using portable-pty
//!
//! Uses portable-pty for proper PTY support on Windows (via ConPTY).
//! Event-driven output: PTY reader pushes data to frontend via Tauri events.

use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Terminal shell type
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ShellType {
    PowerShell,
    Cmd,
    GitBash,
}

impl ShellType {
    pub fn executable(&self) -> &'static str {
        match self {
            ShellType::PowerShell => "powershell.exe",
            ShellType::Cmd => "cmd.exe",
            ShellType::GitBash => "C:\\Program Files\\Git\\bin\\bash.exe",
        }
    }

    pub fn args(&self) -> Vec<&'static str> {
        match self {
            ShellType::PowerShell => vec!["-NoLogo", "-NoProfile"],
            ShellType::Cmd => vec![],
            ShellType::GitBash => vec!["--login", "-i"],
        }
    }
}

/// Event payload for terminal output pushed to frontend
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutputEvent {
    pub terminal_id: String,
    pub data: String,
}

/// Event payload for terminal exit notification
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalExitEvent {
    pub terminal_id: String,
}

/// Commands that can be sent to a terminal thread
enum TerminalCommand {
    Write(Vec<u8>),
    Resize(u16, u16),
    Close,
}

/// Terminal handle for communication with the terminal thread
pub struct TerminalHandle {
    #[allow(dead_code)]
    pub id: String,
    #[allow(dead_code)]
    pub shell_type: ShellType,
    command_tx: Sender<TerminalCommand>,
    alive: Arc<Mutex<bool>>,
}

impl TerminalHandle {
    fn new(
        id: String,
        shell_type: ShellType,
        cwd: Option<String>,
        log_file: Option<String>,
        app_handle: AppHandle,
    ) -> anyhow::Result<Self> {
        let (cmd_tx, cmd_rx) = mpsc::channel::<TerminalCommand>();
        let alive = Arc::new(Mutex::new(true));
        let alive_clone = Arc::clone(&alive);

        let shell_exe = shell_type.executable().to_string();
        let shell_args: Vec<String> = shell_type.args().iter().map(|s| s.to_string()).collect();
        let cwd_clone = cwd.clone();
        let terminal_id = id.clone();
        let log_file_clone = log_file.clone();

        // Spawn terminal in a dedicated thread
        thread::spawn(move || {
            eprintln!("[PTY Thread] Starting with: {} {:?}", shell_exe, shell_args);

            // Get native PTY system (uses ConPTY on Windows)
            let pty_system = native_pty_system();

            // Create PTY with initial size
            let pair = match pty_system.openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            }) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("[PTY Thread] Failed to open PTY: {}", e);
                    *alive_clone.lock() = false;
                    return;
                }
            };

            // Build command with environment variables
            let mut cmd = CommandBuilder::new(&shell_exe);
            for arg in &shell_args {
                cmd.arg(arg);
            }

            // Set environment variables for proper terminal behavior
            cmd.env("TERM", "xterm-256color");
            cmd.env("COLORTERM", "truecolor");
            cmd.env("FORCE_COLOR", "1");
            cmd.env("CI", ""); // Unset CI to avoid non-interactive mode

            // Set working directory
            if let Some(ref dir) = cwd_clone {
                if std::path::Path::new(dir).exists() {
                    cmd.cwd(dir);
                }
            }

            // Spawn the shell
            let mut child = match pair.slave.spawn_command(cmd) {
                Ok(c) => c,
                Err(e) => {
                    eprintln!("[PTY Thread] Failed to spawn command: {}", e);
                    *alive_clone.lock() = false;
                    return;
                }
            };

            eprintln!("[PTY Thread] Shell spawned successfully");

            // Get reader and writer
            let mut reader = match pair.master.try_clone_reader() {
                Ok(r) => r,
                Err(e) => {
                    eprintln!("[PTY Thread] Failed to clone reader: {}", e);
                    *alive_clone.lock() = false;
                    return;
                }
            };

            let mut writer = pair.master.take_writer().unwrap();

            // Open log file (append mode) if requested
            let log_file_handle: Option<Arc<Mutex<std::fs::File>>> = log_file_clone.as_ref().and_then(|path| {
                if let Some(parent) = std::path::Path::new(path).parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(path)
                    .ok()
                    .map(|f| Arc::new(Mutex::new(f)))
            });

            // Output reader thread - pushes data to frontend via Tauri events
            let alive_reader = Arc::clone(&alive_clone);
            let emit_handle = app_handle.clone();
            let emit_terminal_id = terminal_id.clone();
            let log_file_reader = log_file_handle.clone();
            thread::spawn(move || {
                // Use small buffer for responsive output
                let mut buffer = [0u8; 4096];
                loop {
                    if !*alive_reader.lock() {
                        break;
                    }

                    match reader.read(&mut buffer) {
                        Ok(0) => {
                            eprintln!("[PTY Reader] EOF");
                            break;
                        }
                        Ok(n) => {
                            // Write raw bytes to log file if configured
                            if let Some(ref lf) = log_file_reader {
                                let mut f = lf.lock();
                                let _ = f.write_all(&buffer[..n]);
                            }
                            // Convert to string and emit event to frontend immediately
                            let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                            let _ = emit_handle.emit(
                                "terminal-output",
                                TerminalOutputEvent {
                                    terminal_id: emit_terminal_id.clone(),
                                    data,
                                },
                            );
                        }
                        Err(e) => {
                            eprintln!("[PTY Reader] Error: {}", e);
                            break;
                        }
                    }
                }
                *alive_reader.lock() = false;
                // Notify frontend that this terminal has exited
                let _ = emit_handle.emit(
                    "terminal-exit",
                    TerminalExitEvent {
                        terminal_id: emit_terminal_id.clone(),
                    },
                );
                eprintln!("[PTY Reader] Thread exiting");
            });

            // Process commands from main thread
            loop {
                match cmd_rx.recv() {
                    Ok(TerminalCommand::Write(data)) => {
                        if let Err(e) = writer.write_all(&data) {
                            eprintln!("[PTY Thread] Write error: {}", e);
                            break;
                        }
                        if let Err(e) = writer.flush() {
                            eprintln!("[PTY Thread] Flush error: {}", e);
                        }
                    }
                    Ok(TerminalCommand::Resize(cols, rows)) => {
                        eprintln!("[PTY Thread] Resizing to {}x{}", cols, rows);
                        let _ = pair.master.resize(PtySize {
                            rows,
                            cols,
                            pixel_width: 0,
                            pixel_height: 0,
                        });
                    }
                    Ok(TerminalCommand::Close) => {
                        eprintln!("[PTY Thread] Close requested");
                        break;
                    }
                    Err(_) => {
                        eprintln!("[PTY Thread] Command channel closed");
                        break;
                    }
                }
            }

            // Cleanup - Force kill the child process and all its descendants
            drop(writer);
            
            // Get the process ID if available and use taskkill to terminate the entire process tree
            #[cfg(windows)]
            {
                if let Some(pid) = child.process_id() {
                    eprintln!("[PTY Thread] Killing process tree for PID: {}", pid);
                    let _ = std::process::Command::new("taskkill")
                        .args(["/PID", &pid.to_string(), "/T", "/F"])
                        .creation_flags(0x08000000) // CREATE_NO_WINDOW
                        .output();
                }
            }
            
            // Also try the regular kill
            if let Err(e) = child.kill() {
                eprintln!("[PTY Thread] Failed to kill child: {}", e);
            }
            
            // Wait for the child to fully terminate
            let _ = child.wait();
            
            *alive_clone.lock() = false;
            eprintln!("[PTY Thread] Thread exiting, child process terminated");
        });

        Ok(Self {
            id,
            shell_type,
            command_tx: cmd_tx,
            alive,
        })
    }

    fn write(&self, input: &[u8]) -> anyhow::Result<()> {
        self.command_tx
            .send(TerminalCommand::Write(input.to_vec()))?;
        Ok(())
    }

    fn resize(&self, cols: u16, rows: u16) -> anyhow::Result<()> {
        self.command_tx
            .send(TerminalCommand::Resize(cols, rows))?;
        Ok(())
    }

    fn is_alive(&self) -> bool {
        *self.alive.lock()
    }

    fn close(&self) {
        let _ = self.command_tx.send(TerminalCommand::Close);
    }
}

/// Terminal manager
pub struct TerminalManager {
    sessions: Arc<Mutex<HashMap<String, TerminalHandle>>>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_terminal(
        &self,
        shell_type: ShellType,
        cwd: Option<String>,
        log_file: Option<String>,
        app_handle: AppHandle,
    ) -> anyhow::Result<String> {
        let id = uuid::Uuid::new_v4().to_string();
        eprintln!(
            "[TerminalManager] Creating terminal {} with shell {:?}",
            id, shell_type
        );

        let handle = TerminalHandle::new(id.clone(), shell_type, cwd, log_file, app_handle)?;
        self.sessions.lock().insert(id.clone(), handle);

        eprintln!("[TerminalManager] Terminal {} created successfully", id);
        Ok(id)
    }

    pub fn write_to_terminal(&self, id: &str, input: &str) -> anyhow::Result<()> {
        let sessions = self.sessions.lock();
        if let Some(handle) = sessions.get(id) {
            handle.write(input.as_bytes())
        } else {
            Err(anyhow::anyhow!("Terminal not found: {}", id))
        }
    }

    pub fn close_terminal(&self, id: &str) -> anyhow::Result<()> {
        let mut sessions = self.sessions.lock();
        if let Some(handle) = sessions.remove(id) {
            handle.close();
            Ok(())
        } else {
            Err(anyhow::anyhow!("Terminal not found: {}", id))
        }
    }

    pub fn is_terminal_alive(&self, id: &str) -> bool {
        let sessions = self.sessions.lock();
        if let Some(handle) = sessions.get(id) {
            handle.is_alive()
        } else {
            false
        }
    }

    pub fn list_terminals(&self) -> Vec<String> {
        self.sessions.lock().keys().cloned().collect()
    }

    pub fn resize_terminal(&self, id: &str, cols: u16, rows: u16) -> anyhow::Result<()> {
        let sessions = self.sessions.lock();
        if let Some(handle) = sessions.get(id) {
            handle.resize(cols, rows)
        } else {
            Err(anyhow::anyhow!("Terminal not found: {}", id))
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

lazy_static::lazy_static! {
    pub static ref TERMINAL_MANAGER: TerminalManager = TerminalManager::new();
}
