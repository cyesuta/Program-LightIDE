/**
 * LightIDE - Main Application
 */

class App {
    constructor() {
        window.app = this;
        this.init();
    }

    async init() {
        // Wait for Tauri to be ready
        if (typeof window.__TAURI__ === 'undefined') {
            console.warn('Tauri not available, running in browser mode');
        }

        // Initialize components
        fileTree = new FileTreeComponent();
        editor = new EditorComponent();
        terminal = new TerminalComponent();
        statusBar = new StatusBarComponent();

        // Initialize Claude chat eagerly (so workspace views can be created)
        const claudeContent = document.getElementById('claudeContent');
        this.claudeChat = new ClaudeChatComponent();
        this.claudeChat.init(claudeContent);

        // Default to Claude mode
        this.currentMode = 'terminal'; // will be flipped by switchMode below
        this.setupModeSwitcher();
        this.switchMode('claude');

        // Initialize workspace manager (must be after other components)
        workspaceManager = new WorkspaceManager();
        workspaceManager.init();

        // Setup event listeners
        this.setupKeyboardShortcuts();
        this.setupResizeHandles();
        this.setupUIEvents();

        // Update project name display
        state.on('projectChanged', ({ name }) => {
            document.getElementById('projectName').textContent = name || '';
        });

        console.log('LightIDE initialized');
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', async (e) => {
            // Ctrl+O: Open folder
            if (e.ctrlKey && e.key === 'o') {
                e.preventDefault();
                this.openFolderDialog();
            }

            // Ctrl+S: Save
            if (e.ctrlKey && e.key === 's') {
                e.preventDefault();
                if (editor) {
                    editor.saveCurrentDocument();
                }
            }

            // Ctrl+`: Toggle terminal
            if (e.ctrlKey && e.key === '`') {
                e.preventDefault();
                if (terminal) {
                    terminal.toggle();
                }
            }

            // Ctrl+W: Close tab
            if (e.ctrlKey && e.key === 'w') {
                e.preventDefault();
                const doc = state.getActiveDocument();
                if (doc) {
                    editor.closeTab(doc.path);
                }
            }
        });
    }

    async openFolderDialog() {
        try {
            // Use Tauri's dialog via global API
            if (window.__TAURI__ && window.__TAURI__.dialog) {
                const selected = await window.__TAURI__.dialog.open({
                    directory: true,
                    multiple: false,
                    title: '開啟專案目錄'
                });

                if (selected) {
                    this.openProject(selected);
                }
            } else {
                // Fallback for development
                console.log('Dialog not available, using fallback');
                const path = prompt('輸入目錄路徑 (開發模式):');
                if (path) {
                    this.openProject(path);
                }
            }
        } catch (error) {
            console.error('Error opening folder dialog:', error);
            // Fallback
            const path = prompt('輸入目錄路徑:');
            if (path) {
                this.openProject(path);
            }
        }
    }

    async openProject(path) {
        try {
            // Verify directory exists
            const result = await window.__TAURI__.core.invoke('open_directory', { path });

            if (result.success) {
                // Extract project name from path
                const name = path.split(/[/\\]/).pop();
                state.setProject(path, name);

                // Load file tree
                await fileTree.loadDirectory(path);

                // Persist workspace state
                workspaceManager?.save();
            } else {
                alert('無法開啟目錄: ' + result.error);
            }
        } catch (error) {
            console.error('Error opening project:', error);
            alert('開啟專案時發生錯誤');
        }
    }

    setupResizeHandles() {
        const leftHandle = document.getElementById('leftResizeHandle');
        const rightHandle = document.getElementById('rightResizeHandle');
        const leftPanel = document.getElementById('fileTreePanel');
        const rightPanel = document.getElementById('terminalPanel');

        this.setupResizeHandle(leftHandle, leftPanel, 'left');
        this.setupResizeHandle(rightHandle, rightPanel, 'right');
    }

    setupResizeHandle(handle, panel, side) {
        if (!handle || !panel) return;

        let isResizing = false;
        let startX = 0;
        let startWidth = 0;

        handle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = panel.offsetWidth;
            handle.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;

            const delta = side === 'left'
                ? e.clientX - startX
                : startX - e.clientX;
            const maxWidth = Math.min(window.innerWidth - 200, 1400);
            const newWidth = Math.max(150, Math.min(startWidth + delta, maxWidth));
            panel.style.width = `${newWidth}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                handle.classList.remove('dragging');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        });
    }

    setupModeSwitcher() {
        const modeTerminal = document.getElementById('modeTerminal');
        const modeClaude = document.getElementById('modeClaude');

        if (modeTerminal) {
            modeTerminal.addEventListener('click', () => this.switchMode('terminal'));
        }
        if (modeClaude) {
            modeClaude.addEventListener('click', () => this.switchMode('claude'));
        }
    }

    switchMode(mode) {
        if (mode === this.currentMode) return;
        this.currentMode = mode;

        const terminalContent = document.getElementById('terminalContent');
        const claudeContent = document.getElementById('claudeContent');
        const quickCmds = document.getElementById('terminalQuickCommands');
        const modeTerminal = document.getElementById('modeTerminal');
        const modeClaude = document.getElementById('modeClaude');

        if (mode === 'terminal') {
            terminalContent.style.display = 'flex';
            claudeContent.style.display = 'none';
            quickCmds.style.display = 'flex';
            modeTerminal.classList.add('active');
            modeClaude.classList.remove('active');
            terminal.fitActiveTab();
        } else {
            terminalContent.style.display = 'none';
            claudeContent.style.display = 'flex';
            quickCmds.style.display = 'none';
            modeTerminal.classList.remove('active');
            modeClaude.classList.add('active');

            this.claudeChat.show();
        }
    }

    setupUIEvents() {
        // Open folder button in titlebar
        const openFolderBtn = document.getElementById('openFolderBtn');
        if (openFolderBtn) {
            openFolderBtn.addEventListener('click', () => this.openFolderDialog());
        }

        // Welcome page buttons
        const welcomeOpenFolder = document.getElementById('welcomeOpenFolder');
        if (welcomeOpenFolder) {
            welcomeOpenFolder.addEventListener('click', () => this.openFolderDialog());
        }

        const welcomeOpenTerminal = document.getElementById('welcomeOpenTerminal');
        if (welcomeOpenTerminal) {
            welcomeOpenTerminal.addEventListener('click', () => {
                if (terminal) {
                    terminal.show();
                }
            });
        }

        // Terminal toggle button in titlebar
        const toggleTerminalBtn = document.getElementById('toggleTerminalBtn');
        if (toggleTerminalBtn) {
            toggleTerminalBtn.addEventListener('click', () => {
                if (terminal) {
                    terminal.toggle();
                }
            });
        }
    }
}

// Start the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
