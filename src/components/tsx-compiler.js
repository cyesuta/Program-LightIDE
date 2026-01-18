/**
 * LightIDE - TSX/JSX Preview Compiler
 * Uses esbuild-wasm to compile React components for preview
 */

class TsxPreviewCompiler {
    constructor() {
        this.esbuild = null;
        this.initialized = false;
        this.initializing = false;
        this.initError = null;
    }

    async init() {
        if (this.initialized) return true;
        if (this.initError) throw this.initError;

        if (this.initializing) {
            while (this.initializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            if (this.initError) throw this.initError;
            return this.initialized;
        }

        this.initializing = true;
        console.log('[TSX Compiler] Initializing esbuild-wasm...');

        try {
            await this.loadScript('https://cdn.jsdelivr.net/npm/esbuild-wasm@0.20.0/lib/browser.min.js');

            if (!window.esbuild) {
                throw new Error('esbuild not loaded');
            }

            this.esbuild = window.esbuild;

            await this.esbuild.initialize({
                wasmURL: 'https://cdn.jsdelivr.net/npm/esbuild-wasm@0.20.0/esbuild.wasm'
            });

            this.initialized = true;
            console.log('[TSX Compiler] Initialized successfully');
            return true;
        } catch (error) {
            console.error('[TSX Compiler] Failed to initialize:', error);
            this.initError = error;
            throw error;
        } finally {
            this.initializing = false;
        }
    }

    loadScript(src) {
        return new Promise((resolve, reject) => {
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve();
                return;
            }
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = () => reject(new Error(`Failed to load: ${src}`));
            document.head.appendChild(script);
        });
    }

    async compile(code, filename = 'component.tsx') {
        await this.init();

        try {
            const result = await this.esbuild.transform(code, {
                loader: filename.endsWith('.tsx') ? 'tsx' : 'jsx',
                jsx: 'transform',
                jsxFactory: 'React.createElement',
                jsxFragment: 'React.Fragment',
                format: 'iife',
                globalName: '__TSXModule__',
                target: 'es2020'
            });

            return {
                success: true,
                code: result.code,
                warnings: result.warnings
            };
        } catch (error) {
            console.error('[TSX Compiler] Compile error:', error);
            return {
                success: false,
                error: error.message || String(error),
                location: error.location
            };
        }
    }

    generatePreviewHtml(compiledCode, originalCode) {
        // Extract component name from code
        const componentMatch = originalCode.match(/(?:export\s+default\s+function|function|const)\s+([A-Z][a-zA-Z0-9]*)/);
        const componentName = componentMatch ? componentMatch[1] : 'App';

        // Create HTML with proper escaping
        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.jsdelivr.net/npm/react@18/umd/react.production.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/react-dom@18/umd/react-dom.production.min.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            padding: 16px;
            background: #fff;
            color: #333;
        }
        button {
            padding: 8px 16px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            margin: 4px;
        }
        button:hover { background: #0056b3; }
        input, textarea, select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            margin: 4px;
        }
        h1 { font-size: 2em; margin-bottom: 16px; }
        h2 { font-size: 1.5em; margin-bottom: 12px; }
        h3 { font-size: 1.25em; margin-bottom: 8px; }
        p { margin-bottom: 12px; line-height: 1.6; }
        a { color: #007bff; text-decoration: none; }
        img { max-width: 100%; }
        .flex { display: flex; }
        .grid { display: grid; }
        .gap-2 { gap: 8px; }
        .gap-4 { gap: 16px; }
        .p-4 { padding: 16px; }
        .rounded { border-radius: 8px; }
        .shadow { box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .border { border: 1px solid #e0e0e0; }
        .text-center { text-align: center; }
        .font-bold { font-weight: bold; }
        .error-container {
            background: #fee;
            border: 1px solid #f88;
            color: #c00;
            padding: 16px;
            border-radius: 8px;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script>
        // Polyfill require for CommonJS modules
        function require(name) {
            if (name === 'react' || name.startsWith('react')) return React;
            if (name === 'react-dom' || name.startsWith('react-dom')) return ReactDOM;
            console.warn('Unknown module:', name);
            return {};
        }
        
        var exports = {};
        var module = { exports: exports };
        
        var useState = React.useState;
        var useEffect = React.useEffect;
        var useCallback = React.useCallback;
        var useMemo = React.useMemo;
        var useRef = React.useRef;
        var useContext = React.useContext;
        var useReducer = React.useReducer;
        
        function Link(props) {
            return React.createElement('a', Object.assign({}, props, { href: props.to || '#' }), props.children);
        }

        try {
            ${compiledCode}
            
            var ComponentToRender = null;
            
            // Try to find the component in various places
            if (typeof __TSXModule__ !== 'undefined') {
                ComponentToRender = __TSXModule__.default || __TSXModule__.${componentName} || __TSXModule__;
            }
            if (!ComponentToRender && typeof ${componentName} !== 'undefined') {
                ComponentToRender = ${componentName};
            }
            if (!ComponentToRender && module.exports.default) {
                ComponentToRender = module.exports.default;
            }
            if (!ComponentToRender && exports.default) {
                ComponentToRender = exports.default;
            }
            
            if (ComponentToRender && typeof ComponentToRender === 'function') {
                var root = ReactDOM.createRoot(document.getElementById('root'));
                root.render(React.createElement(ComponentToRender));
            } else {
                document.getElementById('root').innerHTML = '<div class="error-container">找不到可渲染的組件: ${componentName}</div>';
            }
        } catch (error) {
            document.getElementById('root').innerHTML = '<div class="error-container"><strong>渲染錯誤:</strong> ' + error.message + '</div>';
            console.error(error);
        }
    </script>
</body>
</html>`;
        return html;
    }

    generateErrorHtml(error, location) {
        const loc = location ? '<div style="margin-top:8px;font-size:12px;">行 ' + location.line + '</div>' : '';
        const escapedError = this.escapeHtml(String(error));
        return '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:sans-serif;padding:24px;background:#2d1b1b;color:#ff6b6b;}.box{background:#3d2525;border:1px solid #ff6b6b;border-radius:8px;padding:16px;}.title{font-weight:bold;margin-bottom:12px;}.msg{font-family:monospace;white-space:pre-wrap;color:#ffaaaa;font-size:13px;}</style></head><body><div class="box"><div class="title">❌ 編譯錯誤</div><div class="msg">' + escapedError + '</div>' + loc + '</div></body></html>';
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

const tsxCompiler = new TsxPreviewCompiler();
