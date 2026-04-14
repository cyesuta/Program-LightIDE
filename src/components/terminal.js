/**
 * LightIDE - Terminal Component with xterm.js
 * Multi-tab terminal emulation using xterm.js
 */

class TerminalTab {
    constructor(id, shellType, cwd, logFile = null) {
        this.id = id;
        this.shellType = shellType;
        this.cwd = cwd;
        this.logFile = logFile;
        this.term = null;
        this.fitAddon = null;
        this.terminalId = null;
        this.isConnected = false;
        this._outputUnlisten = null;
        this._exitUnlisten = null;
        this.container = null;
    }

    async init(parentContainer) {
        // Create container for this terminal
        this.container = document.createElement('div');
        this.container.className = 'xterm-tab-content';
        this.container.id = `xterm-${this.id}`;
        this.container.style.display = 'none';
        parentContainer.appendChild(this.container);

        // Create terminal instance
        this.term = new Terminal({
            cursorBlink: true,
            cursorStyle: 'bar',
            fontSize: 20,
            fontFamily: '"Cascadia Code", "Fira Code", Consolas, "Courier New", monospace',
            theme: {
                background: '#1e1e1e',
                foreground: '#cccccc',
                cursor: '#ffffff',
                cursorAccent: '#000000',
                selection: 'rgba(255, 255, 255, 0.3)',
                black: '#000000',
                red: '#cd3131',
                green: '#0dbc79',
                yellow: '#e5e510',
                blue: '#2472c8',
                magenta: '#bc3fbc',
                cyan: '#11a8cd',
                white: '#e5e5e5',
                brightBlack: '#666666',
                brightRed: '#f14c4c',
                brightGreen: '#23d18b',
                brightYellow: '#f5f543',
                brightBlue: '#3b8eea',
                brightMagenta: '#d670d6',
                brightCyan: '#29b8db',
                brightWhite: '#ffffff'
            },
            allowTransparency: true,
            scrollback: 10000,
            convertEol: true
        });

        // Load addons
        if (typeof FitAddon !== 'undefined') {
            this.fitAddon = new FitAddon.FitAddon();
            this.term.loadAddon(this.fitAddon);
        }

        // Open terminal in container
        this.term.open(this.container);

        // Handle terminal input
        this.term.onData((data) => {
            this.sendInput(data);
        });

        // Start the shell
        await this.startTerminal();
    }

    show() {
        if (this.container) {
            this.container.style.display = 'flex';
            this.fit();
            this.term?.focus();
        }
    }

    hide() {
        if (this.container) {
            this.container.style.display = 'none';
        }
    }

    fit() {
        if (this.fitAddon && this.term) {
            try {
                this.fitAddon.fit();
                if (this.terminalId && this.isConnected) {
                    const dims = { cols: this.term.cols, rows: this.term.rows };
                    this.resizeTerminal(dims.cols, dims.rows);
                }
            } catch (e) {
                // Ignore fit errors during transitions
            }
        }
    }

    async startTerminal() {
        console.log(`[Tab ${this.id}] Starting terminal with ${this.shellType}`);

        this.stopReading();

        if (!window.__TAURI__ || !window.__TAURI__.core) {
            console.error('Tauri not available');
            this.term.writeln('\x1b[31m✗ Tauri API 不可用\x1b[0m');
            return;
        }

        try {
            this.term.clear();
            this.term.writeln(`\x1b[36m正在啟動 ${this.shellType.toUpperCase()}...\x1b[0m`);

            const result = await window.__TAURI__.core.invoke('create_terminal', {
                shell: this.shellType,
                cwd: this.cwd,
                logFile: this.logFile
            });

            if (result.success) {
                this.terminalId = result.data.id;
                this.isConnected = true;
                this.term.writeln(`\x1b[32m✓ 終端機已連接 (${this.shellType})\x1b[0m`);
                this.term.writeln('');

                this.fit();
                setTimeout(() => this.startReading(), 200);
                this.term.focus();
            } else {
                this.term.writeln(`\x1b[31m✗ 錯誤: ${result.error}\x1b[0m`);
            }
        } catch (error) {
            console.error('Failed to start terminal:', error);
            this.term.writeln(`\x1b[31m✗ 啟動失敗: ${error.message || error}\x1b[0m`);
        }
    }

