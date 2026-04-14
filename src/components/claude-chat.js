/**
 * LightIDE - Claude Chat Component
 * Multi-workspace: each workspace has its own messages DOM and state.
 * Events from sidecar are routed by workspaceId.
 */

class ClaudeWorkspaceView {
    constructor(workspaceId, parent) {
        this.workspaceId = workspaceId;
        this.messagesEl = document.createElement('div');
        this.messagesEl.className = 'claude-messages';
        this.messagesEl.dataset.wsId = workspaceId;
        this.messagesEl.innerHTML = `
            <div class="claude-welcome">
                <div class="claude-welcome-icon">⚡</div>
                <div class="claude-welcome-text">Claude Code</div>
                <div class="claude-welcome-hint">使用已登入的 Claude 帳號</div>
            </div>
        `;
        parent.appendChild(this.messagesEl);

        // Per-workspace state
        this.isProcessing = false;
        this.currentAssistantEl = null;
        this.thinkingEl = null;
        this.pendingTools = new Map();
        // Tokens broken down: input=new (full price), cache=cached (10% price), output
        this.totalTokens = { input: 0, cache: 0, output: 0, cost: 0 };
        this.startTime = null;
        this.timerInterval = null;
    }

    show() { this.messagesEl.style.display = 'flex'; }
    hide() { this.messagesEl.style.display = 'none'; }
    destroy() {
        this.stopTimer();
        this.messagesEl.remove();
    }

    startTimer(updateCallback) {
        this.startTime = Date.now();
        this.totalTokens = { input: 0, output: 0 };
        updateCallback();
        this.timerInterval = setInterval(updateCallback, 100);
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    getElapsed() {
        if (!this.startTime) return 0;
        return (Date.now() - this.startTime) / 1000;
    }
}

class ClaudeChatComponent {
    constructor() {
        this.container = null;
        this.messagesWrapper = null; // parent that holds all workspace views
        this.inputEl = null;
        this.sendBtn = null;
        this.timerEl = null;
        this.tokensEl = null;

        // workspaceId -> ClaudeWorkspaceView
        this.views = new Map();
        this.activeWorkspaceId = null;

        this._unlisten = null;
    }

    init(parentContainer) {
        this.container = document.createElement('div');
        this.container.className = 'claude-chat';
        this.container.innerHTML = `
            <div class="claude-status-bar">
                <span class="claude-timer" id="claudeTimer"></span>
                <span class="claude-tokens" id="claudeTokens"></span>
            </div>
            <div class="claude-messages-wrapper" id="claudeMessagesWrapper"></div>
            <div class="claude-input-area">
                <div class="claude-input-row">
                    <textarea class="claude-input" id="claudeInput" placeholder="輸入訊息..." rows="1"></textarea>
                    <button class="claude-send-btn" id="claudeSendBtn" title="送出 (Enter)">▶</button>
                </div>
                <div class="claude-actions">
                    <select class="claude-model-select" id="claudeModelSelect" title="選擇模型">
                        <optgroup label="4.5 系列">
                            <option value="claude-sonnet-4-5">Sonnet 4.5</option>
                            <option value="claude-haiku-4-5-20251001">Haiku 4.5</option>
                            <option value="claude-opus-4-5">Opus 4.5</option>
                        </optgroup>
                        <optgroup label="4.6 系列">
                            <option value="claude-sonnet-4-6">Sonnet 4.6</option>
                            <option value="claude-opus-4-6">Opus 4.6</option>
                        </optgroup>
                    </select>
                    <select class="claude-model-select" id="claudePromptMode" title="System Prompt 模式">
                        <option value="minimal">省 token (簡化 prompt)</option>
                        <option value="full">完整 (含 CLAUDE.md/hooks)</option>
                    </select>
                    <button class="claude-action-btn" id="claudeResetBtn" title="重置對話 (清除 session)">🔄 新對話</button>
                    <button class="claude-action-btn" id="claudeClearBtn" title="清空顯示 (保留最後 2 輪，session 不變)">🧹 清空</button>
                    <button class="claude-action-btn" id="claudeCompactBtn" title="壓縮目前對話為摘要並開新 session">📦 打包重開</button>
                    <button class="claude-action-btn claude-abort-btn" id="claudeAbortBtn" title="中止" style="display:none;">⏹ 中止</button>
                </div>
                <div class="claude-actions">
                    <button class="claude-action-btn claude-quick-btn" id="claudeCommitBtn" title="git add/commit/push (使用 Haiku 4.5)">📤 Commit + Push</button>
                    <button class="claude-action-btn claude-quick-btn" id="claudeChangelogBtn" title="記錄到 CHANGELOG.md (使用 Haiku 4.5)">📋 記錄 Changelog</button>
                </div>
            </div>
        `;
        parentContainer.appendChild(this.container);

        this.messagesWrapper = this.container.querySelector('#claudeMessagesWrapper');
        this.inputEl = this.container.querySelector('#claudeInput');
        this.sendBtn = this.container.querySelector('#claudeSendBtn');
        this.timerEl = this.container.querySelector('#claudeTimer');
        this.tokensEl = this.container.querySelector('#claudeTokens');

        this.setupListeners();
        this.setupTauriEvents();
    }

