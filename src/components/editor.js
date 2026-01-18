/**
 * LightIDE - Code Editor Component
 */

class EditorComponent {
    constructor() {
        this.container = document.getElementById('editorContainer');
        this.welcomeScreen = document.getElementById('welcomeScreen');
        this.codeEditorWrapper = document.getElementById('codeEditorWrapper');
        this.codeEditor = document.getElementById('codeEditor');
        this.lineNumbers = document.getElementById('lineNumbers');
        this.codeInput = document.getElementById('codeInput');
        this.codeHighlight = document.getElementById('codeHighlight');
        this.tabContainer = document.getElementById('tabContainer');

        // Split view elements
        this.editorSection = document.getElementById('editorSection');
        this.previewSection = document.getElementById('previewSection');
        this.previewContent = document.getElementById('previewContent');
        this.previewFrame = document.getElementById('previewFrame');
        this.togglePreviewBtn = document.getElementById('togglePreviewBtn');
        this.refreshPreviewBtn = document.getElementById('refreshPreviewBtn');

        // Performance optimization
        this.debounceTimer = null;
        this.previewDebounceTimer = null;
        this.debounceDelay = 150; // ms
        this.previewDebounceDelay = 300; // ms for preview updates
        this.lineHeight = 21; // pixels per line (matches CSS)
        this.visibleLineBuffer = 10; // extra lines to render above/below viewport
        this.cachedLineCount = 0;
        this.largeFileThreshold = 500; // disable syntax highlighting above this

        // Preview state
        this.previewEnabled = true; // Default to enabled for previewable files

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

        // Preview button handlers
        if (this.togglePreviewBtn) {
            this.togglePreviewBtn.addEventListener('click', () => this.togglePreview());
        }
        if (this.refreshPreviewBtn) {
            this.refreshPreviewBtn.addEventListener('click', () => this.updatePreview());
        }
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

        // Debounce preview update (separate timer, slightly longer delay)
        if (this.isPreviewableFile(doc?.language)) {
            if (this.previewDebounceTimer) {
                clearTimeout(this.previewDebounceTimer);
            }
            this.previewDebounceTimer = setTimeout(() => {
                this.updatePreview();
            }, this.previewDebounceDelay);
        }
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
        this.codeEditorWrapper.style.display = 'flex';

        this.codeInput.value = doc.content;
        this.updateLineNumbers();
        this.highlightSyntax();
        this.updateTabs();

        // Check if this is a previewable file (Markdown or HTML)
        const isPreviewable = this.isPreviewableFile(doc.language);

        // Show/hide preview toggle button
        if (this.togglePreviewBtn) {
            this.togglePreviewBtn.style.display = isPreviewable ? 'flex' : 'none';
        }

        // Setup preview for previewable files
        if (isPreviewable && this.previewEnabled) {
            this.showPreview(true);
            this.updatePreview();
        } else {
            this.showPreview(false);
        }

        // Focus the editor
        this.codeInput.focus();
    }

    showWelcome() {
        this.welcomeScreen.style.display = 'flex';
        this.codeEditorWrapper.style.display = 'none';
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

        // Toggle preview shortcut (Ctrl+Shift+P)
        if (e.ctrlKey && e.shiftKey && e.key === 'P') {
            e.preventDefault();
            const doc = state.getActiveDocument();
            if (doc && this.isPreviewableFile(doc.language)) {
                this.togglePreview();
            }
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

    // ============================================
    // Preview Methods
    // ============================================

    isPreviewableFile(language) {
        return language === 'markdown' || language === 'html';
    }

    togglePreview() {
        this.previewEnabled = !this.previewEnabled;
        this.showPreview(this.previewEnabled);

        if (this.previewEnabled) {
            this.updatePreview();
        }

        // Update button state
        if (this.togglePreviewBtn) {
            this.togglePreviewBtn.classList.toggle('active', this.previewEnabled);
        }
    }

    showPreview(show) {
        if (!this.previewSection || !this.editorSection) return;

        if (show) {
            this.previewSection.style.display = 'flex';
            this.editorSection.classList.add('with-preview');
        } else {
            this.previewSection.style.display = 'none';
            this.editorSection.classList.remove('with-preview');
        }
    }

    updatePreview() {
        const doc = state.getActiveDocument();
        if (!doc || !this.previewEnabled) return;

        const content = this.codeInput.value;

        if (doc.language === 'markdown') {
            this.updateMarkdownPreview(content);
        } else if (doc.language === 'html') {
            this.updateHtmlPreview(content);
        }
    }

    updateMarkdownPreview(content) {
        if (!this.previewContent) return;

        // Use div for Markdown preview (with our styles)
        this.previewContent.classList.add('markdown-preview');

        // Remove iframe if present
        if (this.previewFrame) {
            this.previewFrame.style.display = 'none';
        }

        // Parse and render Markdown
        const html = this.parseMarkdown(content);

        // Create or update preview div
        let previewDiv = this.previewContent.querySelector('.markdown-render');
        if (!previewDiv) {
            previewDiv = document.createElement('div');
            previewDiv.className = 'markdown-render';
            this.previewContent.appendChild(previewDiv);
        }
        previewDiv.innerHTML = html;
    }

    updateHtmlPreview(content) {
        if (!this.previewFrame || !this.previewContent) return;

        // Use iframe for HTML preview
        this.previewContent.classList.remove('markdown-preview');
        this.previewFrame.style.display = 'block';

        // Remove markdown preview div if present
        const markdownDiv = this.previewContent.querySelector('.markdown-render');
        if (markdownDiv) {
            markdownDiv.remove();
        }

        // Use srcdoc for better compatibility with sandbox
        this.previewFrame.srcdoc = content;
    }

    // Simple Markdown parser
    parseMarkdown(text) {
        if (!text) return '';

        let html = text;

        // Escape HTML first
        html = html
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        // Code blocks (```)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return `<pre><code class="language-${lang}">${code.trim()}</code></pre>`;
        });

        // Inline code (`)
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers
        html = html.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>');
        html = html.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>');
        html = html.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
        html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

        // Bold and Italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');

        // Strikethrough
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // Images
        html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');

        // Horizontal rule
        html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

        // Blockquotes
        html = html.replace(/^>\s+(.*)$/gm, '<blockquote>$1</blockquote>');
        // Merge consecutive blockquotes
        html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

        // Unordered lists
        html = html.replace(/^[\*\-]\s+(.*)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

        // Ordered lists
        html = html.replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>');

        // Tables (basic support)
        html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
            const cells = content.split('|').map(cell => cell.trim());
            const isHeader = cells.every(cell => /^[-:]+$/.test(cell));
            if (isHeader) return '';
            const cellTag = 'td';
            return '<tr>' + cells.map(cell => `<${cellTag}>${cell}</${cellTag}>`).join('') + '</tr>';
        });
        html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');

        // Paragraphs
        html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');

        // Clean up empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');

        // Line breaks
        html = html.replace(/\n\n+/g, '\n');

        return html;
    }
}

// Initialize editor component
let editor;