    startReading() {
        // Clean up previous listener if any
        this.stopReading();

        if (!this.terminalId || !this.isConnected) return;

        const terminalId = this.terminalId;

        // Listen for real-time output events pushed from backend
        if (window.__TAURI__?.event?.listen) {
            window.__TAURI__.event.listen('terminal-output', (event) => {
                const { terminalId: eventTermId, data } = event.payload;
                // Only process events for this terminal tab
                if (eventTermId === terminalId && this.isConnected && this.term) {
                    this.term.write(data);
                }
            }).then(unlisten => {
                this._outputUnlisten = unlisten;
            });

            window.__TAURI__.event.listen('terminal-exit', (event) => {
                const { terminalId: eventTermId } = event.payload;
                if (eventTermId === terminalId && this.term) {
                    this.term.writeln('\r\n\x1b[33m⚠ 終端機程序已結束\x1b[0m');
                    this.isConnected = false;
                }
            }).then(unlisten => {
                this._exitUnlisten = unlisten;
            });
        }
    }

    stopReading() {
        // Unsubscribe from Tauri events
        if (this._outputUnlisten) {
            this._outputUnlisten();
            this._outputUnlisten = null;
        }
        if (this._exitUnlisten) {
            this._exitUnlisten();
            this._exitUnlisten = null;
        }
    }

    async sendInput(data) {
        if (!this.terminalId || !this.isConnected) return;

        try {
            await window.__TAURI__.core.invoke('write_terminal', {
                id: this.terminalId,
                input: data
            });
        } catch (error) {
            console.error('Error writing to terminal:', error);
        }
    }

    async resizeTerminal(cols, rows) {
        if (!this.terminalId || !this.isConnected) return;

        try {
            await window.__TAURI__.core.invoke('resize_terminal', {
                id: this.terminalId,
                cols: cols,
                rows: rows
            });
        } catch (error) {
            // Resize may not be implemented
        }
    }

    async destroy() {
        console.log(`[Tab ${this.id}] Destroying terminal`);
        this.stopReading();

        if (this.terminalId) {
            try {
                await window.__TAURI__.core.invoke('close_terminal', { id: this.terminalId });
            } catch (e) {
                console.warn('Error closing terminal:', e);
            }
            this.terminalId = null;
        }

        if (this.term) {
            this.term.dispose();
            this.term = null;
        }

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        this.isConnected = false;
    }
}

class TerminalComponent {
    constructor() {
        this.panel = document.getElementById('terminalPanel');
        this.closeBtn = document.getElementById('closeTerminalBtn');

        this.tabs = new Map(); // Map<tabId, TerminalTab>
        this.activeTabId = null;
        this.tabIdCounter = 0;

        this.tabBar = null;
        this.tabContent = null;

        // Quick commands - preset and custom
        this.defaultQuickCommands = [
            { id: 'npm-dev', label: 'npm dev', command: 'npm run dev\n', icon: '▶' },
            { id: 'npm-build', label: 'npm build', command: 'npm run build\n', icon: '📦' },
            { id: 'git-status', label: 'git status', command: 'git status\n', icon: '📊' },
            { id: 'git-pull', label: 'git pull', command: 'git pull\n', icon: '⬇' },
            { id: 'git-push', label: 'git push', command: 'git push\n', icon: '⬆' },
            { id: 'clear', label: 'clear', command: 'cls\n', icon: '🧹' }
        ];
        this.customQuickCommands = this.loadCustomCommands();
        this.quickCommandsList = null;

        this.init();
    }

