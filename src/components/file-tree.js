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
        state.on('selectionChanged', () => this.render());

        // Close context menu on click elsewhere
        document.addEventListener('click', () => this.hideContextMenu());
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

        this.container.innerHTML = '';
        this.renderItems(state.fileTree, 0);
    }

    renderItems(items, depth) {
        items.forEach(item => {
            const element = this.createItemElement(item, depth);
            this.container.appendChild(element);

            // Render children if folder is expanded
            if (item.isDir && state.isFolderExpanded(item.path)) {
                if (item.children && item.children.length > 0) {
                    this.renderItems(item.children, depth + 1);
                } else {
                    // Load children if not yet loaded
                    this.loadChildren(item.path, depth + 1);
                }
            }
        });
    }

    createItemElement(item, depth) {
        const element = document.createElement('div');
        element.className = `tree-item ${item.isDir ? 'folder' : 'file'}`;
        element.dataset.depth = depth;
        element.dataset.path = item.path;

        if (state.selectedPath === item.path) {
            element.classList.add('selected');
        }

        // Arrow for folders
        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        if (item.isDir) {
            arrow.textContent = '▶';
            if (state.isFolderExpanded(item.path)) {
                arrow.classList.add('expanded');
            }
        } else {
            arrow.classList.add('hidden');
        }

        // Icon
        const icon = document.createElement('span');
        icon.className = `tree-icon ${this.getIconClass(item)}`;

        // Name
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = item.name;

        element.appendChild(arrow);
        element.appendChild(icon);
        element.appendChild(name);

        // Click handler
        element.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleItemClick(item);
        });

        // Double click for files
        element.addEventListener('dblclick', (e) => {
            e.stopPropagation();
            if (!item.isDir) {
                this.openFile(item.path);
            }
        });

        // Context menu
        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showContextMenu(e, item);
        });

        return element;
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
            state.toggleFolder(item.path);
            // Load children if expanding
            if (state.isFolderExpanded(item.path)) {
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
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
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
        // TODO: Implement rename dialog
        console.log('Rename:', item.path);
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
