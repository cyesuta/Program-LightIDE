/**
 * LightIDE - Status Bar Component
 */

class StatusBarComponent {
    constructor() {
        this.fileElement = document.getElementById('statusFile');
        this.positionElement = document.getElementById('statusPosition');
        this.languageElement = document.getElementById('statusLanguage');

        this.init();
    }

    init() {
        // Listen for state changes
        state.on('activeDocumentChanged', (doc) => this.update(doc));
        state.on('cursorChanged', ({ line, column }) => this.updatePosition(line, column));
        state.on('documentModified', () => this.updateModified());
        state.on('documentSaved', () => this.updateModified());
    }

    update(doc) {
        if (!doc) {
            this.fileElement.textContent = '';
            this.languageElement.textContent = '';
            return;
        }

        const fileName = doc.path.split(/[/\\]/).pop();
        const modified = doc.modified ? ' ●' : '';
        this.fileElement.textContent = fileName + modified;

        // Language
        const languageNames = {
            'rust': 'Rust',
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'python': 'Python',
            'go': 'Go',
            'html': 'HTML',
            'css': 'CSS',
            'json': 'JSON',
            'toml': 'TOML',
            'yaml': 'YAML',
            'markdown': 'Markdown',
            'text': 'Plain Text'
        };
        this.languageElement.textContent = languageNames[doc.language] || doc.language || '';

        // Update position
        this.updatePosition(doc.cursorLine || 1, doc.cursorColumn || 1);
    }

    updatePosition(line, column) {
        this.positionElement.textContent = `Ln ${line}, Col ${column}`;
    }

    updateModified() {
        const doc = state.getActiveDocument();
        if (doc) {
            const fileName = doc.path.split(/[/\\]/).pop();
            const modified = doc.modified ? ' ●' : '';
            this.fileElement.textContent = fileName + modified;
        }
    }
}

// Initialize status bar component
let statusBar;
