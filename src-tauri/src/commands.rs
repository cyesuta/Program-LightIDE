//! Tauri commands for LightIDE
//! 
//! Defines all the IPC commands callable from the frontend

use crate::file_system::{FileEntry, FileSystem};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::command;

/// Result type for commands
#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

impl<T> CommandResult<T> {
    pub fn ok(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn err(msg: &str) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(msg.to_string()),
        }
    }
}

/// Open a directory and return its path
#[command]
pub async fn open_directory(path: String) -> CommandResult<String> {
    let path_buf = PathBuf::from(&path);
    if path_buf.exists() && path_buf.is_dir() {
        CommandResult::ok(path)
    } else {
        CommandResult::err("Directory does not exist")
    }
}

/// Get the file tree for a directory
#[command]
pub async fn get_file_tree(path: String) -> CommandResult<Vec<FileEntry>> {
    match FileSystem::read_directory(&PathBuf::from(&path)) {
        Ok(entries) => CommandResult::ok(entries),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Read a file's contents
#[command]
pub async fn read_file(path: String) -> CommandResult<String> {
    match std::fs::read_to_string(&path) {
        Ok(content) => CommandResult::ok(content),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Save content to a file
#[command]
pub async fn save_file(path: String, content: String) -> CommandResult<()> {
    match std::fs::write(&path, &content) {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Create a new file
#[command]
pub async fn create_file(path: String) -> CommandResult<()> {
    match std::fs::File::create(&path) {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Create a new directory
#[command]
pub async fn create_directory(path: String) -> CommandResult<()> {
    match std::fs::create_dir_all(&path) {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Delete a file or directory
#[command]
pub async fn delete_path(path: String) -> CommandResult<()> {
    let path_buf = PathBuf::from(&path);
    let result = if path_buf.is_dir() {
        std::fs::remove_dir_all(&path)
    } else {
        std::fs::remove_file(&path)
    };

    match result {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Rename/move a file or directory
#[command]
pub async fn rename_path(old_path: String, new_path: String) -> CommandResult<()> {
    match std::fs::rename(&old_path, &new_path) {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e.to_string()),
    }
}

/// Save a base64 image to project directory and return the path
#[command]
pub async fn save_temp_image(base64_data: String, filename: String, project_path: Option<String>) -> CommandResult<String> {
    use base64::{Engine, engine::general_purpose::STANDARD};
    
    // Decode base64
    let image_data = match STANDARD.decode(&base64_data) {
        Ok(data) => data,
        Err(e) => return CommandResult::err(&format!("Base64 decode error: {}", e)),
    };
    
    // Determine save directory - use project path if available, otherwise temp
    let save_dir = if let Some(proj_path) = project_path {
        PathBuf::from(proj_path).join(".lightide").join("images")
    } else {
        std::env::temp_dir().join("lightide_images")
    };
    
    if let Err(e) = std::fs::create_dir_all(&save_dir) {
        return CommandResult::err(&format!("Failed to create dir: {}", e));
    }
    
    // Save file
    let file_path = save_dir.join(&filename);
    match std::fs::write(&file_path, &image_data) {
        Ok(_) => CommandResult::ok(file_path.to_string_lossy().to_string()),
        Err(e) => CommandResult::err(&format!("Failed to write file: {}", e)),
    }
}

// ============================================
// Claude SDK commands
// ============================================

/// Send a message to Claude via Agent SDK sidecar
#[command]
pub async fn claude_send_message(
    app: tauri::AppHandle,
    message: String,
    cwd: Option<String>,
    workspace_id: Option<String>,
    session_id: Option<String>,
) -> CommandResult<()> {
    match crate::claude::send_message(
        &app,
        &message,
        cwd.as_deref(),
        workspace_id.as_deref(),
        session_id.as_deref(),
    ) {
        Ok(_) => CommandResult::ok(()),
        Err(e) => CommandResult::err(&e),
    }
}

/// Abort current Claude request
#[command]
pub async fn claude_abort() -> CommandResult<()> {
    crate::claude::abort();
    CommandResult::ok(())
}

/// Abort a specific workspace's Claude request
#[command]
pub async fn claude_abort_workspace(workspace_id: String) -> CommandResult<()> {
    crate::claude::abort_workspace(&workspace_id);
    CommandResult::ok(())
}

/// Reset a workspace's Claude session
#[command]
pub async fn claude_reset_workspace(workspace_id: String) -> CommandResult<()> {
    crate::claude::reset_workspace(&workspace_id);
    CommandResult::ok(())
}
