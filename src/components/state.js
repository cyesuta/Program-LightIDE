/**
 * LightIDE - Application State Management
 */

class AppState {
    constructor() {
        // Current project directory
        this.projectPath = null;
        this.projectName = null;

        // File tree state
        this.fileTree = [];
        this.expandedFolders = new Set();
        this.selectedPath = null;

        // Open documents
        this.documents = new Map();
        this.activeDocument = null;

        // Editor state
        this.cursorLine = 1;
        this.cursorColumn = 1;

        // UI state
        this.leftPanelWidth = 220;
        this.rightPanelWidth = 420;
        this.rightPanelVisible = true;

        // Event listeners
        this.listeners = new Map();
    }

    // Event system
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    // Project management
    setProject(path, name) {
        this.projectPath = path;
        this.projectName = name;
        this.emit('projectChanged', { path, name });
    }

    // File tree management
    setFileTree(tree) {
        this.fileTree = tree;
        this.emit('fileTreeChanged', tree);
    }

    toggleFolder(path) {
        if (this.expandedFolders.has(path)) {
            this.expandedFolders.delete(path);
        } else {
            this.expandedFolders.add(path);
        }
        this.emit('folderToggled', path);
    }

    isFolderExpanded(path) {
        return this.expandedFolders.has(path);
    }

    setSelectedPath(path) {
        const oldPath = this.selectedPath;
        this.selectedPath = path;
        this.emit('selectionChanged', { oldPath, newPath: path });
    }

    // Document management
    openDocument(path, content, language) {
        const doc = {
            path,
            content,
            language,
            modified: false,
            cursorLine: 1,
            cursorColumn: 1
        };
        this.documents.set(path, doc);
        this.activeDocument = path;
        this.emit('documentOpened', doc);
        this.emit('activeDocumentChanged', doc);
    }

    closeDocument(path) {
        this.documents.delete(path);
        if (this.activeDocument === path) {
            const remaining = Array.from(this.documents.keys());
            this.activeDocument = remaining.length > 0 ? remaining[remaining.length - 1] : null;
        }
        this.emit('documentClosed', path);
        if (this.activeDocument) {
            this.emit('activeDocumentChanged', this.documents.get(this.activeDocument));
        }
    }

    setActiveDocument(path) {
        if (this.documents.has(path)) {
            this.activeDocument = path;
            this.emit('activeDocumentChanged', this.documents.get(path));
        }
    }

    getActiveDocument() {
        return this.activeDocument ? this.documents.get(this.activeDocument) : null;
    }

    updateDocumentContent(path, content) {
        if (this.documents.has(path)) {
            const doc = this.documents.get(path);
            doc.content = content;
            doc.modified = true;
            this.emit('documentModified', doc);
        }
    }

    markDocumentSaved(path) {
        if (this.documents.has(path)) {
            const doc = this.documents.get(path);
            doc.modified = false;
            this.emit('documentSaved', doc);
        }
    }

    // Cursor management
    setCursor(line, column) {
        this.cursorLine = line;
        this.cursorColumn = column;
        this.emit('cursorChanged', { line, column });
    }
}

// Global state instance
const state = new AppState();
