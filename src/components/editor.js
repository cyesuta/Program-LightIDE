/**
 * LightIDE - Code Editor Component
 */

class EditorComponent {
    constructor() {
        this.container = document.getElementById('editorContainer');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.codeEditor = document.getElementById('codeEditor');
        this.lineNumbers = document.getElementById('lineNumbers');
        this.codeInput = document.getElementById('codeInput');
        this.codeHighlight = document.getElementById('codeHighlight');
        this.tabContainer = document.getElementById('tabContainer');

        // Performance optimization
        this.debounceTimer = null;
        this.debounceDelay = 150; // ms
        this.lineHeight = 21; // pixels per line (matches CSS)
        this.visibleLineBuffer = 10; // extra lines to render above/below viewport
        this.cachedLineCount = 0;
        this.largeFileThreshold = 500; // disable syntax highlighting above this

        this.init();
    }

    init() {
        // Listen for state changes
        state.on('documentOpened', (doc) => this.showEditor(doc));
        state.on('activeDocumentChanged', (doc) => this.showEditor(doc));
        state.on('documentClosed', () => this.handleDocumentClosed());
        state.on('documentModified', () => this.updateTabs());
        state.on('documentSaved', () => this.updateTabs());

        // Editor input events - use debounced handler for expensive operations
        this.codeInput.addEventListener('input', () => this.handleInputDebounced());
        this.codeInput.addEventListener('scroll', () => this.syncScroll());
        this.codeInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
        this.codeInput.addEventListener('click', () => this.updateCursor());
        this.codeInput.addEventListener('keyup', () => this.updateCursor());
    }

