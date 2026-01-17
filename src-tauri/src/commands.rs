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
