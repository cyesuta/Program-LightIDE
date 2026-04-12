/**
 * LightIDE - Workspace Manager
 * Each workspace is an independent environment: own folder, documents,
 * editor state, claude chat, and claude session.
 */

class Workspace {
    constructor(id, name = '未命名') {
        this.id = id;
        this.name = name;

        // Project
        this.projectPath = null;
        this.projectName = null;

        // File tree state
        this.fileTree = [];
        this.expandedFolders = new Set();
        this.selectedPath = null;

        // Open documents
        this.documents = new Map();
        this.activeDocument = null;

        // Cursor
        this.cursorLine = 1;
        this.cursorColumn = 1;

        // Claude session ID (for SDK resume across restarts)
        this.claudeSessionId = null;
    }

    serialize() {
        return {
            id: this.id,
            name: this.name,
            projectPath: this.projectPath,
            projectName: this.projectName,
            claudeSessionId: this.claudeSessionId,
        };
    }

    static deserialize(data) {
        const ws = new Workspace(data.id, data.name);
        ws.projectPath = data.projectPath || null;
        ws.projectName = data.projectName || null;
        ws.claudeSessionId = data.claudeSessionId || null;
        return ws;
    }

    // Snapshot current global state into this workspace
    captureFrom(state) {
        this.projectPath = state.projectPath;
        this.projectName = state.projectName;
        this.fileTree = state.fileTree;
        this.expandedFolders = new Set(state.expandedFolders);
        this.selectedPath = state.selectedPath;
        this.documents = new Map(state.documents);
        this.activeDocument = state.activeDocument;
        this.cursorLine = state.cursorLine;
        this.cursorColumn = state.cursorColumn;
    }

    // Restore this workspace into global state
    restoreTo(state, chatComponent) {
        state.projectPath = this.projectPath;
        state.projectName = this.projectName;
        state.fileTree = this.fileTree;
        state.expandedFolders = new Set(this.expandedFolders);
        state.selectedPath = this.selectedPath;
        state.documents = new Map(this.documents);
        state.activeDocument = this.activeDocument;
        state.cursorLine = this.cursorLine;
        state.cursorColumn = this.cursorColumn;

        // Emit events to refresh UI
        state.emit('fileTreeChanged', state.fileTree);
        state.emit('projectChanged', { path: this.projectPath, name: this.projectName });

        // Refresh editor — show active document or welcome screen
        if (state.activeDocument && state.documents.has(state.activeDocument)) {
            state.emit('activeDocumentChanged', state.documents.get(state.activeDocument));
        } else {
            // No active document — trigger a "closed" state
            state.emit('documentClosed', null);
        }
        // Update editor tabs
        if (typeof editor !== 'undefined' && editor?.updateTabs) {
            editor.updateTabs();
        }

        // Switch Claude chat view to this workspace
        if (chatComponent?.switchToWorkspace) {
            chatComponent.switchToWorkspace(this.id);
        }
    }

    getDisplayName() {
        return this.projectName || this.name;
    }
}

class WorkspaceManager {
    constructor() {
        this.workspaces = [];
        this.activeId = null;
        this.idCounter = 0;
        this.tabBarEl = null;
        this.STORAGE_KEY = 'lightide-workspaces';
        this.CHAT_STORAGE_KEY = 'lightide-claude-chats';
        this._saveTimer = null;
    }

    async init() {
        this.tabBarEl = document.getElementById('workspaceTabs');
        if (!this.tabBarEl) return;

        // New tab button
        const addBtn = document.getElementById('addWorkspaceBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.createWorkspace());
        }

        // Try to restore from localStorage
        const restored = await this.restore();
        if (!restored) {
            // No saved workspaces, create default
            this.createWorkspace();
        }
    }

    save() {
        try {
            // Capture current workspace state before saving
            if (this.activeId) {
                const current = this.workspaces.find(w => w.id === this.activeId);
                if (current) current.captureFrom(state);
            }

            const data = {
                workspaces: this.workspaces.map(w => w.serialize()),
                activeId: this.activeId,
                idCounter: this.idCounter,
            };
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to save workspaces:', e);
        }
    }

