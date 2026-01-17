/**
 * LightIDE - Terminal Component with xterm.js
 * Professional terminal emulation using xterm.js
 */

class TerminalComponent {
    constructor() {
        this.xtermContainer = document.getElementById('xtermContainer');
        this.panel = document.getElementById('terminalPanel');
        this.closeBtn = document.getElementById('closeTerminalBtn');

        this.term = null;
        this.fitAddon = null;
        this.terminalId = null;
        this.shellType = 'powershell';
        this.isConnected = false;
        this.readIntervalId = null;

        this.init();
    }

    init() {
        console.log('Terminal component initializing with xterm.js...');

        // Wait for xterm.js to load
        if (typeof Terminal === 'undefined') {
            console.error('xterm.js not loaded yet, retrying...');
            setTimeout(() => this.init(), 100);
            return;
        }

        // Initialize xterm.js
        this.initXterm();

        // Add shell selector to header
        this.addShellSelector();

        // Close button
        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.toggle());
        }

        // Start terminal after a short delay
        setTimeout(() => {
            this.startTerminal();
        }, 500);
    }

    initXterm() {
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

        if (typeof WebLinksAddon !== 'undefined') {
            const webLinksAddon = new WebLinksAddon.WebLinksAddon();
            this.term.loadAddon(webLinksAddon);
        }

        // Open terminal in container
        this.term.open(this.xtermContainer);

        // Fit terminal to container
        if (this.fitAddon) {
            setTimeout(() => {
                this.fitAddon.fit();
            }, 100);
        }

        // Handle terminal input
        this.term.onData((data) => {
            this.sendInput(data);
        });

        // Handle resize
        window.addEventListener('resize', () => {
            this.fit();
        });

        // Observe container size changes
        const resizeObserver = new ResizeObserver(() => {
            this.fit();
        });
        resizeObserver.observe(this.xtermContainer);

        console.log('xterm.js initialized successfully');
    }

    fit() {
        if (this.fitAddon && this.term) {
            try {
                this.fitAddon.fit();
                // Notify backend of size change
                if (this.terminalId && this.isConnected) {
                    const dims = { cols: this.term.cols, rows: this.term.rows };
                    this.resizeTerminal(dims.cols, dims.rows);
                }
            } catch (e) {
                // Ignore fit errors during transitions
            }
        }
    }

    addShellSelector() {
        const header = this.panel?.querySelector('.panel-header');
        if (!header) {
            console.warn('Terminal header not found');
            return;
        }

        // Check if already added
        if (header.querySelector('.shell-selector')) return;

        // Create shell selector
        const selector = document.createElement('select');
        selector.className = 'shell-selector';
        selector.innerHTML = `
            <option value="powershell">PowerShell</option>
            <option value="cmd">CMD</option>
            <option value="gitbash">Git Bash</option>
        `;
        selector.value = this.shellType;

        selector.addEventListener('change', async (e) => {
            this.shellType = e.target.value;
            await this.restartTerminal();
        });

        // Insert before close button
        header.insertBefore(selector, this.closeBtn);

        // Add new terminal button
        const newBtn = document.createElement('button');
        newBtn.className = 'panel-btn';
        newBtn.title = '重新啟動終端機';
        newBtn.innerHTML = '↻';
        newBtn.addEventListener('click', () => this.restartTerminal());
        header.insertBefore(newBtn, selector);
    }

    async startTerminal() {
        console.log('=== Starting terminal ===');

        // Stop any existing reading
        this.stopReading();

        // Check if Tauri is available
        if (!window.__TAURI__ || !window.__TAURI__.core) {
            console.error('Tauri not available');
            this.term.writeln('\x1b[31m✗ Tauri API 不可用\x1b[0m');
            return;
        }

        try {
            // Clear terminal and show status
            this.term.clear();
            this.term.writeln(`\x1b[36m正在啟動 ${this.shellType.toUpperCase()}...\x1b[0m`);

            const cwd = state?.projectPath || null;
            console.log('Creating terminal with shell:', this.shellType, 'cwd:', cwd);

            const result = await window.__TAURI__.core.invoke('create_terminal', {
                shell: this.shellType,
                cwd: cwd
            });

            console.log('create_terminal result:', result);

            if (result.success) {
                this.terminalId = result.data.id;
                this.isConnected = true;
                this.term.writeln(`\x1b[32m✓ 終端機已連接 (${this.shellType})\x1b[0m`);
                this.term.writeln('');

                console.log('Terminal connected, ID:', this.terminalId);

                // Fit and notify backend of size
                this.fit();

                // Start reading with a small delay
                setTimeout(() => {
                    this.startReading();
                }, 200);

                // Focus terminal
                this.term.focus();
            } else {
                this.term.writeln(`\x1b[31m✗ 錯誤: ${result.error}\x1b[0m`);
                console.error('Terminal creation failed:', result.error);
            }
        } catch (error) {
            console.error('Failed to start terminal:', error);
            this.term.writeln(`\x1b[31m✗ 啟動失敗: ${error.message || error}\x1b[0m`);
        }
    }

    async restartTerminal() {
        console.log('=== Restarting terminal ===');

        // Stop reading first
        this.stopReading();

        // Close existing terminal
        if (this.terminalId) {
            try {
                await window.__TAURI__.core.invoke('close_terminal', { id: this.terminalId });
            } catch (e) {
                console.warn('Error closing terminal:', e);
            }
            this.terminalId = null;
            this.isConnected = false;
        }

        // Start new terminal
        await this.startTerminal();
    }

    startReading() {
        console.log('=== Starting reading loop ===');

        if (this.readIntervalId) {
            clearInterval(this.readIntervalId);
            this.readIntervalId = null;
        }

        if (!this.terminalId || !this.isConnected) {
            console.warn('Cannot start reading: not connected');
            return;
        }

        const terminalId = this.terminalId;

        this.readIntervalId = setInterval(async () => {
            if (this.terminalId !== terminalId || !this.isConnected) {
                console.log('Terminal changed, stopping read loop');
                clearInterval(this.readIntervalId);
                this.readIntervalId = null;
                return;
            }

            try {
                const result = await window.__TAURI__.core.invoke('read_terminal', {
                    id: terminalId
                });

                if (result.success && result.data && result.data.length > 0) {
                    // Write raw output to xterm - it handles ANSI codes!
                    this.term.write(result.data);
                }

                if (!result.success) {
                    console.error('read_terminal failed:', result.error);
                }
            } catch (error) {
                console.error('Error reading terminal:', error);
            }
        }, 50); // Read more frequently for smoother output

        console.log('Read interval started');
    }

    stopReading() {
        if (this.readIntervalId) {
            console.log('Stopping read interval');
            clearInterval(this.readIntervalId);
            this.readIntervalId = null;
        }
    }

    async sendInput(data) {
        if (!this.terminalId || !this.isConnected) {
            console.error('Cannot send input: terminal not connected');
            return;
        }

        try {
            const result = await window.__TAURI__.core.invoke('write_terminal', {
                id: this.terminalId,
                input: data
            });

            if (!result.success) {
                console.error('write_terminal failed:', result.error);
            }
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
            // Resize may not be implemented, ignore
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
            this.fit();
            this.term?.focus();
            if (!this.isConnected) {
                this.startTerminal();
            }
        }
    }

    show() {
        if (state) state.rightPanelVisible = true;
        if (this.panel) this.panel.style.display = 'flex';
        this.fit();
        this.term?.focus();
        if (!this.isConnected) {
            this.startTerminal();
        }
    }

    hide() {
        if (state) state.rightPanelVisible = false;
        if (this.panel) this.panel.style.display = 'none';
    }

    async destroy() {
        this.stopReading();
        if (this.terminalId) {
            try {
                await window.__TAURI__.core.invoke('close_terminal', { id: this.terminalId });
            } catch (e) {
                console.warn('Error closing terminal:', e);
            }
        }
        if (this.term) {
            this.term.dispose();
        }
    }
}

// Initialize terminal component
let terminal;
