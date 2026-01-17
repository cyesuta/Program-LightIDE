//! Editor state management
//!
//! Handles document state, undo/redo, and editing operations

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// Represents an open document
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Document {
    pub path: String,
    pub content: String,
    pub language: Option<String>,
    pub modified: bool,
    pub cursor_line: usize,
    pub cursor_column: usize,
}

impl Document {
    pub fn new(path: String, content: String, language: Option<String>) -> Self {
        Self {
            path,
            content,
            language,
            modified: false,
            cursor_line: 0,
            cursor_column: 0,
        }
    }
}

/// Editor state manager
#[derive(Debug, Default)]
pub struct EditorState {
    /// Open documents
    pub documents: HashMap<String, Document>,
    /// Currently active document path
    pub active_document: Option<String>,
}

impl EditorState {
    pub fn new() -> Self {
        Self::default()
    }

    /// Open a document
    pub fn open_document(&mut self, path: String, content: String, language: Option<String>) {
        let doc = Document::new(path.clone(), content, language);
        self.documents.insert(path.clone(), doc);
        self.active_document = Some(path);
    }

    /// Close a document
    pub fn close_document(&mut self, path: &str) {
        self.documents.remove(path);
        if self.active_document.as_deref() == Some(path) {
            self.active_document = self.documents.keys().next().cloned();
        }
    }

    /// Get the active document
    pub fn get_active_document(&self) -> Option<&Document> {
        self.active_document
            .as_ref()
            .and_then(|path| self.documents.get(path))
    }

    /// Update document content
    pub fn update_content(&mut self, path: &str, content: String) {
        if let Some(doc) = self.documents.get_mut(path) {
            doc.content = content;
            doc.modified = true;
        }
    }

    /// Mark document as saved
    pub fn mark_saved(&mut self, path: &str) {
        if let Some(doc) = self.documents.get_mut(path) {
            doc.modified = false;
        }
    }
}
