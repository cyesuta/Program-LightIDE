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
        this.CHAT_STORAGE_KEY = 'lightide-claude-chats'; // legacy localStorage key, kept for migration
        this.IDB_NAME = 'lightide';
        this.IDB_STORE = 'chats';
        this.MAX_DIFF_LINES_STORED = 200;
        this._saveTimer = null;
        this._dbPromise = null;
    }

    async init() {
        this.tabBarEl = document.getElementById('workspaceTabs');
        if (!this.tabBarEl) return;

        // New tab button
        const addBtn = document.getElementById('addWorkspaceBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => this.createWorkspace());
        }

        // One-time migration from old localStorage chat blob → IndexedDB (per-workspace key)
        await this._migrateChatStorage();

        // Try to restore from localStorage
        const restored = await this.restore();
        if (!restored) {
            // No saved workspaces, create default
            this.createWorkspace();
        }
    }

    // ---------- IndexedDB helpers (per-workspace, gzip-compressed) ----------

    _openDB() {
        if (this._dbPromise) return this._dbPromise;
        this._dbPromise = new Promise((resolve, reject) => {
            const req = indexedDB.open(this.IDB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(this.IDB_STORE)) {
                    db.createObjectStore(this.IDB_STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        return this._dbPromise;
    }

    async _idbPut(key, value) {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.IDB_STORE, 'readwrite');
            tx.objectStore(this.IDB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error);
        });
    }

    async _idbGet(key) {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.IDB_STORE, 'readonly');
            const req = tx.objectStore(this.IDB_STORE).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    async _idbDelete(key) {
        const db = await this._openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(this.IDB_STORE, 'readwrite');
            tx.objectStore(this.IDB_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // gzip-compress a string into a Uint8Array. IDB stores Uint8Array natively
    // — no base64 step needed (and it would only inflate the size by ~33%).
    async _compress(text) {
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(new TextEncoder().encode(text));
        writer.close();
        const buf = await new Response(cs.readable).arrayBuffer();
        return new Uint8Array(buf);
    }

    async _decompress(bytes) {
        const ds = new DecompressionStream('gzip');
        const writer = ds.writable.getWriter();
        writer.write(bytes);
        writer.close();
        const buf = await new Response(ds.readable).arrayBuffer();
        return new TextDecoder().decode(buf);
    }

    // Trim huge diff blocks before storing — single Write of a 1k-line file
    // would otherwise persist 1000 <div class="diff-line"> rows. We keep the
    // first N lines and append a hint. Live UI is not affected.
    _truncateDiffsForStorage(html) {
        try {
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const max = this.MAX_DIFF_LINES_STORED;
            for (const block of tmp.querySelectorAll('.diff-block')) {
                const lines = Array.from(block.querySelectorAll('.diff-line'));
                if (lines.length <= max) continue;
                const removed = lines.length - max;
                for (let i = max; i < lines.length; i++) lines[i].remove();
                const note = document.createElement('div');
                note.className = 'diff-truncated';
                note.textContent = `... (儲存時截斷 ${removed} 行)`;
                block.appendChild(note);
            }
            return tmp.innerHTML;
        } catch {
            return html;
        }
    }

    async _migrateChatStorage() {
        try {
            const raw = localStorage.getItem(this.CHAT_STORAGE_KEY);
            if (!raw) return;
            const all = JSON.parse(raw);
            for (const [wsId, entry] of Object.entries(all || {})) {
                if (entry?.html) {
                    const html = this._truncateDiffsForStorage(entry.html);
                    const compressed = await this._compress(html);
                    await this._idbPut(wsId, { html: compressed, tokens: entry.tokens || null, v: 1 });
                }
            }
            localStorage.removeItem(this.CHAT_STORAGE_KEY);
            console.log('[migration] Chat HTML moved from localStorage to IndexedDB');
        } catch (e) {
            console.warn('[migration] Skipped:', e);
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

    async saveChatHTML(workspaceId, html, tokens) {
        try {
            const trimmed = this._truncateDiffsForStorage(html);
            const compressed = await this._compress(trimmed);
            await this._idbPut(workspaceId, { html: compressed, tokens, v: 1 });
        } catch (e) {
            console.error('Failed to save chat:', e);
        }
    }

    async loadChatHTML(workspaceId) {
        try {
            const entry = await this._idbGet(workspaceId);
            if (!entry) return null;
            // v1: html is gzip Uint8Array. Pre-v1 (shouldn't exist after migration): plain string.
            if (entry.html instanceof Uint8Array) {
                const html = await this._decompress(entry.html);
                return { html, tokens: entry.tokens };
            }
            return { html: entry.html || '', tokens: entry.tokens };
        } catch (e) {
            console.warn('Failed to load chat:', e);
            return null;
        }
    }

    async deleteChatHTML(workspaceId) {
        try {
            await this._idbDelete(workspaceId);
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
                    const saved = await this.loadChatHTML(ws.id);
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

            // Scroll all chat views to the bottom so user sees the latest messages
            const chat = window.app?.claudeChat;
            if (chat) {
                // Use requestAnimationFrame + timeout to ensure layout is ready
                setTimeout(() => {
                    for (const view of chat.views.values()) {
                        if (view.messagesEl) {
                            view.messagesEl.scrollTop = view.messagesEl.scrollHeight;
                        }
                    }
                }, 100);
            }
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

    async closeWorkspace(id) {
        if (this.workspaces.length <= 1) return; // Keep at least one

        const idx = this.workspaces.findIndex(w => w.id === id);
        if (idx < 0) return;

        const ws = this.workspaces[idx];
        // Confirm before closing
        const chat = window.app?.claudeChat;
        const confirmFn = chat?.showConfirm?.bind(chat);
        if (confirmFn) {
            const ok = await confirmFn({
                icon: '⚠️',
                title: '關閉工作區',
                body: `關閉「${ws.getDisplayName()}」？\n此工作區的對話記錄與 Claude session 將被清除。`,
                confirmText: '關閉',
                cancelText: '取消',
            });
            if (!ok) return;
        } else if (!confirm(`確定要關閉「${ws.getDisplayName()}」嗎？`)) {
            return;
        }

        // Send reset command to sidecar to clear session
        if (window.__TAURI__?.core?.invoke) {
            window.__TAURI__.core.invoke('claude_reset_workspace', { workspaceId: id }).catch(() => {});
        }

        // Remove chat view and saved chat
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

    reorder(fromId, toId, placeBefore) {
        if (fromId === toId) return;
        const fromIdx = this.workspaces.findIndex(w => w.id === fromId);
        const toIdx = this.workspaces.findIndex(w => w.id === toId);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = this.workspaces.splice(fromIdx, 1);
        // Recompute target after splice
        let newIdx = this.workspaces.findIndex(w => w.id === toId);
        if (newIdx < 0) newIdx = this.workspaces.length;
        if (!placeBefore) newIdx += 1;
        this.workspaces.splice(newIdx, 0, moved);
        this.renderTabs();
        this.save();
    }

    renderTabs() {
        if (!this.tabBarEl) return;

        this.tabBarEl.innerHTML = '';
        for (const ws of this.workspaces) {
            const tab = document.createElement('div');
            tab.className = 'workspace-tab' + (ws.id === this.activeId ? ' active' : '');
            tab.dataset.wsId = ws.id;
            tab.draggable = true;
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

            // Drag and drop for reordering
            tab.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/x-ws-id', ws.id);
                tab.classList.add('dragging');
            });
            tab.addEventListener('dragend', () => {
                tab.classList.remove('dragging');
                this.tabBarEl.querySelectorAll('.workspace-tab').forEach(t => {
                    t.classList.remove('drag-over-left', 'drag-over-right');
                });
            });
            tab.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = tab.getBoundingClientRect();
                const before = (e.clientX - rect.left) < rect.width / 2;
                tab.classList.toggle('drag-over-left', before);
                tab.classList.toggle('drag-over-right', !before);
            });
            tab.addEventListener('dragleave', () => {
                tab.classList.remove('drag-over-left', 'drag-over-right');
            });
            tab.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromId = e.dataTransfer.getData('text/x-ws-id');
                if (!fromId) return;
                const rect = tab.getBoundingClientRect();
                const before = (e.clientX - rect.left) < rect.width / 2;
                tab.classList.remove('drag-over-left', 'drag-over-right');
                this.reorder(fromId, ws.id, before);
            });

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