    saveDebounced() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this.save(), 300);
    }

    saveChatHTML(workspaceId, html, tokens) {
        try {
            const all = JSON.parse(localStorage.getItem(this.CHAT_STORAGE_KEY) || '{}');
            all[workspaceId] = { html, tokens };
            localStorage.setItem(this.CHAT_STORAGE_KEY, JSON.stringify(all));
        } catch (e) {
            console.error('Failed to save chat:', e);
        }
    }

    loadChatHTML(workspaceId) {
        try {
            const all = JSON.parse(localStorage.getItem(this.CHAT_STORAGE_KEY) || '{}');
            return all[workspaceId] || null;
        } catch {
            return null;
        }
    }

    deleteChatHTML(workspaceId) {
        try {
            const all = JSON.parse(localStorage.getItem(this.CHAT_STORAGE_KEY) || '{}');
            delete all[workspaceId];
            localStorage.setItem(this.CHAT_STORAGE_KEY, JSON.stringify(all));
        } catch {}
    }

    async restore() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            if (!data.workspaces || data.workspaces.length === 0) return false;

            this.idCounter = data.idCounter || 0;

            // Recreate workspaces
            for (const wsData of data.workspaces) {
                const ws = Workspace.deserialize(wsData);
                this.workspaces.push(ws);

                // Pre-create chat view and restore HTML
                const chat = window.app?.claudeChat;
                if (chat) {
                    const view = chat.getOrCreateView(ws.id);
                    view.hide();
                    const saved = this.loadChatHTML(ws.id);
                    if (saved && saved.html) {
                        view.messagesEl.innerHTML = saved.html;
                        if (saved.tokens) view.totalTokens = saved.tokens;
                    }
                }
            }

            // Switch to active workspace
            const activeId = data.activeId || this.workspaces[0].id;
            this.activeId = null; // Force switch
            await this.switchTo(activeId);
            this.renderTabs();
            return true;
        } catch (e) {
            console.error('Failed to restore workspaces:', e);
            return false;
        }
    }

    createWorkspace() {
        const id = `ws-${++this.idCounter}`;
        const ws = new Workspace(id);
        this.workspaces.push(ws);
        this.renderTabs();
        this.switchTo(id);
        this.save();
        return ws;
    }

    async switchTo(id) {
        if (this.activeId === id) return;

        // Save current workspace state
        if (this.activeId) {
            const current = this.workspaces.find(w => w.id === this.activeId);
            if (current) {
                current.captureFrom(state);
                // Save current chat HTML
                this.saveChatViewState(this.activeId);
            }
        }

        // Load target workspace
        const target = this.workspaces.find(w => w.id === id);
        if (!target) return;

        this.activeId = id;
        target.restoreTo(state, window.app?.claudeChat);

        // If target has projectPath, load file tree from disk
        if (target.projectPath && typeof fileTree !== 'undefined') {
            try {
                await fileTree.loadDirectory(target.projectPath);
            } catch (e) {
                console.error('Failed to load directory:', e);
            }
        }

        this.renderTabs();
        this.save();
    }

    saveChatViewState(workspaceId) {
        const chat = window.app?.claudeChat;
        if (!chat) return;
        const view = chat.views.get(workspaceId);
        if (!view) return;
        this.saveChatHTML(workspaceId, view.messagesEl.innerHTML, view.totalTokens);
    }

    closeWorkspace(id) {
        if (this.workspaces.length <= 1) return; // Keep at least one

        const idx = this.workspaces.findIndex(w => w.id === id);
        if (idx < 0) return;

        // Send reset command to sidecar to clear session
        if (window.__TAURI__?.core?.invoke) {
            window.__TAURI__.core.invoke('claude_reset_workspace', { workspaceId: id }).catch(() => {});
        }

        // Remove chat view and saved chat
        const chat = window.app?.claudeChat;
        if (chat) chat.removeWorkspace(id);
        this.deleteChatHTML(id);

        this.workspaces.splice(idx, 1);

        // If closing active, switch to another
        if (this.activeId === id) {
            const newIdx = Math.min(idx, this.workspaces.length - 1);
            this.activeId = null; // Force switch
            this.switchTo(this.workspaces[newIdx].id);
        } else {
            this.renderTabs();
        }
        this.save();
    }

    renderTabs() {
        if (!this.tabBarEl) return;

        this.tabBarEl.innerHTML = '';
        for (const ws of this.workspaces) {
            const tab = document.createElement('div');
            tab.className = 'workspace-tab' + (ws.id === this.activeId ? ' active' : '');
            tab.dataset.wsId = ws.id;
            tab.innerHTML = `
                <span class="ws-tab-name">${this.esc(ws.getDisplayName())}</span>
                ${this.workspaces.length > 1 ? '<button class="ws-tab-close" title="關閉">×</button>' : ''}
            `;

            tab.addEventListener('click', (e) => {
                if (!e.target.classList.contains('ws-tab-close')) {
                    this.switchTo(ws.id);
                }
            });

            const closeBtn = tab.querySelector('.ws-tab-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.closeWorkspace(ws.id);
                });
            }

            this.tabBarEl.appendChild(tab);
        }
    }

    getActive() {
        return this.workspaces.find(w => w.id === this.activeId);
    }

    esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }
}

let workspaceManager;
