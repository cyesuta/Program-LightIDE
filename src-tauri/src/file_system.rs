//! File system operations for LightIDE
//!
//! Handles directory reading and file tree management

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use walkdir::WalkDir;

/// Represents a file or directory entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub extension: Option<String>,
    pub children: Option<Vec<FileEntry>>,
}

impl FileEntry {
    /// Create a new FileEntry from a path
    pub fn from_path(path: &Path) -> Option<Self> {
        let name = path.file_name()?.to_string_lossy().to_string();
        let is_dir = path.is_dir();
        let extension = if is_dir {
            None
        } else {
            path.extension().map(|s| s.to_string_lossy().to_string())
        };

        Some(Self {
            name,
            path: path.to_string_lossy().to_string(),
            is_dir,
            extension,
            children: None,
        })
    }

    /// Get icon name for this file type
    pub fn icon(&self) -> &'static str {
        if self.is_dir {
            "folder"
        } else {
            match self.extension.as_deref() {
                Some("rs") => "rust",
                Some("js") | Some("jsx") => "javascript",
                Some("ts") | Some("tsx") => "typescript",
                Some("py") => "python",
                Some("go") => "go",
                Some("html") | Some("htm") => "html",
                Some("css") | Some("scss") | Some("sass") => "css",
                Some("json") => "json",
                Some("toml") | Some("yaml") | Some("yml") => "config",
                Some("md") | Some("markdown") => "markdown",
                _ => "file",
            }
        }
    }
}

/// File system utilities
pub struct FileSystem;

impl FileSystem {
    /// Read a directory and return its entries (one level deep)
    pub fn read_directory(path: &Path) -> anyhow::Result<Vec<FileEntry>> {
        let mut entries = Vec::new();
        let mut dirs = Vec::new();
        let mut files = Vec::new();

        for entry in std::fs::read_dir(path)? {
            let entry = entry?;
            let path = entry.path();

            // Skip hidden files and common ignored directories
            if let Some(name) = path.file_name() {
                let name_str = name.to_string_lossy();
                if name_str.starts_with('.')
                    || name_str == "node_modules"
                    || name_str == "target"
                    || name_str == "__pycache__"
                    || name_str == ".git"
                {
                    continue;
                }
            }

            if let Some(entry) = FileEntry::from_path(&path) {
                if entry.is_dir {
                    dirs.push(entry);
                } else {
                    files.push(entry);
                }
            }
        }

        // Sort alphabetically (directories first, then files)
        dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

        entries.extend(dirs);
        entries.extend(files);

        Ok(entries)
    }

    /// Check if a file is a text file that can be edited
    pub fn is_text_file(path: &Path) -> bool {
        let text_extensions = [
            "rs", "js", "jsx", "ts", "tsx", "py", "go", "c", "cpp", "h", "hpp",
            "java", "kt", "swift", "rb", "php", "html", "htm", "css", "scss",
            "sass", "json", "toml", "yaml", "yml", "xml", "md", "markdown",
            "txt", "sh", "bash", "zsh", "ps1", "bat", "cmd", "sql", "lua",
            "vim", "gitignore", "env", "lock",
        ];

        if let Some(ext) = path.extension() {
            let ext_str = ext.to_string_lossy().to_lowercase();
            return text_extensions.contains(&ext_str.as_str());
        }

        // Check for files without extension
        if let Some(name) = path.file_name() {
            let name_str = name.to_string_lossy().to_lowercase();
            let special_files = [
                "makefile", "dockerfile", "rakefile", "gemfile", "procfile",
                "readme", "license", "changelog", "authors", "contributing",
            ];
            return special_files.contains(&name_str.as_str());
        }

        false
    }

    /// Get language identifier for syntax highlighting
    pub fn get_language(path: &Path) -> Option<&'static str> {
        path.extension().and_then(|ext| {
            match ext.to_string_lossy().to_lowercase().as_str() {
                "rs" => Some("rust"),
                "js" | "jsx" => Some("javascript"),
                "ts" | "tsx" => Some("typescript"),
                "py" => Some("python"),
                "go" => Some("go"),
                "c" | "h" => Some("c"),
                "cpp" | "hpp" | "cc" | "cxx" => Some("cpp"),
                "java" => Some("java"),
                "html" | "htm" => Some("html"),
                "css" | "scss" | "sass" => Some("css"),
                "json" => Some("json"),
                "toml" => Some("toml"),
                "yaml" | "yml" => Some("yaml"),
                "md" | "markdown" => Some("markdown"),
                "sql" => Some("sql"),
                "sh" | "bash" | "zsh" => Some("bash"),
                "ps1" => Some("powershell"),
                _ => None,
            }
        })
    }
}
