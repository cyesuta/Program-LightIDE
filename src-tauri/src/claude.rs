//! Claude Agent SDK integration via Node.js sidecar
//!
//! Spawns a long-running Node.js process that uses @anthropic-ai/claude-agent-sdk.
//! Communication via stdin/stdout JSON lines.

use parking_lot::Mutex;
use serde::Serialize;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// Event sent to frontend
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeEvent {
    pub data: String, // raw JSON line from sidecar
}

/// Sidecar process manager
pub struct ClaudeSidecar {
    child: Option<Child>,
    stdin_tx: Option<std::sync::mpsc::Sender<String>>,
    is_running: bool,
}

impl Default for ClaudeSidecar {
    fn default() -> Self {
        Self {
            child: None,
            stdin_tx: None,
            is_running: false,
        }
    }
}

lazy_static::lazy_static! {
    pub static ref CLAUDE: Mutex<ClaudeSidecar> = Mutex::new(ClaudeSidecar::default());
}

/// Start the sidecar process
pub fn ensure_sidecar(app: &AppHandle) -> Result<(), String> {
    let mut claude = CLAUDE.lock();
    if claude.child.is_some() {
        return Ok(());
    }

    // Find sidecar script - try several locations
    let candidates = vec![
        std::path::PathBuf::from("../src/claude-sidecar.mjs"),
        std::env::current_dir()
            .unwrap_or_default()
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("src/claude-sidecar.mjs"),
        std::env::current_exe()
            .unwrap_or_default()
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("../src/claude-sidecar.mjs"),
    ];

    let script = candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .ok_or_else(|| format!("Sidecar script not found. Tried: {:?}", candidates))?;

    eprintln!("[Claude] Starting sidecar: {:?}", script);

    let mut cmd = Command::new("node");
    cmd.arg(&script)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let mut child = cmd.spawn().map_err(|e| format!("Failed to start sidecar: {}", e))?;

    // Take stdin and set up writer thread
    let stdin = child.stdin.take().ok_or("Failed to get stdin")?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();

    std::thread::spawn(move || {
        let mut stdin = stdin;
        while let Ok(line) = rx.recv() {
            if writeln!(stdin, "{}", line).is_err() {
                break;
            }
            let _ = stdin.flush();
        }
    });

    // Take stdout and set up reader thread
    let stdout = child.stdout.take().ok_or("Failed to get stdout")?;
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) if !line.trim().is_empty() => {
                    let _ = app_handle.emit("claude-event", ClaudeEvent { data: line });
                }
                Err(_) => break,
                _ => {}
            }
        }
        eprintln!("[Claude] Sidecar stdout reader ended");
    });

    // Stderr logging
    let stderr = child.stderr.take();
    if let Some(stderr) = stderr {
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(line) = line {
                    eprintln!("[Claude Sidecar] {}", line);
                }
            }
        });
    }

    claude.child = Some(child);
    claude.stdin_tx = Some(tx);

    Ok(())
}

/// Send a message to Claude
pub fn send_message(
    app: &AppHandle,
    message: &str,
    cwd: Option<&str>,
    workspace_id: Option<&str>,
    session_id: Option<&str>,
    model: Option<&str>,
    prompt_mode: Option<&str>,
    images: Option<serde_json::Value>,
    thinking: Option<bool>,
) -> Result<(), String> {
    ensure_sidecar(app)?;

    let claude = CLAUDE.lock();

    let cmd = serde_json::json!({
        "type": "send",
        "message": message,
        "cwd": cwd,
        "workspaceId": workspace_id.unwrap_or("default"),
        "sessionId": session_id,
        "model": model,
        "promptMode": prompt_mode,
        "images": images,
        "thinking": thinking.unwrap_or(false),
    });

    if let Some(tx) = &claude.stdin_tx {
        tx.send(cmd.to_string()).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Reset a specific workspace's session
pub fn reset_workspace(workspace_id: &str) {
    let claude = CLAUDE.lock();
    let cmd = serde_json::json!({
        "type": "reset",
        "workspaceId": workspace_id,
    });
    if let Some(tx) = &claude.stdin_tx {
        let _ = tx.send(cmd.to_string());
    }
}

/// Abort current request (legacy, workspace-agnostic)
pub fn abort() {
    let claude = CLAUDE.lock();
    let cmd = serde_json::json!({ "type": "abort" });
    if let Some(tx) = &claude.stdin_tx {
        let _ = tx.send(cmd.to_string());
    }
}

/// Abort a specific workspace's request
pub fn abort_workspace(workspace_id: &str) {
    let claude = CLAUDE.lock();
    let cmd = serde_json::json!({
        "type": "abort",
        "workspaceId": workspace_id,
    });
    if let Some(tx) = &claude.stdin_tx {
        let _ = tx.send(cmd.to_string());
    }
}

/// Kill sidecar and reset
pub fn reset(app: &AppHandle) {
    let mut claude = CLAUDE.lock();

    // Kill existing sidecar
    if let Some(mut child) = claude.child.take() {
        #[cfg(windows)]
        {
            if let Some(pid) = child.id().into() {
                let _ = Command::new("taskkill")
                    .args(["/PID", &pid.to_string(), "/T", "/F"])
                    .creation_flags(0x08000000)
                    .output();
            }
        }
        let _ = child.kill();
    }
    claude.stdin_tx = None;
    claude.is_running = false;

    drop(claude);

    // Restart sidecar
    let _ = ensure_sidecar(app);
}