    setupListeners() {
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.send();
            }
        });

        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
        });

        this.sendBtn.addEventListener('click', () => this.send());
        this.container.querySelector('#claudeResetBtn').addEventListener('click', () => this.reset());
        this.container.querySelector('#claudeClearBtn').addEventListener('click', () => this.clearDisplay());
        this.container.querySelector('#claudeCompactBtn').addEventListener('click', () => this.compactContext());
        this.container.querySelector('#claudeAbortBtn').addEventListener('click', () => this.abort());

        // Model selector — persist to localStorage
        this.modelSelect = this.container.querySelector('#claudeModelSelect');
        const savedModel = localStorage.getItem('lightide-claude-model');
        if (savedModel) this.modelSelect.value = savedModel;
        this.modelSelect.addEventListener('change', () => {
            localStorage.setItem('lightide-claude-model', this.modelSelect.value);
        });

        // Prompt mode selector — persist
        this.promptModeSelect = this.container.querySelector('#claudePromptMode');
        const savedMode = localStorage.getItem('lightide-claude-prompt-mode');
        if (savedMode) this.promptModeSelect.value = savedMode;
        this.promptModeSelect.addEventListener('change', () => {
            localStorage.setItem('lightide-claude-prompt-mode', this.promptModeSelect.value);
        });

        // Quick action buttons (forced Haiku 4.5)
        this.container.querySelector('#claudeCommitBtn').addEventListener('click', () => {
            this.sendQuick(
                '請執行 git add . && git commit && git push。先 git status 看看改了什麼，根據 diff 寫一個簡潔的 commit message (中文，描述 why 而非 what)，然後 push 到 origin。',
                'claude-haiku-4-5-20251001'
            );
        });
        this.container.querySelector('#claudeChangelogBtn').addEventListener('click', () => {
            this.sendQuick(
                '請更新 CHANGELOG.md。先看一下最近的 git log 和未提交的改動，然後在 CHANGELOG.md 適當位置加入今日的更新項目（用中文，簡潔描述變更）。',
                'claude-haiku-4-5-20251001'
            );
        });

        // Event delegation: double-click any file path to open it in editor
        this.messagesWrapper.addEventListener('dblclick', (e) => {
            const el = e.target.closest('[data-file-path]');
            if (!el) return;
            const path = el.dataset.filePath;
            if (path) this.openFileInEditor(path);
        });
    }

    async openFileInEditor(path) {
        if (typeof fileTree === 'undefined') return;
        try {
            // Reuse the file tree's openFile logic
            await fileTree.openFile(path);
        } catch (e) {
            console.error('Failed to open file:', e);
        }
    }

    setupTauriEvents() {
        if (!window.__TAURI__?.event?.listen) return;
        window.__TAURI__.event.listen('claude-event', (event) => {
            this.handleEvent(event.payload.data);
        }).then(unlisten => { this._unlisten = unlisten; });
    }

    // ========== Workspace management ==========

    getOrCreateView(workspaceId) {
        let view = this.views.get(workspaceId);
        if (!view) {
            view = new ClaudeWorkspaceView(workspaceId, this.messagesWrapper);
            view.hide();
            this.views.set(workspaceId, view);
        }
        return view;
    }

    switchToWorkspace(workspaceId) {
        // Hide all views
        for (const view of this.views.values()) {
            view.hide();
        }
        // Show target
        const view = this.getOrCreateView(workspaceId);
        view.show();
        this.activeWorkspaceId = workspaceId;

        // Update status bar for active view
        this.refreshStatusBar();

        // Update button state
        this.updateButtonState();

        // Focus input
        this.inputEl.focus();
    }

    removeWorkspace(workspaceId) {
        const view = this.views.get(workspaceId);
        if (view) {
            view.destroy();
            this.views.delete(workspaceId);
        }
    }

    getActiveView() {
        return this.views.get(this.activeWorkspaceId);
    }

    // ========== Status bar ==========

    refreshStatusBar() {
        const view = this.getActiveView();
        if (!view) {
            this.timerEl.textContent = '';
            this.tokensEl.textContent = '';
            return;
        }

        if (view.startTime) {
            const elapsed = view.getElapsed().toFixed(1);
            this.timerEl.textContent = `⏱ ${elapsed}s`;
        } else {
            this.timerEl.textContent = '';
        }

        const t = view.totalTokens;
        if (t.output > 0 || t.input > 0 || t.cache > 0) {
            const parts = [];
            if (t.input > 0) parts.push(`↓${this.formatTokens(t.input)}`);
            if (t.cache > 0) parts.push(`💾${this.formatTokens(t.cache)}`);
            if (t.output > 0) parts.push(`↑${this.formatTokens(t.output)}`);
            if (t.cost > 0) parts.push(`$${t.cost.toFixed(4)}`);
            this.tokensEl.textContent = parts.join(' ');
        } else {
            this.tokensEl.textContent = '';
        }
    }

    formatTokens(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(2) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
        return n.toString();
    }

    updateButtonState() {
        const view = this.getActiveView();
        const processing = view?.isProcessing || false;
        this.sendBtn.disabled = processing;
        this.inputEl.disabled = processing;
        this.container.querySelector('#claudeAbortBtn').style.display = processing ? 'inline-flex' : 'none';
    }

    // ========== Send ==========

    async sendQuick(message, forcedModel) {
        // Send a pre-defined message with a forced model (used by quick action buttons)
        const view = this.getActiveView();
        const workspaceId = this.activeWorkspaceId;
        if (!view || !workspaceId || view.isProcessing) return;

        this.addUserMessage(view, message);
        view.isProcessing = true;
        view.currentAssistantEl = null;
        view.pendingTools.clear();
        this.showThinking(view);
        view.startTimer(() => {
            if (this.activeWorkspaceId === view.workspaceId) this.refreshStatusBar();
        });
        this.updateButtonState();

        try {
            const cwd = state?.projectPath || null;
            const ws = workspaceManager?.workspaces?.find(w => w.id === workspaceId);
            const sessionId = ws?.claudeSessionId || null;
            const promptMode = this.promptModeSelect?.value || 'minimal';
            await window.__TAURI__.core.invoke('claude_send_message', {
                message, cwd, workspaceId, sessionId,
                model: forcedModel,
                promptMode,
            });
        } catch (error) {
            this.hideThinking(view);
            this.addSystemMessage(view, '錯誤: ' + (error.message || error));
            view.isProcessing = false;
            view.stopTimer();
            this.updateButtonState();
        }
    }

    async send() {
        const userInput = this.inputEl.value.trim();
        const workspaceId = this.activeWorkspaceId;
        if (!workspaceId) return;

        const view = this.getActiveView();
        if (!userInput || view.isProcessing) return;

        // If we have a prior summary from compact, prepend it to the message (one-time)
        let message = userInput;
        if (view._priorSummary) {
            message = `[從前次對話的摘要繼續]\n${view._priorSummary}\n\n[使用者新訊息]\n${userInput}`;
            view._priorSummary = null;
        }

        this.addUserMessage(view, userInput);
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';

        view.isProcessing = true;
        view.currentAssistantEl = null;
        view.pendingTools.clear();
        this.showThinking(view);

        view.startTimer(() => {
            if (this.activeWorkspaceId === view.workspaceId) {
                this.refreshStatusBar();
            }
        });

        this.updateButtonState();

        try {
            const cwd = state?.projectPath || null;
            // Get saved session_id from workspace for resume across restarts
            const ws = workspaceManager?.workspaces?.find(w => w.id === workspaceId);
            const sessionId = ws?.claudeSessionId || null;
            const model = this.modelSelect?.value || null;
            const promptMode = this.promptModeSelect?.value || 'minimal';
            await window.__TAURI__.core.invoke('claude_send_message', { message, cwd, workspaceId, sessionId, model, promptMode });
        } catch (error) {
            this.hideThinking(view);
            this.addSystemMessage(view, '錯誤: ' + (error.message || error));
            view.isProcessing = false;
            view.stopTimer();
            this.updateButtonState();
        }
    }

    // ========== Event routing ==========

    handleEvent(line) {
        let data;
        try { data = JSON.parse(line); } catch { return; }

        if (data.type === 'ready') return;

        const workspaceId = data.workspaceId || 'default';
        const view = this.getOrCreateView(workspaceId);

        switch (data.type) {
            case 'session':
                // Save session_id to workspace for cross-restart resume
                if (data.sessionId && workspaceManager) {
                    const ws = workspaceManager.workspaces.find(w => w.id === workspaceId);
                    if (ws) {
                        ws.claudeSessionId = data.sessionId;
                        workspaceManager.save();
                    }
                }
                break;

            case 'text':
                this.hideThinking(view);
                this.markPendingToolsDone(view);
                this.appendAssistantText(view, data.text);
                break;

            case 'tool_use':
                this.hideThinking(view);
                this.addToolUseBlock(view, data);
                break;

            case 'tool_result': {
                const toolEl = view.pendingTools.get(data.id);
                if (toolEl) {
                    // If this is a background bash, capture bash_id from the output
                    // (Claude Code returns: "Started ... bash_id: <id>" or similar)
                    if (toolEl.dataset.bgBash === '1' && !toolEl.dataset.bashId && data.output) {
                        const m = data.output.match(/bash_(\d+)/);
                        if (m) toolEl.dataset.bashId = `bash_${m[1]}`;
                    }

                    // If this tool_result was routed to a parent bg bash block (via BashOutput),
                    // append to its streaming log instead of replacing
                    const isAppend = toolEl.dataset.bgBash === '1' && toolEl.dataset.streamLog === '1';
                    if (isAppend && data.output) {
                        const logEl = toolEl.querySelector('.bg-bash-log');
                        if (logEl) {
                            logEl.textContent += '\n--- ' + new Date().toLocaleTimeString() + ' ---\n' + data.output;
                            logEl.scrollTop = logEl.scrollHeight;
                        }
                    } else {
                        const outputEl = toolEl.querySelector('.tool-output');
                        const statusEl = toolEl.querySelector('.tool-status');
                        if (data.output && outputEl) {
                            const truncated = data.output.length > 8000;
                            const text = truncated ? data.output.substring(0, 8000) : data.output;
                            // For background bash, set up an expandable streaming log
                            if (toolEl.dataset.bgBash === '1') {
                                toolEl.dataset.streamLog = '1';
                                outputEl.innerHTML = `
                                    <div class="bg-bash-toggle">▼ 即時輸出 (點擊切換)</div>
                                    <pre class="bg-bash-log">${this.esc(text)}</pre>
                                `;
                                outputEl.style.display = 'block';
                                const toggle = outputEl.querySelector('.bg-bash-toggle');
                                const log = outputEl.querySelector('.bg-bash-log');
                                toggle.addEventListener('click', () => {
                                    const open = log.style.display !== 'none';
                                    log.style.display = open ? 'none' : 'block';
                                    toggle.textContent = (open ? '▶' : '▼') + ' 即時輸出 (點擊切換)';
                                });
                            } else {
                                outputEl.innerHTML = `<pre>${this.esc(text)}</pre>`;
                                if (truncated) outputEl.innerHTML += '<div class="tool-truncated">... (已截斷)</div>';
                                outputEl.style.display = 'block';
                            }
                        }
                        if (statusEl) {
                            if (toolEl.dataset.bgBash === '1' && !data.is_error) {
                                statusEl.innerHTML = '🔄 背景執行中';
                                statusEl.className = 'tool-status bg-running';
                            } else {
                                statusEl.innerHTML = data.is_error ? '✗ 錯誤' : '✓ 完成';
                                statusEl.className = 'tool-status ' + (data.is_error ? 'error' : 'done');
                            }
                        }

                        // Auto-reload file in editor if it was a file edit and successful
                        if (!data.is_error && toolEl.dataset.filePath && typeof editor !== 'undefined') {
                            editor.reloadFile(toolEl.dataset.filePath);
                        }
                    }

                    view.pendingTools.delete(data.id);
                }
                this.scrollToBottom(view);
                break;
            }

            case 'usage':
                view.totalTokens.input += data.input_tokens || 0;
                view.totalTokens.cache += (data.cache_read || 0) + (data.cache_create || 0);
                view.totalTokens.output += data.output_tokens || 0;
                if (this.activeWorkspaceId === workspaceId) this.refreshStatusBar();
                break;

            case 'done':
                this.markPendingToolsDone(view);
                view.stopTimer();
                view.isProcessing = false;
                view.currentAssistantEl = null;
                this.hideThinking(view);

                // Append per-turn stats footer (also accumulates cost into totalTokens)
                this.addTurnStats(view, data);

                if (this.activeWorkspaceId === workspaceId) {
                    this.refreshStatusBar();
                    this.updateButtonState();
                }

                // If this was a compact request, finish the compact flow
                if (view._compactPending) {
                    this.finishCompact(view, workspaceId);
                } else if (workspaceManager) {
                    workspaceManager.saveChatHTML(workspaceId, view.messagesEl.innerHTML, view.totalTokens);
                }
                break;

            case 'error':
                this.hideThinking(view);
                this.addSystemMessage(view, '錯誤: ' + (data.message || 'Unknown error'));
                view.isProcessing = false;
                view.stopTimer();
                if (this.activeWorkspaceId === workspaceId) this.updateButtonState();
                break;
        }
    }

    // ========== UI helpers (operate on a specific view) ==========

    showThinking(view) {
        if (view.thinkingEl) return;
        view.thinkingEl = document.createElement('div');
        view.thinkingEl.className = 'claude-thinking';
        view.thinkingEl.innerHTML = `
            <div class="thinking-dots"><span></span><span></span><span></span></div>
            <span class="thinking-text">思考中...</span>
        `;
        view.messagesEl.appendChild(view.thinkingEl);
        this.scrollToBottom(view);
    }

    hideThinking(view) {
        if (view.thinkingEl) {
            view.thinkingEl.remove();
            view.thinkingEl = null;
        }
    }

    appendAssistantText(view, text) {
        if (!view.currentAssistantEl) {
            view.currentAssistantEl = document.createElement('div');
            view.currentAssistantEl.className = 'claude-msg claude-msg-assistant';
            view.currentAssistantEl.innerHTML = '<div class="claude-msg-content"></div>';
            view.currentAssistantEl._rawText = '';
            view.messagesEl.appendChild(view.currentAssistantEl);
        }
        view.currentAssistantEl._rawText += text;
        const contentEl = view.currentAssistantEl.querySelector('.claude-msg-content');
        contentEl.innerHTML = this.renderMarkdown(view.currentAssistantEl._rawText);
        this.scrollToBottom(view);
    }

    addToolUseBlock(view, block) {
        view.currentAssistantEl = null;

        // Special handling for BashOutput: instead of a new block, route
        // its result into the parent background bash block (if found).
        if (block.name === 'BashOutput' && block.input?.bash_id) {
            // Just track this id so when tool_result arrives, we can route it
            const bashId = block.input.bash_id;
            const parentEl = view.messagesEl.querySelector(`[data-bash-id="${this.esc(bashId)}"]`);
            if (parentEl) {
                // Mark the pending tool to route output to parent
                if (block.id) view.pendingTools.set(block.id, parentEl);
                this.scrollToBottom(view);
                return;
            }
            // If parent not found, fall through and render normally
        }

        const toolEl = document.createElement('div');
        toolEl.className = 'claude-tool-block';

        const toolName = block.name || 'Tool';
        const isFileEdit = ['Edit', 'Write', 'MultiEdit'].includes(toolName);
        const isBgBash = toolName === 'Bash' && block.input?.run_in_background === true;

        // Track file path on the element for auto-reload after tool_result
        if (isFileEdit && block.input?.file_path) {
            toolEl.dataset.filePath = block.input.file_path;
            toolEl.dataset.toolName = toolName;
        }

        // Mark background bash blocks
        if (isBgBash) {
            toolEl.classList.add('bg-bash-block');
            toolEl.dataset.bgBash = '1';
        }

        // Build input display
        let inputBody = '';

        if (toolName === 'Edit' && block.input?.old_string && block.input?.new_string) {
            inputBody = this.renderEditDiff(block.input.file_path, block.input.old_string, block.input.new_string);
        } else if (toolName === 'MultiEdit' && Array.isArray(block.input?.edits)) {
            const fp = block.input.file_path || '';
            const parts = [`<div class="diff-file file-clickable" data-file-path="${this.esc(fp)}" title="雙擊開啟">${this.esc(fp)}</div>`];
            for (const edit of block.input.edits) {
                parts.push(this.renderDiffOnly(edit.old_string || '', edit.new_string || ''));
            }
            inputBody = `<div class="tool-diff">${parts.join('')}</div>`;
        } else if (toolName === 'Write' && block.input?.content !== undefined) {
            // Render placeholder; will asynchronously fetch old content and replace
            inputBody = `<div class="tool-diff" data-write-placeholder="1">${this.renderWriteDiff(block.input.file_path, '', block.input.content, true)}</div>`;
        } else if ((toolName === 'TodoWrite' || toolName === 'Todo') && Array.isArray(block.input?.todos)) {
            inputBody = this.renderTodos(block.input.todos);
        } else {
            // Default: show input as text
            let inputDisplay = '';
            let clickablePath = null;
            if (block.input) {
                if (block.name === 'Bash' && block.input.command) {
                    inputDisplay = block.input.command;
                } else if (block.input.file_path) {
                    inputDisplay = block.input.file_path;
                    clickablePath = block.input.file_path;
                } else if (block.input.pattern) {
                    inputDisplay = block.input.pattern;
                } else if (block.input.prompt) {
                    inputDisplay = block.input.prompt.substring(0, 300);
                } else {
                    inputDisplay = JSON.stringify(block.input, null, 2).substring(0, 500);
                }
            }
            if (clickablePath) {
                inputBody = `<pre class="file-clickable" data-file-path="${this.esc(clickablePath)}" title="雙擊開啟">${this.esc(inputDisplay)}</pre>`;
            } else {
                inputBody = `<pre>${this.esc(inputDisplay)}</pre>`;
            }
        }

        const desc = block.input?.description ? `<span class="tool-desc">${this.esc(block.input.description)}</span>` : '';

        toolEl.innerHTML = `
            <div class="tool-header">
                <span class="tool-icon">${this.getToolIcon(toolName)}</span>
                <span class="tool-name">${this.esc(toolName)}</span>
                ${desc}
                <span class="tool-status running"><span class="tool-spinner"></span>執行中</span>
            </div>
            <div class="tool-input">${inputBody}</div>
            <div class="tool-output" style="display:none;"></div>
        `;

        view.messagesEl.appendChild(toolEl);
        if (block.id) view.pendingTools.set(block.id, toolEl);
        this.scrollToBottom(view);

        // For Write tool, asynchronously read existing file and update diff
        if (toolName === 'Write' && block.input?.file_path && block.input?.content !== undefined) {
            this.updateWriteDiffAsync(toolEl, block.input.file_path, block.input.content);
        }
    }

    async updateWriteDiffAsync(toolEl, filePath, newContent) {
        let oldContent = '';
        let isNewFile = true;
        try {
            const result = await window.__TAURI__.core.invoke('read_file', { path: filePath });
            if (result.success) {
                oldContent = result.data || '';
                isNewFile = false;
            }
        } catch {}

        const diffContainer = toolEl.querySelector('.tool-input');
        if (!diffContainer) return;
        diffContainer.innerHTML = `<div class="tool-diff">${this.renderWriteDiff(filePath, oldContent, newContent, isNewFile)}</div>`;
    }

    renderEditDiff(filePath, oldStr, newStr) {
        const fileLine = filePath ? `<div class="diff-file file-clickable" data-file-path="${this.esc(filePath)}" title="雙擊開啟">${this.esc(filePath)}</div>` : '';
        return `<div class="tool-diff">${fileLine}${this.renderDiffOnly(oldStr, newStr)}</div>`;
    }

    renderDiffOnly(oldStr, newStr) {
        const oldLines = oldStr.split('\n');
        const newLines = newStr.split('\n');
        const parts = [];
        for (const line of oldLines) {
            parts.push(`<div class="diff-line diff-removed"><span class="diff-marker">-</span>${this.esc(line)}</div>`);
        }
        for (const line of newLines) {
            parts.push(`<div class="diff-line diff-added"><span class="diff-marker">+</span>${this.esc(line)}</div>`);
        }
        return `<div class="diff-block">${parts.join('')}</div>`;
    }

    renderTodos(todos) {
        const items = todos.map(t => {
            const status = t.status || 'pending';
            let icon = '⬜';
            let cls = 'todo-pending';
            if (status === 'completed') { icon = '✅'; cls = 'todo-done'; }
            else if (status === 'in_progress') { icon = '🔄'; cls = 'todo-active'; }
            const text = status === 'in_progress' && t.activeForm ? t.activeForm : (t.content || '');
            return `<div class="todo-item ${cls}"><span class="todo-icon">${icon}</span><span class="todo-text">${this.esc(text)}</span></div>`;
        }).join('');
        return `<div class="todo-list">${items}</div>`;
    }

    renderWriteDiff(filePath, oldContent, newContent, isNewFile) {
        const label = isNewFile ? '(新建)' : '(覆寫)';
        const fileLine = filePath ? `<div class="diff-file file-clickable" data-file-path="${this.esc(filePath)}" title="雙擊開啟">${this.esc(filePath)} <span class="diff-meta">${label}</span></div>` : '';

        const parts = [];
        const MAX_LINES = 200;

        if (oldContent) {
            const oldLines = oldContent.split('\n');
            const truncated = oldLines.length > MAX_LINES;
            const display = truncated ? oldLines.slice(0, MAX_LINES) : oldLines;
            for (const line of display) {
                parts.push(`<div class="diff-line diff-removed"><span class="diff-marker">-</span>${this.esc(line)}</div>`);
            }
            if (truncated) parts.push(`<div class="diff-truncated">... 舊內容還有 ${oldLines.length - MAX_LINES} 行</div>`);
        }

        const newLines = newContent.split('\n');
        const truncated = newLines.length > MAX_LINES;
        const display = truncated ? newLines.slice(0, MAX_LINES) : newLines;
        for (const line of display) {
            parts.push(`<div class="diff-line diff-added"><span class="diff-marker">+</span>${this.esc(line)}</div>`);
        }
        if (truncated) parts.push(`<div class="diff-truncated">... 新內容還有 ${newLines.length - MAX_LINES} 行</div>`);

        return `${fileLine}<div class="diff-block">${parts.join('')}</div>`;
    }

    markPendingToolsDone(view) {
        for (const [id, el] of view.pendingTools) {
            const status = el.querySelector('.tool-status');
            if (status) {
                status.innerHTML = '✓ 完成';
                status.className = 'tool-status done';
            }
        }
        view.pendingTools.clear();
    }

    addUserMessage(view, text) {
        const el = document.createElement('div');
        el.className = 'claude-msg claude-msg-user';
        el.innerHTML = `<div class="claude-msg-content">${this.esc(text)}</div>`;
        view.messagesEl.appendChild(el);
        const welcome = view.messagesEl.querySelector('.claude-welcome');
        if (welcome) welcome.remove();
        this.scrollToBottom(view);
    }

    addSystemMessage(view, text) {
        const el = document.createElement('div');
        el.className = 'claude-msg claude-msg-system';
        el.innerHTML = `<div class="claude-msg-content">${this.esc(text)}</div>`;
        view.messagesEl.appendChild(el);
        this.scrollToBottom(view);
    }

    addTurnStats(view, data) {
        // Track total cost
        if (data.cost) view.totalTokens.cost += data.cost;

        const duration = data.duration_ms ? (data.duration_ms / 1000).toFixed(1) + 's' : '-';
        const newIn = data.input_tokens || 0;
        const cacheTokens = (data.cache_read_tokens || 0) + (data.cache_creation_tokens || 0);
        const outTokens = data.output_tokens || 0;
        const cost = data.cost ? `$${data.cost.toFixed(4)}` : '';
        const turns = data.num_turns && data.num_turns > 1 ? `${data.num_turns} turns` : '';
        const aborted = data.aborted ? '<span class="stats-aborted">已中止</span>' : '';

        const parts = [`<span class="stat-item">⏱ ${duration}</span>`];

        const tokenParts = [];
        if (newIn > 0) tokenParts.push(`↓${this.formatTokens(newIn)}`);
        if (cacheTokens > 0) tokenParts.push(`💾${this.formatTokens(cacheTokens)}`);
        if (outTokens > 0) tokenParts.push(`↑${this.formatTokens(outTokens)}`);
        if (tokenParts.length) parts.push(`<span class="stat-item" title="新輸入↓ / 快取💾 / 輸出↑">${tokenParts.join(' ')}</span>`);

        if (cost) parts.push(`<span class="stat-item">${cost}</span>`);
        if (turns) parts.push(`<span class="stat-item">${turns}</span>`);
        if (aborted) parts.push(aborted);

        const el = document.createElement('div');
        el.className = 'claude-turn-stats';
        el.innerHTML = parts.join('');
        view.messagesEl.appendChild(el);
        this.scrollToBottom(view);
    }

    scrollToBottom(view) {
        view.messagesEl.scrollTop = view.messagesEl.scrollHeight;
    }

    // ========== Actions ==========

    async abort() {
        const workspaceId = this.activeWorkspaceId;
        if (!workspaceId) return;
        try { await window.__TAURI__.core.invoke('claude_abort_workspace', { workspaceId }); } catch (e) {}
    }

    showConfirm({ icon = '❓', title = '確認', body = '', confirmText = '確定', cancelText = '取消' }) {
        return new Promise(resolve => {
            const modal = document.createElement('div');
            modal.className = 'claude-confirm-modal';
            modal.innerHTML = `
                <div class="claude-confirm-content">
                    <div class="claude-confirm-icon">${icon}</div>
                    <div class="claude-confirm-title">${this.esc(title)}</div>
                    <div class="claude-confirm-body">${this.esc(body)}</div>
                    <div class="claude-confirm-actions">
                        <button class="claude-confirm-cancel">${this.esc(cancelText)}</button>
                        <button class="claude-confirm-ok">${this.esc(confirmText)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const cleanup = () => {
                modal.remove();
                document.removeEventListener('keydown', onKey);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') { cleanup(); resolve(false); }
                if (e.key === 'Enter') { cleanup(); resolve(true); }
            };

            modal.querySelector('.claude-confirm-cancel').addEventListener('click', () => { cleanup(); resolve(false); });
            modal.querySelector('.claude-confirm-ok').addEventListener('click', () => { cleanup(); resolve(true); });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) { cleanup(); resolve(false); }
            });
            document.addEventListener('keydown', onKey);

            // Focus the OK button
            setTimeout(() => modal.querySelector('.claude-confirm-ok').focus(), 50);
        });
    }

    async compactContext() {
        const view = this.getActiveView();
        const workspaceId = this.activeWorkspaceId;
        if (!view || !workspaceId || view.isProcessing) return;

        const ok = await this.showConfirm({
            icon: '📦',
            title: '打包重開',
            body: '將請 Sonnet 4.5 壓縮目前對話為摘要，重置 session，並把摘要作為下次訊息的 context。\n\n注意：本次摘要請求會帶完整歷史 (token 消耗較高)，但之後對話會省很多。',
            confirmText: '開始打包',
        });
        if (!ok) return;

        // Mark this turn as a compact request — we'll capture the result on done
        view._compactPending = true;

        const summaryPrompt = `[壓縮對話] 請將我們目前為止的對話完整摘要，包含：
1. 主要任務和目標
2. 已完成的工作和重要決定
3. 目前的進度和狀態
4. 待處理或未解決的問題
5. 重要的技術細節、檔案路徑、變數名稱

請保持簡潔但完整，這份摘要會作為新 session 的起始 context。直接輸出摘要，不要任何前綴說明。`;

        // Always use Sonnet 4.5 for summarization (good quality/cost balance)
        await this.sendQuick(summaryPrompt, 'claude-sonnet-4-5');
    }

    async finishCompact(view, workspaceId) {
        // Find the last assistant message text (the summary)
        const allAssistant = view.messagesEl.querySelectorAll('.claude-msg-assistant');
        const lastAssistant = allAssistant[allAssistant.length - 1];
        if (!lastAssistant) {
            view._compactPending = false;
            return;
        }
        const summaryText = lastAssistant._rawText || lastAssistant.querySelector('.claude-msg-content')?.textContent || '';

        // Reset workspace session (clears sidecar session_id)
        try {
            await window.__TAURI__.core.invoke('claude_reset_workspace', { workspaceId });
        } catch {}

        // Clear workspace's sessionId so next send starts fresh
        const ws = workspaceManager?.workspaces?.find(w => w.id === workspaceId);
        if (ws) {
            ws.claudeSessionId = null;
            workspaceManager.save();
        }

        // Clear display
        view.messagesEl.innerHTML = '';
        view.totalTokens = { input: 0, cache: 0, output: 0, cost: 0 };
        view.currentAssistantEl = null;
        view.pendingTools.clear();

        // Show the summary as a "context primer" message
        const primerEl = document.createElement('div');
        primerEl.className = 'claude-context-primer';
        primerEl.innerHTML = `
            <div class="primer-header">📦 已壓縮前次對話為以下摘要 (新 session 已建立)</div>
            <div class="primer-body">${this.esc(summaryText)}</div>
        `;
        view.messagesEl.appendChild(primerEl);

        // Store summary to prepend to next user message automatically
        view._priorSummary = summaryText;

        view._compactPending = false;
        this.refreshStatusBar();
        this.scrollToBottom(view);

        // Persist
        if (workspaceManager) {
            workspaceManager.saveChatHTML(workspaceId, view.messagesEl.innerHTML, view.totalTokens);
        }
    }

    clearDisplay() {
        const view = this.getActiveView();
        if (!view) return;

        // Find all user messages (each marks the start of a turn)
        const userMessages = view.messagesEl.querySelectorAll('.claude-msg-user');
        if (userMessages.length <= 2) return; // Nothing to trim

        // Keep from the 2nd-to-last user message onwards
        const keepFrom = userMessages[userMessages.length - 2];

        // Remove all previous siblings (everything before this user message)
        while (keepFrom.previousSibling) {
            keepFrom.previousSibling.remove();
        }

        // Persist the trimmed state
        if (workspaceManager) {
            workspaceManager.saveChatHTML(this.activeWorkspaceId, view.messagesEl.innerHTML, view.totalTokens);
        }

        this.scrollToBottom(view);
    }

    async reset() {
        const workspaceId = this.activeWorkspaceId;
        if (!workspaceId) return;
        try { await window.__TAURI__.core.invoke('claude_reset_workspace', { workspaceId }); } catch (e) {}

        const view = this.getActiveView();
        if (view) {
            view.messagesEl.innerHTML = `
                <div class="claude-welcome">
                    <div class="claude-welcome-icon">⚡</div>
                    <div class="claude-welcome-text">Claude Code</div>
                    <div class="claude-welcome-hint">對話已重置</div>
                </div>
            `;
            view.currentAssistantEl = null;
            view.pendingTools.clear();
            view.totalTokens = { input: 0, output: 0 };
            view.stopTimer();
            view.startTime = null;
        }
        this.refreshStatusBar();
    }

    // ========== Markdown ==========

    renderMarkdown(text) {
        if (!text) return '';
        let html = text;
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) => `<pre><code class="language-${lang}">${code.trim()}</code></pre>`);
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
        html = html.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>');
        html = html.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>');
        html = html.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
        html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
        html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        html = html.replace(/_(.+?)_/g, '<em>$1</em>');
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
        html = html.replace(/^[-*_]{3,}$/gm, '<hr>');
        html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');
        html = html.replace(/^[\*\-]\s+(.*)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
        html = html.replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>');
        html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
            const cells = content.split('|').map(c => c.trim());
            if (cells.every(c => /^[-:]+$/.test(c))) return '';
            return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        });
        html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');
        html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>');
        html = html.replace(/<p>\s*<\/p>/g, '');
        html = html.replace(/\n\n+/g, '\n');
        return html;
    }

    getToolIcon(name) {
        const icons = { Bash:'💻', Read:'📖', Write:'✏️', Edit:'🔧', Grep:'🔍', Glob:'📁', Agent:'🤖' };
        return icons[name] || '⚙️';
    }

    esc(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    show() { if (this.container) this.container.style.display = 'flex'; }
    hide() { if (this.container) this.container.style.display = 'none'; }

    destroy() {
        if (this._unlisten) this._unlisten();
        if (this.container) this.container.remove();
    }
}
