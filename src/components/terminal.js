/**
 * LightIDE - Terminal Component with xterm.js
 * Multi-tab terminal emulation using xterm.js
 */

class TerminalTab {
    constructor(id, shellType, cwd) {
        this.id = id;
        this.shellType = shellType;
        this.cwd = cwd;
        this.term = null;
        this.fitAddon = null;
        this.terminalId = null;
        this.isConnected = false;
        this.readIntervalId = null;
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
            fontSize: 13,
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
                cwd: this.cwd
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
        if (this.readIntervalId) {
            clearInterval(this.readIntervalId);
            this.readIntervalId = null;
        }

        if (!this.terminalId || !this.isConnected) return;

        const terminalId = this.terminalId;

        this.readIntervalId = setInterval(async () => {
            if (this.terminalId !== terminalId || !this.isConnected) {
                clearInterval(this.readIntervalId);
                this.readIntervalId = null;
                return;
            }

            try {
                const result = await window.__TAURI__.core.invoke('read_terminal', {
                    id: terminalId
                });

                if (result.success && result.data && result.data.length > 0) {
                    this.term.write(result.data);
                }
            } catch (error) {
                console.error('Error reading terminal:', error);
            }
        }, 50);
    }

    stopReading() {
        if (this.readIntervalId) {
            clearInterval(this.readIntervalId);
            this.readIntervalId = null;
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

    async createTab(shellType) {
        const tabId = `tab-${++this.tabIdCounter}`;
        const cwd = state?.projectPath || null;

        console.log(`Creating terminal tab: ${tabId} with shell: ${shellType}`);

        // Create tab object
        const tab = new TerminalTab(tabId, shellType, cwd);
        this.tabs.set(tabId, tab);

        // Create tab button in tab bar
        this.addTabButton(tabId, shellType);

        // Initialize the terminal
        await tab.init(this.tabContent);

        // Switch to the new tab
        this.switchTab(tabId);
    }

    addTabButton(tabId, shellType) {
        const tabsContainer = document.getElementById('terminalTabs');
        if (!tabsContainer) return;

        const shellNames = {
            'powershell': 'PS',
            'cmd': 'CMD',
            'gitbash': 'Bash'
        };

        const tabBtn = document.createElement('div');
        tabBtn.className = 'terminal-tab';
        tabBtn.id = `btn-${tabId}`;
        tabBtn.innerHTML = `
            <span class="tab-label">${shellNames[shellType] || shellType} ${this.tabIdCounter}</span>
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
}

// Initialize terminal component
let terminal;