    init() {
        console.log('Terminal component initializing...');

        // Wait for xterm.js to load
        if (typeof Terminal === 'undefined') {
            console.error('xterm.js not loaded yet, retrying...');
            setTimeout(() => this.init(), 100);
            return;
        }

        this.setupUI();
        this.setupEventListeners();
        this.setupQuickCommands();

        // Create initial terminal tab after a short delay
        setTimeout(() => {
            this.createTab('powershell');
        }, 500);
    }

    setupUI() {
        const terminalContent = this.panel?.querySelector('.terminal-content');
        if (!terminalContent) return;

        // Clear existing content
        terminalContent.innerHTML = '';

        // Create tab bar
        this.tabBar = document.createElement('div');
        this.tabBar.className = 'terminal-tab-bar';
        this.tabBar.innerHTML = `
            <div class="terminal-tabs" id="terminalTabs"></div>
            <div class="terminal-tab-actions">
                <select class="shell-selector-new" id="newTabShellSelector">
                    <option value="powershell">PowerShell</option>
                    <option value="cmd">CMD</option>
                    <option value="gitbash">Git Bash</option>
                </select>
                <button class="tab-add-btn" id="addTabBtn" title="新增終端機">+</button>
            </div>
        `;
        terminalContent.appendChild(this.tabBar);

        // Create content container for terminals
        this.tabContent = document.createElement('div');
        this.tabContent.className = 'terminal-tab-content-wrapper';
        this.tabContent.id = 'terminalTabContent';
        terminalContent.appendChild(this.tabContent);
    }

    setupEventListeners() {
        // Close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.toggle());
        }

