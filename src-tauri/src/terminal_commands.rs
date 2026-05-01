//! Terminal Tauri commands
//!
//! Exposes terminal functionality to the frontend.
//! Output is pushed via Tauri events (terminal-output, terminal-exit).

use crate::terminal::{ShellType, TERMINAL_MANAGER};
use crate::commands::CommandResult;
use serde::{Deserialize, Serialize};
use tauri::{command, AppHandle};

/// Terminal info returned to frontend
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalInfo {
    pub id: String,
    pub shell_type: String,
}

/// Create a new terminal session.
/// Output will be pushed to the frontend via `terminal-output` events.
#[command]
pub async fn create_terminal(
    app: AppHandle,
    shell: String,
    cwd: Option<String>,
    log_file: Option<String>,
) -> CommandResult<TerminalInfo> {
    let shell_type = match shell.to_lowercase().as_str() {
        "powershell" | "ps" => ShellType::PowerShell,
        "cmd" => ShellType::Cmd,
        "gitbash" | "git-bash" => ShellType::GitBash,
        // "bash" historically meant Git Bash on Windows; on Unix it's actual bash.
        "bash" => {
            #[cfg(windows)]
            { ShellType::GitBash }
            #[cfg(not(windows))]
            { ShellType::Bash }
        }
        "zsh" => ShellType::Zsh,
        "sh" => ShellType::Sh,
        _ => ShellType::default_for_platform(),
    };

    match TERMINAL_MANAGER.create_terminal(shell_type, cwd, log_file, app) {
        Ok(id) => CommandResult::ok(TerminalInfo {
            id,
            shell_type: shell,
        }),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Write input to terminal
#[command]
pub async fn write_terminal(id: String, input: String) -> CommandResult<()> {
    match TERMINAL_MANAGER.write_to_terminal(&id, &input) {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Resize terminal
#[command]
pub async fn resize_terminal(id: String, cols: u16, rows: u16) -> CommandResult<()> {
    match TERMINAL_MANAGER.resize_terminal(&id, cols, rows) {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Close terminal session
#[command]
pub async fn close_terminal(id: String) -> CommandResult<()> {
    match TERMINAL_MANAGER.close_terminal(&id) {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Check if terminal is alive
#[command]
pub async fn is_terminal_alive(id: String) -> CommandResult<bool> {
    CommandResult::ok(TERMINAL_MANAGER.is_terminal_alive(&id))
}

/// List all terminals
#[command]
pub async fn list_terminals() -> CommandResult<Vec<String>> {
    CommandResult::ok(TERMINAL_MANAGER.list_terminals())
}
