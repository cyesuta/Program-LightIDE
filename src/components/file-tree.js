/**
 * LightIDE - File Tree Component
 */

class FileTreeComponent {
    constructor() {
        this.container = document.getElementById('fileTree');
        this.contextMenu = null;
        this.init();
    }

    init() {
        // Listen for state changes
        state.on('fileTreeChanged', () => this.render());
        state.on('folderToggled', () => this.render());
        state.on('selectionChanged', (data) => this.updateSelection(data?.oldPath, data?.newPath));

        // Event delegation — single listener for all tree items
        this.container.addEventListener('click', (e) => {
            // Ignore clicks while an inline edit input is active
            if (e.target.closest('.tree-edit-input')) return;
            const el = e.target.closest('.tree-item');
            if (!el || el.classList.contains('tree-item-editing')) return;
            const path = el.dataset.path;
            const item = this.findItemByPath(state.fileTree, path);
            if (item) this.handleItemClick(item);
        });
        this.container.addEventListener('dblclick', (e) => {
            if (e.target.closest('.tree-edit-input')) return;
            const el = e.target.closest('.tree-item');
            if (!el) return;
            e.preventDefault();
            const item = this.findItemByPath(state.fileTree, el.dataset.path);
            if (item) this.rename(item);
        });
        this.container.addEventListener('auxclick', (e) => {
            if (e.button !== 1) return;
            const el = e.target.closest('.tree-item');
            if (!el) return;
            e.preventDefault();
            const item = this.findItemByPath(state.fileTree, el.dataset.path);
            if (item) this.copyPath(item);
        });
        this.container.addEventListener('contextmenu', (e) => {
            const el = e.target.closest('.tree-item');
            if (!el) {
                // Right-click on empty area → menu for project root
                if (state.projectPath) {
                    e.preventDefault();
                    this.showContextMenu(e, { path: state.projectPath, name: '', isDir: true, isRoot: true });
                }
                return;
            }
            e.preventDefault();
            const item = this.findItemByPath(state.fileTree, el.dataset.path);
            if (item) this.showContextMenu(e, item);
        });

        // Close context menu on click elsewhere
        document.addEventListener('click', () => this.hideContextMenu());

        // Refresh button
        const refreshBtn = document.getElementById('refreshFileTree');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                if (state.projectPath) {
                    this.loadDirectory(state.projectPath);
                }
            });
        }

        // New folder button (root-level)
        const newFolderBtn = document.getElementById('newFolderBtn');
        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', () => {
                if (state.projectPath) this.beginCreate(state.projectPath, true);
            });
        }
        // New file button (root-level)
        const newFileBtn = document.getElementById('newFileBtn');
        if (newFileBtn) {
            newFileBtn.addEventListener('click', () => {
                if (state.projectPath) this.beginCreate(state.projectPath, false);
            });
        }
    }

    // Path helpers — work with both \ and / separators
    pathSep(p) {
        return p.includes('\\') ? '\\' : '/';
    }
    parentDir(p) {
        const sep = this.pathSep(p);
        const idx = p.lastIndexOf(sep);
        return idx > 0 ? p.substring(0, idx) : p;
    }
    joinPath(parent, name) {
        const sep = this.pathSep(parent);
        return parent.endsWith(sep) ? parent + name : parent + sep + name;
    }

    findItemByPath(items, path) {
        for (const item of items) {
            if (item.path === path) return item;
            if (item.children) {
                const found = this.findItemByPath(item.children, path);
                if (found) return found;
            }
        }
        return null;
    }

    async loadDirectory(path) {
        try {
            const result = await window.__TAURI__.core.invoke('get_file_tree', { path });
            if (result.success) {
                state.setFileTree(result.data);
            } else {
                console.error('Failed to load directory:', result.error);
            }
        } catch (error) {
            console.error('Error loading directory:', error);
        }
    }

    updateSelection(oldPath, newPath) {
        if (oldPath) {
            const oldEl = this.container.querySelector(`[data-path="${CSS.escape(oldPath)}"]`);
            if (oldEl) oldEl.classList.remove('selected');
        }
        if (newPath) {
            const newEl = this.container.querySelector(`[data-path="${CSS.escape(newPath)}"]`);
            if (newEl) newEl.classList.add('selected');
        }
    }

    render() {
        if (state.fileTree.length === 0) {
            this.container.innerHTML = `
                <div class="empty-state">
                    <p>📂 開啟目錄</p>
                    <p class="hint">使用 Ctrl+O 開啟一個專案目錄</p>
                </div>
            `;
            return;
        }

        const parts = [];
        const pendingLoads = [];
        this.buildHTML(state.fileTree, 0, parts, pendingLoads);
        this.container.innerHTML = parts.join('');
        pendingLoads.forEach(path => this.loadChildren(path, 0));
    }

    buildHTML(items, depth, parts, pendingLoads) {
        for (const item of items) {
            const isExpanded = item.isDir && state.isFolderExpanded(item.path);
            const selected = state.selectedPath === item.path ? ' selected' : '';
            const type = item.isDir ? 'folder' : 'file';
            const escapedPath = item.path.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
            const escapedName = item.name.replace(/&/g,'&amp;').replace(/</g,'&lt;');

            let arrow;
            if (item.isDir) {
                arrow = `<span class="tree-arrow${isExpanded ? ' expanded' : ''}">▶</span>`;
            } else {
                arrow = '<span class="tree-arrow hidden"></span>';
            }

            parts.push(`<div class="tree-item ${type}${selected}" data-depth="${depth}" data-path="${escapedPath}">${arrow}<span class="tree-icon ${this.getIconClass(item)}"></span><span class="tree-name">${escapedName}</span></div>`);

            if (isExpanded) {
                if (item.children === null || item.children === undefined) {
                    // Not yet loaded
                    pendingLoads.push(item.path);
                } else if (item.children.length > 0) {
                    this.buildHTML(item.children, depth + 1, parts, pendingLoads);
                }
                // empty array = loaded but empty, do nothing
            }
        }
    }

    getIconClass(item) {
        if (item.isDir) {
            return state.isFolderExpanded(item.path) ? 'folder open' : 'folder';
        }

        const ext = item.extension?.toLowerCase();
        switch (ext) {
            case 'rs': return 'file-rust';
            case 'js':
            case 'jsx': return 'file-js';
            case 'ts':
            case 'tsx': return 'file-ts';
            case 'py': return 'file-py';
            case 'go': return 'file-go';
            case 'html':
            case 'htm': return 'file-html';
            case 'css':
            case 'scss':
            case 'sass': return 'file-css';
            case 'json': return 'file-json';
            case 'toml':
            case 'yaml':
            case 'yml': return 'file-config';
            case 'md':
            case 'markdown': return 'file-md';
            case 'png':
            case 'jpg':
            case 'jpeg':
            case 'gif':
            case 'svg': return 'file-image';
            default: return 'file-default';
        }
    }

    handleItemClick(item) {
        state.setSelectedPath(item.path);

        if (item.isDir) {
            // If expanding and children already loaded, toggleFolder's render is enough
            // If children not loaded, toggleFolder renders (shows empty), then loadChildren renders with data
            state.toggleFolder(item.path);
            if (state.isFolderExpanded(item.path) && (item.children === null || item.children === undefined)) {
                this.loadChildren(item.path, 0);
            }
        } else {
            // Single click opens the file
            this.openFile(item.path);
        }
    }

    async loadChildren(path, depth) {
        try {
            const result = await window.__TAURI__.core.invoke('get_file_tree', { path });
            if (result.success) {
                // Update the tree with children
                this.updateItemChildren(state.fileTree, path, result.data);
                this.render();
            }
        } catch (error) {
            console.error('Error loading children:', error);
        }
    }

    updateItemChildren(items, targetPath, children) {
        for (const item of items) {
            if (item.path === targetPath) {
                item.children = children;
                return true;
            }
            if (item.children) {
                if (this.updateItemChildren(item.children, targetPath, children)) {
                    return true;
                }
            }
        }
        return false;
    }

    async openFile(path) {
        try {
            const result = await window.__TAURI__.core.invoke('read_file', { path });
            if (result.success) {
                const language = this.getLanguage(path);
                state.openDocument(path, result.data, language);
            } else {
                console.error('Failed to open file:', result.error);
            }
        } catch (error) {
            console.error('Error opening file:', error);
        }
    }

    getLanguage(path) {
        const ext = path.split('.').pop()?.toLowerCase();
        const languages = {
            'rs': 'rust',
            'js': 'javascript',
            'jsx': 'jsx',
            'ts': 'typescript',
            'tsx': 'tsx',
            'py': 'python',
            'go': 'go',
            'html': 'html',
            'htm': 'html',
            'css': 'css',
            'scss': 'css',
            'json': 'json',
            'toml': 'toml',
            'yaml': 'yaml',
            'yml': 'yaml',
            'md': 'markdown'
        };
        return languages[ext] || 'text';
    }

    showContextMenu(event, item) {
        this.hideContextMenu();

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = `${event.clientX}px`;
        menu.style.top = `${event.clientY}px`;

        const menuItems = item.isRoot ? [
            { icon: '📄', label: '新增檔案', action: () => this.createFile(item) },
            { icon: '📁', label: '新增資料夾', action: () => this.createFolder(item) },
        ] : [
            { icon: '📋', label: '複製路徑', action: () => this.copyPath(item) },
            { separator: true },
            { icon: '📄', label: '新增檔案', action: () => this.createFile(item) },
            { icon: '📁', label: '新增資料夾', action: () => this.createFolder(item) },
            { separator: true },
            { icon: '✏️', label: '重新命名', shortcut: 'F2 / 雙擊', action: () => this.rename(item) },
            { separator: true },
            { icon: '🗑️', label: '刪除', class: 'danger', action: () => this.delete(item) }
        ];

        menuItems.forEach(menuItem => {
            if (menuItem.separator) {
                const sep = document.createElement('div');
                sep.className = 'context-menu-separator';
                menu.appendChild(sep);
            } else {
                const itemEl = document.createElement('div');
                itemEl.className = `context-menu-item ${menuItem.class || ''}`;
                itemEl.innerHTML = `
                    <span class="context-menu-item-icon">${menuItem.icon}</span>
                    <span class="context-menu-item-label">${menuItem.label}</span>
                    ${menuItem.shortcut ? `<span class="context-menu-item-shortcut">${menuItem.shortcut}</span>` : ''}
                `;
                itemEl.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.hideContextMenu();
                    menuItem.action();
                });
                menu.appendChild(itemEl);
            }
        });

        document.body.appendChild(menu);
        this.contextMenu = menu;
    }

    hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.remove();
            this.contextMenu = null;
        }
    }

    createFile(item) {
        const parentDir = item.isDir ? item.path : this.parentDir(item.path);
        this.beginCreate(parentDir, false);
    }

    createFolder(item) {
        const parentDir = item.isDir ? item.path : this.parentDir(item.path);
        this.beginCreate(parentDir, true);
    }

    // Show an inline input under a parent dir, then create the file/folder.
    async beginCreate(parentDir, isDir) {
        // Make sure parent is expanded (so the new entry is visible)
        if (parentDir !== state.projectPath && !state.isFolderExpanded(parentDir)) {
            state.toggleFolder(parentDir);
            const parentItem = this.findItemByPath(state.fileTree, parentDir);
            if (parentItem && (parentItem.children === null || parentItem.children === undefined)) {
                await this.loadChildren(parentDir, 0);
            }
        }

        // Create a placeholder row at the end of the parent's children
        const parentItem = parentDir === state.projectPath ? null : this.findItemByPath(state.fileTree, parentDir);
        const depth = parentItem ? this.computeDepth(state.fileTree, parentDir, 0) + 1 : 0;

        // Build a temporary row
        const row = document.createElement('div');
        row.className = `tree-item ${isDir ? 'folder' : 'file'} tree-item-creating`;
        row.dataset.depth = String(depth);
        row.innerHTML = `
            <span class="tree-arrow${isDir ? '' : ' hidden'}">${isDir ? '▶' : ''}</span>
            <span class="tree-icon ${isDir ? 'folder' : 'file-default'}"></span>
            <input type="text" class="tree-edit-input" placeholder="${isDir ? '新資料夾' : '新檔案'}" />
        `;

        // Insert row: under the parent's last child, or at top-level if root
        if (parentDir === state.projectPath) {
            this.container.appendChild(row);
        } else {
            // Find parent row in DOM
            const parentEl = this.container.querySelector(`[data-path="${CSS.escape(parentDir)}"]`);
            if (parentEl) {
                // Insert after the last descendant row of parentEl
                let after = parentEl;
                let next = parentEl.nextElementSibling;
                while (next && parseInt(next.dataset.depth || '0') >= depth) {
                    after = next;
                    next = next.nextElementSibling;
                }
                after.insertAdjacentElement('afterend', row);
            } else {
                this.container.appendChild(row);
            }
        }

        const input = row.querySelector('.tree-edit-input');
        input.focus();

        let done = false;
        const finish = async (commit) => {
            if (done) return;
            done = true;
            const name = input.value.trim();
            row.remove();
            if (!commit || !name) return;
            const newPath = this.joinPath(parentDir, name);
            try {
                const cmd = isDir ? 'create_directory' : 'create_file';
                const result = await window.__TAURI__.core.invoke(cmd, { path: newPath });
                if (result.success && state.projectPath) {
                    await this.loadDirectory(state.projectPath);
                } else if (!result.success) {
                    alert(`建立失敗: ${result.error}`);
                }
            } catch (e) {
                alert(`建立失敗: ${e.message || e}`);
            }
        };
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
    }

    computeDepth(items, target, depth) {
        for (const it of items) {
            if (it.path === target) return depth;
            if (it.children) {
                const d = this.computeDepth(it.children, target, depth + 1);
                if (d >= 0) return d;
            }
        }
        return -1;
    }

    rename(item) {
        const element = this.container.querySelector(`[data-path="${CSS.escape(item.path)}"]`);
        if (!element) return;
        const nameSpan = element.querySelector('.tree-name');
        if (!nameSpan) return;
        element.classList.add('tree-item-editing');
        const originalName = item.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tree-edit-input';
        input.value = originalName;
        nameSpan.style.display = 'none';
        nameSpan.parentNode.appendChild(input);
        input.focus();
        if (!item.isDir && originalName.includes('.')) input.setSelectionRange(0, originalName.lastIndexOf('.'));
        else input.select();
        let done = false;
        const finish = async (commit) => {
            if (done) return;
            done = true;
            const newName = input.value.trim();
            input.remove();
            nameSpan.style.display = '';
            element.classList.remove('tree-item-editing');
            if (!commit || !newName || newName === originalName) return;
            const parentPath = this.parentDir(item.path);
            const newPath = this.joinPath(parentPath, newName);
            try {
                const result = await window.__TAURI__.core.invoke('rename_path', { oldPath: item.path, newPath });
                if (result.success && state.projectPath) {
                    this.loadDirectory(state.projectPath);
                } else if (!result.success) {
                    alert(`重新命名失敗: ${result.error}`);
                }
            } catch (e) {
                alert(`重新命名失敗: ${e.message || e}`);
            }
        };
        input.addEventListener('blur', () => finish(true));
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') { e.preventDefault(); finish(true); }
            else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        // Don't let click on input bubble up and trigger tree-item click
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('dblclick', (e) => e.stopPropagation());
    }

    async copyPath(item) {
        try {
            await navigator.clipboard.writeText(item.path);
            const el = this.container.querySelector(`[data-path="${CSS.escape(item.path)}"]`);
            if (el) {
                el.style.background = 'var(--accent)';
                setTimeout(() => { el.style.background = ''; }, 200);
            }
        } catch (e) {
            console.error('Copy failed:', e);
        }
    }

    async delete(item) {
        if (confirm(`確定要刪除 "${item.name}" 嗎？`)) {
            try {
                const result = await window.__TAURI__.core.invoke('delete_path', { path: item.path });
                if (result.success) {
                    // Refresh the tree
                    if (state.projectPath) {
                        this.loadDirectory(state.projectPath);
                    }
                } else {
                    alert('刪除失敗: ' + result.error);
                }
            } catch (error) {
                console.error('Error deleting:', error);
            }
        }
    }
}

// Initialize file tree component
let fileTree;