        // Add tab button
        const addBtn = document.getElementById('addTabBtn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const selector = document.getElementById('newTabShellSelector');
                const shellType = selector?.value || 'powershell';
                this.createTab(shellType);
            });
        }

        // Handle resize
        window.addEventListener('resize', () => {
            this.fitActiveTab();
        });

        // Observe container size changes
        if (this.tabContent) {
            const resizeObserver = new ResizeObserver(() => {
                this.fitActiveTab();
            });
            resizeObserver.observe(this.tabContent);
        }
    }

    async createTab(shellType, options = {}) {
        const tabId = `tab-${++this.tabIdCounter}`;
        const cwd = options.cwd || state?.projectPath || null;
        const logFile = options.logFile || null;

        console.log(`Creating terminal tab: ${tabId} with shell: ${shellType}`);

        // Create tab object
        const tab = new TerminalTab(tabId, shellType, cwd, logFile);
        this.tabs.set(tabId, tab);

        // Create tab button in tab bar
        this.addTabButton(tabId, shellType, options.label);

        // Initialize the terminal
        await tab.init(this.tabContent);

        // Switch to the new tab
        this.switchTab(tabId);

        return tab;
    }

    /**
     * Create a background task terminal that auto-runs a command and logs to file.
     * Returns { tabId, terminalId, logFile } for the sidecar response.
     */
    async createBgTaskTab(command, cwd) {
        // Pick shell based on platform — Git Bash is best for `tee`
        const shellType = 'gitbash';

        // Build log file path
        const timestamp = Date.now();
        const logDir = cwd ? `${cwd}/.lightide/bg-logs` : null;
        const logFile = logDir ? `${logDir}/bg_${timestamp}.log` : null;

        // Create the tab (the Rust backend will handle log file creation)
        const tab = await this.createTab(shellType, {
            cwd,
            logFile,
            label: `⚡ ${command.substring(0, 20)}${command.length > 20 ? '...' : ''}`,
        });

        // Wait a bit for terminal to be ready, then send the command.
        // Append `; exit` so the shell terminates when the command finishes,
        // which fires the terminal-exit event so we can auto-switch back.
        await new Promise(resolve => setTimeout(resolve, 800));
        if (tab.isConnected) {
            const wrapped = `${command}; exit\n`;
            await tab.sendInput(wrapped);
        }

        return {
            tabId: tab.id,
            terminalId: tab.terminalId,
            logFile,
        };
    }

    addTabButton(tabId, shellType, customLabel) {
        const tabsContainer = document.getElementById('terminalTabs');
        if (!tabsContainer) return;

        const shellNames = {
            'powershell': 'PS',
            'cmd': 'CMD',
            'gitbash': 'Bash'
        };
        const label = customLabel || `${shellNames[shellType] || shellType} ${this.tabIdCounter}`;

        const tabBtn = document.createElement('div');
        tabBtn.className = 'terminal-tab';
        tabBtn.id = `btn-${tabId}`;
        tabBtn.innerHTML = `
            <span class="tab-label">${label}</span>
            <button class="tab-close-btn" data-tab="${tabId}" title="關閉">×</button>
        `;

        // Click to switch
        tabBtn.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-close-btn')) {
                this.switchTab(tabId);
            }
        });

        // Close button
        const closeBtn = tabBtn.querySelector('.tab-close-btn');
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeTab(tabId);
        });

        tabsContainer.appendChild(tabBtn);
    }

    switchTab(tabId) {
        // Hide current tab
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            const currentTab = this.tabs.get(this.activeTabId);
            currentTab.hide();
            const currentBtn = document.getElementById(`btn-${this.activeTabId}`);
            if (currentBtn) currentBtn.classList.remove('active');
        }

        // Show new tab
        if (this.tabs.has(tabId)) {
            const newTab = this.tabs.get(tabId);
            newTab.show();
            this.activeTabId = tabId;
            const newBtn = document.getElementById(`btn-${tabId}`);
            if (newBtn) newBtn.classList.add('active');
        }
    }

    async closeTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;

        // Destroy the terminal (releases memory)
        await tab.destroy();
        this.tabs.delete(tabId);

        // Remove tab button
        const tabBtn = document.getElementById(`btn-${tabId}`);
        if (tabBtn) tabBtn.remove();

        // If we closed the active tab, switch to another
        if (this.activeTabId === tabId) {
            this.activeTabId = null;
            const remainingTabs = Array.from(this.tabs.keys());
            if (remainingTabs.length > 0) {
                this.switchTab(remainingTabs[remainingTabs.length - 1]);
            }
        }

        console.log(`Tab ${tabId} closed. Remaining tabs: ${this.tabs.size}`);
    }

    fitActiveTab() {
        if (this.activeTabId && this.tabs.has(this.activeTabId)) {
            this.tabs.get(this.activeTabId).fit();
        }
    }

    toggle() {
        if (!state) return;

        state.rightPanelVisible = !state.rightPanelVisible;
        if (this.panel) {
            this.panel.style.display = state.rightPanelVisible ? 'flex' : 'none';
        }

        const handle = document.getElementById('rightResizeHandle');
        if (handle) {
            handle.style.display = state.rightPanelVisible ? 'block' : 'none';
        }

        if (state.rightPanelVisible) {
            this.fitActiveTab();
            if (this.tabs.size === 0) {
                this.createTab('powershell');
            }
        }
    }

    show() {
        if (state) state.rightPanelVisible = true;
        if (this.panel) this.panel.style.display = 'flex';
        this.fitActiveTab();
        if (this.tabs.size === 0) {
            this.createTab('powershell');
        }
    }

    hide() {
        if (state) state.rightPanelVisible = false;
        if (this.panel) this.panel.style.display = 'none';
    }

    async destroy() {
        for (const [tabId, tab] of this.tabs) {
            await tab.destroy();
        }
        this.tabs.clear();
    }

    // ============================================
    // Quick Commands
    // ============================================

    loadCustomCommands() {
        try {
            const saved = localStorage.getItem('lightide-quick-commands');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    }

    saveCustomCommands() {
        try {
            localStorage.setItem('lightide-quick-commands', JSON.stringify(this.customQuickCommands));
        } catch (e) {
            console.error('Failed to save quick commands:', e);
        }
    }

    setupQuickCommands() {
        this.quickCommandsList = document.getElementById('quickCommandsList');
        const addBtn = document.getElementById('addQuickCmdBtn');
        const pasteImageBtn = document.getElementById('pasteImageBtn');

        if (addBtn) {
            addBtn.addEventListener('click', () => this.showAddCommandModal());
        }

        if (pasteImageBtn) {
            pasteImageBtn.addEventListener('click', () => this.showImagePasteModal());
        }

        this.renderQuickCommands();
    }

    renderQuickCommands() {
        if (!this.quickCommandsList) return;

        this.quickCommandsList.innerHTML = '';

        // Render all commands (preset + custom)
        const allCommands = [...this.defaultQuickCommands, ...this.customQuickCommands];

        allCommands.forEach(cmd => {
            const btn = document.createElement('button');
            btn.className = 'quick-cmd-btn';
            btn.title = cmd.command.replace('\n', '');
            btn.innerHTML = `
                <span class="cmd-icon">${cmd.icon || '⚡'}</span>
                <span>${cmd.label}</span>
                ${cmd.custom ? '<span class="cmd-delete" data-id="' + cmd.id + '">✕</span>' : ''}
            `;

            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('cmd-delete')) {
                    e.stopPropagation();
                    this.removeCustomCommand(e.target.dataset.id);
                } else {
                    this.executeCommand(cmd.command);
                }
            });

            this.quickCommandsList.appendChild(btn);
        });
    }

    async executeCommand(command) {
        if (!this.activeTabId || !this.tabs.has(this.activeTabId)) {
            console.warn('No active terminal');
            return;
        }

        const tab = this.tabs.get(this.activeTabId);
        if (!tab || !tab.isConnected) return;

        // Split by newlines and execute each line
        const lines = command.split('\n').filter(line => line.trim() !== '');

        // Reverse order (workaround for PTY buffer ordering)
        lines.reverse();

        for (const line of lines) {
            await tab.sendInput(line + '\n');
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    }

    showAddCommandModal() {
        const modal = document.createElement('div');
        modal.className = 'quick-cmd-modal';
        modal.innerHTML = `
            <div class="quick-cmd-modal-content">
                <h3>新增快捷指令</h3>
                <div class="quick-cmd-modal-field">
                    <label>顯示名稱</label>
                    <input type="text" id="cmdLabel" placeholder="例如: npm test">
                </div>
                <div class="quick-cmd-modal-field">
                    <label>指令內容 (每行一個指令)</label>
                    <textarea id="cmdCommand" placeholder="例如:&#10;git add .&#10;git commit -m 'update'&#10;git push" rows="4"></textarea>
                </div>
                <div class="quick-cmd-modal-field">
                    <label>圖示 (可選)</label>
                    <input type="text" id="cmdIcon" placeholder="例如: 🧪" maxlength="2">
                </div>
                <div class="quick-cmd-modal-actions">
                    <button class="btn-cancel">取消</button>
                    <button class="btn-save">新增</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const labelInput = modal.querySelector('#cmdLabel');
        const commandInput = modal.querySelector('#cmdCommand');
        const iconInput = modal.querySelector('#cmdIcon');

        // Focus first input
        labelInput.focus();

        // Cancel button
        modal.querySelector('.btn-cancel').addEventListener('click', () => {
            modal.remove();
        });

        // Save button
        modal.querySelector('.btn-save').addEventListener('click', () => {
            const label = labelInput.value.trim();
            const command = commandInput.value.trim();
            const icon = iconInput.value.trim() || '⚡';

            if (label && command) {
                this.addCustomCommand(label, command, icon);
                modal.remove();
            }
        });

        // Close on background click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Ctrl+Enter to save (normal Enter allows newlines in textarea)
        commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                modal.querySelector('.btn-save').click();
            }
        });
    }

    addCustomCommand(label, command, icon) {
        const id = 'custom-' + Date.now();
        this.customQuickCommands.push({
            id,
            label,
            command: command, // Keep as-is, executeCommand handles the splitting
            icon,
            custom: true
        });
        this.saveCustomCommands();
        this.renderQuickCommands();
    }

    removeCustomCommand(id) {
        this.customQuickCommands = this.customQuickCommands.filter(cmd => cmd.id !== id);
        this.saveCustomCommands();
        this.renderQuickCommands();
    }

    // ============================================
    // Image Paste Modal
    // ============================================

    showImagePasteModal() {
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'image-paste-modal';
        modal.innerHTML = `
            <div class="image-paste-content">
                <div class="image-paste-header">
                    <h3>貼上圖片</h3>
                    <button class="image-paste-close">✕</button>
                </div>
                <div class="image-paste-area">
                    <div class="image-paste-placeholder">
                        <div class="icon">📋</div>
                        <p>按 Ctrl+V 貼上截圖</p>
                        <p style="font-size: 11px;">或拖放圖片到此處</p>
                    </div>
                    <div class="image-paste-canvas-container">
                        <canvas class="image-paste-canvas"></canvas>
                        <div class="selection-overlay" style="display:none;"></div>
                    </div>
                </div>
                <div class="image-paste-info"></div>
                <div class="image-paste-actions">
                    <button class="btn-secondary" data-action="clear">清除</button>
                    <button class="btn-secondary" data-action="select-all">全選</button>
                    <button class="btn-primary" data-action="copy" disabled>傳送圖片路徑</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Elements
        const pasteArea = modal.querySelector('.image-paste-area');
        const placeholder = modal.querySelector('.image-paste-placeholder');
        const canvasContainer = modal.querySelector('.image-paste-canvas-container');
        const canvas = modal.querySelector('.image-paste-canvas');
        const ctx = canvas.getContext('2d');
        const selectionOverlay = modal.querySelector('.selection-overlay');
        const infoText = modal.querySelector('.image-paste-info');
        const copyBtn = modal.querySelector('[data-action="copy"]');
        const clearBtn = modal.querySelector('[data-action="clear"]');
        const selectAllBtn = modal.querySelector('[data-action="select-all"]');

        let imageData = null;
        let selection = null;
        let isSelecting = false;
        let startX = 0, startY = 0;

        // Handle paste
        const handlePaste = (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;

            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    loadImage(blob);
                    e.preventDefault();
                    break;
                }
            }
        };

        // Handle drop
        const handleDrop = (e) => {
            e.preventDefault();
            const files = e.dataTransfer?.files;
            if (files && files[0] && files[0].type.startsWith('image/')) {
                loadImage(files[0]);
            }
        };

        const loadImage = (blob) => {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);
                imageData = img;

                placeholder.style.display = 'none';
                canvasContainer.classList.add('active');
                pasteArea.classList.add('has-image');

                infoText.textContent = `圖片大小: ${img.width} x ${img.height}px`;
                copyBtn.disabled = false;

                // Select all by default
                selection = { x: 0, y: 0, w: img.width, h: img.height };
                updateSelectionOverlay();

                URL.revokeObjectURL(img.src); // Clean up
            };
            img.src = URL.createObjectURL(blob);
        };

        const updateSelectionOverlay = () => {
            if (!selection || !imageData) {
                selectionOverlay.style.display = 'none';
                return;
            }

            const scaleX = canvas.offsetWidth / canvas.width;
            const scaleY = canvas.offsetHeight / canvas.height;

            selectionOverlay.style.display = 'block';
            selectionOverlay.style.left = (selection.x * scaleX) + 'px';
            selectionOverlay.style.top = (selection.y * scaleY) + 'px';
            selectionOverlay.style.width = (selection.w * scaleX) + 'px';
            selectionOverlay.style.height = (selection.h * scaleY) + 'px';

            infoText.textContent = `選取區域: ${selection.w} x ${selection.h}px (從 ${selection.x}, ${selection.y})`;
        };

        // Mouse selection
        canvas.addEventListener('mousedown', (e) => {
            if (!imageData) return;
            isSelecting = true;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / canvas.offsetWidth;
            const scaleY = canvas.height / canvas.offsetHeight;
            startX = (e.clientX - rect.left) * scaleX;
            startY = (e.clientY - rect.top) * scaleY;
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!isSelecting || !imageData) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / canvas.offsetWidth;
            const scaleY = canvas.height / canvas.offsetHeight;
            const endX = (e.clientX - rect.left) * scaleX;
            const endY = (e.clientY - rect.top) * scaleY;

            selection = {
                x: Math.min(startX, endX),
                y: Math.min(startY, endY),
                w: Math.abs(endX - startX),
                h: Math.abs(endY - startY)
            };
            updateSelectionOverlay();
        });

        canvas.addEventListener('mouseup', () => {
            isSelecting = false;
        });

        // Clear
        clearBtn.addEventListener('click', () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            imageData = null;
            selection = null;
            placeholder.style.display = 'block';
            canvasContainer.classList.remove('active');
            pasteArea.classList.remove('has-image');
            selectionOverlay.style.display = 'none';
            infoText.textContent = '';
            copyBtn.disabled = true;
        });

        // Select all
        selectAllBtn.addEventListener('click', () => {
            if (!imageData) return;
            selection = { x: 0, y: 0, w: canvas.width, h: canvas.height };
            updateSelectionOverlay();
        });

        // Save to temp file and send path
        copyBtn.addEventListener('click', async () => {
            if (!imageData || !selection) return;

            // Create a temp canvas for the selected region
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = Math.round(selection.w);
            tempCanvas.height = Math.round(selection.h);
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(canvas, selection.x, selection.y, selection.w, selection.h, 0, 0, tempCanvas.width, tempCanvas.height);

            const base64 = tempCanvas.toDataURL('image/png');
            const base64Data = base64.replace(/^data:image\/png;base64,/, '');
            const sizeKB = Math.round(base64Data.length * 0.75 / 1024);

            try {
                // Save to project directory using Tauri
                const result = await window.__TAURI__.core.invoke('save_temp_image', {
                    base64Data: base64Data,
                    filename: `clipboard_${Date.now()}.png`,
                    projectPath: state.projectPath || null
                });

                if (result.success && result.data) {
                    const filePath = result.data;
                    // Send file path to terminal
                    this.executeCommand(filePath);
                    console.log(`[圖片已保存] ${tempCanvas.width}x${tempCanvas.height}px, ${sizeKB}KB -> ${filePath}`);
                } else {
                    throw new Error(result.error || 'Unknown error');
                }
            } catch (e) {
                console.error('Failed to save image:', e);
                // Fallback: copy base64 to clipboard
                await navigator.clipboard.writeText(base64);
                alert('無法保存檔案，已複製 Base64 到剪貼簿');
            }

            // Cleanup and close
            imageData = null;
            selection = null;
            modal.remove();
            document.removeEventListener('paste', handlePaste);
        });

        // Close
        modal.querySelector('.image-paste-close').addEventListener('click', () => {
            imageData = null;
            selection = null;
            modal.remove();
            document.removeEventListener('paste', handlePaste);
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                imageData = null;
                selection = null;
                modal.remove();
                document.removeEventListener('paste', handlePaste);
            }
        });

        // Drag and drop
        pasteArea.addEventListener('dragover', (e) => e.preventDefault());
        pasteArea.addEventListener('drop', handleDrop);

        // Listen for paste
        document.addEventListener('paste', handlePaste);

        // Focus for paste to work
        modal.focus();
    }
}

// Initialize terminal component
let terminal;