    // Debounced input handler to prevent freezing on large files
    handleInputDebounced() {
        const doc = state.getActiveDocument();
        if (doc) {
            // Update content immediately (this is cheap)
            state.updateDocumentContent(doc.path, this.codeInput.value);
        }

        // Quick line count update (for small changes)
        this.updateLineCountFast();

        // Debounce expensive operations
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.updateLineNumbers();
            this.highlightSyntax();
        }, this.debounceDelay);
    }

    // Fast line count check - only updates if count changed
    updateLineCountFast() {
        const newLineCount = (this.codeInput.value.match(/\n/g) || []).length + 1;
        if (newLineCount !== this.cachedLineCount) {
            this.cachedLineCount = newLineCount;
            this.updateLineNumbers();
        }
    }

    showEditor(doc) {
        if (!doc) {
            this.showWelcome();
            return;
        }

        this.welcomeScreen.style.display = 'none';
        this.codeEditor.style.display = 'flex';

        this.codeInput.value = doc.content;
        this.updateLineNumbers();
        this.highlightSyntax();
        this.updateTabs();

        // Focus the editor
        this.codeInput.focus();
    }

    showWelcome() {
        this.welcomeScreen.style.display = 'flex';
        this.codeEditor.style.display = 'none';
        this.updateTabs();
    }

    handleDocumentClosed() {
        const activeDoc = state.getActiveDocument();
        if (activeDoc) {
            this.showEditor(activeDoc);
        } else {
            this.showWelcome();
        }
    }

    // Legacy handler - kept for Tab key handling
    handleInput() {
        this.handleInputDebounced();
    }

    handleKeyDown(e) {
        // Tab key
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.codeInput.selectionStart;
            const end = this.codeInput.selectionEnd;
            const value = this.codeInput.value;

            // Insert 4 spaces
            this.codeInput.value = value.substring(0, start) + '    ' + value.substring(end);
            this.codeInput.selectionStart = this.codeInput.selectionEnd = start + 4;
            this.handleInput();
        }

        // Save shortcut
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            this.saveCurrentDocument();
        }
    }

    updateCursor() {
        const value = this.codeInput.value;
        const pos = this.codeInput.selectionStart;

        // Calculate line and column
        const lines = value.substring(0, pos).split('\n');
        const line = lines.length;
        const column = lines[lines.length - 1].length + 1;

        state.setCursor(line, column);
    }

    syncScroll() {
        this.codeHighlight.scrollTop = this.codeInput.scrollTop;
        this.codeHighlight.scrollLeft = this.codeInput.scrollLeft;
        this.lineNumbers.scrollTop = this.codeInput.scrollTop;
    }

    updateLineNumbers() {
        const lineCount = (this.codeInput.value.match(/\n/g) || []).length + 1;
        this.cachedLineCount = lineCount;

        // For large files, use CSS counter technique for better performance
        if (lineCount > 1000) {
            // Use a spacer div for height instead of individual line elements
            const totalHeight = lineCount * this.lineHeight;
            this.lineNumbers.innerHTML = `
                <div class="line-numbers-virtual" style="height: ${totalHeight}px;">
                    <style>
                        .line-numbers-virtual::before {
                            content: '${Array.from({ length: Math.min(lineCount, 100) }, (_, i) => i + 1).join('\\A')}';
                            white-space: pre;
                            display: block;
                        }
                    </style>
                </div>
            `;
            // Show simple line count indicator for very large files
            this.lineNumbers.innerHTML = `
                <div class="line-numbers-large" style="height: ${totalHeight}px;">
                    ${Array.from({ length: lineCount }, (_, i) => `<div class="line-number">${i + 1}</div>`).join('')}
                </div>
            `;
        } else {
            // For normal files, use standard approach
            let html = '';
            for (let i = 1; i <= lineCount; i++) {
                html += `<div class="line-number">${i}</div>`;
            }
            this.lineNumbers.innerHTML = html;
        }
    }

    highlightSyntax() {
        const doc = state.getActiveDocument();
        const code = this.codeInput.value;

        if (!doc) {
            this.codeHighlight.textContent = code;
            return;
        }

        // Disable syntax highlighting for large files to prevent freezing
        const lineCount = this.cachedLineCount || (code.match(/\n/g) || []).length + 1;
        if (lineCount > this.largeFileThreshold) {
            // For large files, just show plain text with HTML escaping
            this.codeHighlight.textContent = code;
            return;
        }

        // Simple syntax highlighting (only for smaller files)
        const highlighted = this.highlight(code, doc.language);
        this.codeHighlight.innerHTML = highlighted;
    }

    highlight(code, language) {
        // Escape HTML
        let escaped = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Apply syntax highlighting based on language
        const patterns = this.getPatterns(language);

        patterns.forEach(({ regex, className }) => {
            escaped = escaped.replace(regex, (match) => {
                // Avoid double-wrapping
                if (match.includes('<span')) return match;
                return `<span class="${className}">${match}</span>`;
            });
        });

        return escaped;
    }

    getPatterns(language) {
        const commonPatterns = [
            // Comments
            { regex: /(\/\/.*$)/gm, className: 'syntax-comment' },
            { regex: /(\/\*[\s\S]*?\*\/)/g, className: 'syntax-comment' },
            // Strings
            { regex: /("(?:[^"\\]|\\.)*")/g, className: 'syntax-string' },
            { regex: /('(?:[^'\\]|\\.)*')/g, className: 'syntax-string' },
            { regex: /(`(?:[^`\\]|\\.)*`)/g, className: 'syntax-string' },
            // Numbers
            { regex: /\b(\d+\.?\d*)\b/g, className: 'syntax-number' },
        ];

        const languagePatterns = {
            rust: [
                { regex: /\b(fn|let|const|static|mut|pub|mod|use|crate|self|super|if|else|match|loop|while|for|in|break|continue|return|struct|enum|impl|trait|type|where|async|await|move|ref|as|dyn|unsafe)\b/g, className: 'syntax-keyword' },
                { regex: /\b(Self|String|Vec|Option|Result|Box|Rc|Arc|HashMap|HashSet|bool|char|str|i8|i16|i32|i64|i128|isize|u8|u16|u32|u64|u128|usize|f32|f64)\b/g, className: 'syntax-type' },
                { regex: /\b(true|false|None|Some|Ok|Err)\b/g, className: 'syntax-constant' },
            ],
            javascript: [
                { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|class|extends|new|this|super|import|export|default|async|await|yield)\b/g, className: 'syntax-keyword' },
                { regex: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'syntax-constant' },
            ],
            typescript: [
                { regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|class|extends|new|this|super|import|export|default|async|await|yield|type|interface|enum|implements|private|public|protected|readonly)\b/g, className: 'syntax-keyword' },
                { regex: /\b(true|false|null|undefined|NaN|Infinity)\b/g, className: 'syntax-constant' },
                { regex: /\b(string|number|boolean|any|void|never|unknown|object)\b/g, className: 'syntax-type' },
            ],
            python: [
                { regex: /\b(def|class|return|if|elif|else|for|while|try|except|finally|raise|import|from|as|with|lambda|yield|global|nonlocal|pass|break|continue|and|or|not|in|is)\b/g, className: 'syntax-keyword' },
                { regex: /\b(True|False|None)\b/g, className: 'syntax-constant' },
            ],
            html: [
                { regex: /(&lt;\/?[a-zA-Z][a-zA-Z0-9]*)/g, className: 'syntax-keyword' },
                { regex: /(\s[a-zA-Z-]+)=/g, className: 'syntax-attribute' },
            ],
            css: [
                { regex: /([.#][a-zA-Z_-][a-zA-Z0-9_-]*)/g, className: 'syntax-keyword' },
                { regex: /([a-zA-Z-]+):/g, className: 'syntax-attribute' },
            ]
        };

        return [...commonPatterns, ...(languagePatterns[language] || [])];
    }

    updateTabs() {
        const docs = Array.from(state.documents.values());

        if (docs.length === 0) {
            this.tabContainer.innerHTML = '';
            return;
        }

        let html = '';
        docs.forEach(doc => {
            const fileName = doc.path.split(/[/\\]/).pop();
            const isActive = doc.path === state.activeDocument;
            const icon = this.getFileIcon(doc.path);

            html += `
                <div class="tab ${isActive ? 'active' : ''}" data-path="${doc.path}">
                    <span class="tab-icon">${icon}</span>
                    <span class="tab-name">${fileName}</span>
                    ${doc.modified ? '<span class="tab-modified"></span>' : ''}
                    <span class="tab-close" data-path="${doc.path}">✕</span>
                </div>
            `;
        });

        this.tabContainer.innerHTML = html;

        // Add click handlers
        this.tabContainer.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                if (!e.target.classList.contains('tab-close')) {
                    state.setActiveDocument(tab.dataset.path);
                }
            });
        });

        this.tabContainer.querySelectorAll('.tab-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(btn.dataset.path);
            });
        });
    }

    getFileIcon(path) {
        const ext = path.split('.').pop()?.toLowerCase();
        const icons = {
            'rs': '🦀',
            'js': '📜',
            'jsx': '📜',
            'ts': '📘',
            'tsx': '📘',
            'py': '🐍',
            'go': '🔵',
            'html': '🌐',
            'htm': '🌐',
            'css': '🎨',
            'scss': '🎨',
            'json': '📋',
            'toml': '⚙️',
            'yaml': '⚙️',
            'yml': '⚙️',
            'md': '📝'
        };
        return icons[ext] || '📄';
    }

    closeTab(path) {
        const doc = state.documents.get(path);
        if (doc?.modified) {
            if (!confirm(`${path.split(/[/\\]/).pop()} 有未儲存的變更，確定要關閉嗎？`)) {
                return;
            }
        }
        state.closeDocument(path);
    }

    async saveCurrentDocument() {
        const doc = state.getActiveDocument();
        if (!doc) return;

        try {
            const result = await window.__TAURI__.core.invoke('save_file', {
                path: doc.path,
                content: this.codeInput.value
            });

            if (result.success) {
                state.markDocumentSaved(doc.path);
            } else {
                alert('儲存失敗: ' + result.error);
            }
        } catch (error) {
            console.error('Error saving file:', error);
        }
    }
}

// Initialize editor component
let editor;
