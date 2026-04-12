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
            const el = e.target.closest('.tree-item');
            if (!el) return;
            const path = el.dataset.path;
            const item = this.findItemByPath(state.fileTree, path);
            if (item) this.handleItemClick(item);
        });
        this.container.addEventListener('auxclick', (e) => {
            if (e.button !== 1) return;
            const el = e.target.closest('.tree-item');
            if (!el) return;
            e.preventDefault();
            const item = this.findItemByPath(state.fileTree, el.dataset.path);
            if (item) this.rename(item);
        });
        this.container.addEventListener('contextmenu', (e) => {
            const el = e.target.closest('.tree-item');
            if (!el) return;
            e.preventDefault();
            const item = this.findItemByPath(state.fileTree, el.dataset.path);
            if (item) this.copyPath(item);
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

        const menuItems = [
            { icon: '📋', label: '複製路徑', action: () => this.copyPath(item) },
            { separator: true },
            { icon: '📄', label: '新增檔案', action: () => this.createFile(item) },
            { icon: '📁', label: '新增資料夾', action: () => this.createFolder(item) },
            { separator: true },
            { icon: '✏️', label: '重新命名', shortcut: 'F2', action: () => this.rename(item) },
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
        // TODO: Implement file creation dialog
        console.log('Create file in:', item.isDir ? item.path : item.path.substring(0, item.path.lastIndexOf('\\')));
    }

    createFolder(item) {
        // TODO: Implement folder creation dialog
        console.log('Create folder in:', item.isDir ? item.path : item.path.substring(0, item.path.lastIndexOf('\\')));
    }

    rename(item) {
        const element = this.container.querySelector(`[data-path="${CSS.escape(item.path)}"]`);
        if (!element) return;
        const nameSpan = element.querySelector('.tree-name');
        if (!nameSpan) return;
        const originalName = item.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalName;
        input.style.cssText = 'width:calc(100% - 40px);padding:1px 4px;font-size:inherit;background:var(--bg-primary);border:1px solid var(--accent);color:var(--text-primary);outline:none;border-radius:2px;';
        nameSpan.style.display = 'none';
        nameSpan.parentNode.appendChild(input);
        input.focus();
        if (!item.isDir && originalName.includes('.')) input.setSelectionRange(0, originalName.lastIndexOf('.'));
        else input.select();
        let done = false;
        const finish = async () => {
            if (done) return;
            done = true;
            const newName = input.value.trim();
            input.remove();
            nameSpan.style.display = '';
            if (newName && newName !== originalName) {
                const parentPath = item.path.substring(0, item.path.lastIndexOf('\\\\'));
                const newPath = parentPath + '\\\\' + newName;
                const result = await window.__TAURI__.core.invoke('rename_path', { oldPath: item.path, newPath: newPath });
                if (result.success && state.projectPath) this.loadDirectory(state.projectPath);
            }
        };
        input.addEventListener('blur', finish);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            else if (e.key === 'Escape') { input.value = originalName; input.blur(); }
        });
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

