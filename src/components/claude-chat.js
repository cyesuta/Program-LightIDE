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
        // Tokens broken down: input=new, cache_read=cheap reads, cache_create=writes, output
        this.totalTokens = { input: 0, cache_read: 0, cache_create: 0, output: 0, cost: 0 };
        this.startTime = null;
        this.timerInterval = null;
    }

    show() {
        this.messagesEl.style.display = 'flex';
        // Scroll to bottom so latest message is visible
        requestAnimationFrame(() => {
            this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
        });
    }
    hide() { this.messagesEl.style.display = 'none'; }
    destroy() {
        this.stopTimer();
        this.messagesEl.remove();
    }

    startTimer(updateCallback) {
        this.startTime = Date.now();
        this.totalTokens = { input: 0, cache_read: 0, cache_create: 0, output: 0, cost: 0 };
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

        // Active background tasks: terminalId -> {cardEl, tabId, command, workspaceId}
        this.bgTasks = new Map();

        this._unlisten = null;
        this._exitUnlisten = null;
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
                <div class="claude-attachments" id="claudeAttachments"></div>
                <div class="claude-input-row">
                    <textarea class="claude-input" id="claudeInput" placeholder="輸入訊息... (Ctrl+V 貼入圖片)" rows="1"></textarea>
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
                    <button class="claude-thinking-toggle" id="claudeThinkingToggle" title="切換思考模式" style="display:none;">🧠 思考</button>
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
                    <button class="claude-action-btn claude-quick-btn claude-sb-btn" id="claudeSbBtn" title="當你錯的離譜時按 (使用 Opus 4.6 檢討並寫入 .claude/sb-errors.log)">😡 你這什麼sb錯誤！</button>
                    <button class="claude-action-btn claude-quick-btn" id="claudeChangelogBtn" title="記錄到 CHANGELOG.md (使用 Haiku 4.5)">📋 記錄 Changelog</button>
                    <button class="claude-action-btn claude-quick-btn claude-icon-btn" id="claudeProjectPanelBtn" title="專案 .claude 設定（hooks / skills / commands / agents）"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg> .claude 設定</button>
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
                // If currently processing, Enter does nothing (to avoid accidental send)
                const view = this.getActiveView();
                if (!view?.isProcessing) this.send();
            }
            // Ctrl+C to abort while processing
            if (e.key === 'c' && e.ctrlKey && !this.inputEl.selectionStart && !this.inputEl.selectionEnd) {
                const view = this.getActiveView();
                if (view?.isProcessing) {
                    e.preventDefault();
                    this.abort();
                }
            }
        });

        this.inputEl.addEventListener('input', () => {
            this.inputEl.style.height = 'auto';
            this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 120) + 'px';
        });

        this.sendBtn.addEventListener('click', () => {
            const view = this.getActiveView();
            if (view?.isProcessing) {
                this.abort();
            } else {
                this.send();
            }
        });
        this.container.querySelector('#claudeResetBtn').addEventListener('click', () => this.reset());
        this.container.querySelector('#claudeClearBtn').addEventListener('click', () => this.clearDisplay());
        this.container.querySelector('#claudeCompactBtn').addEventListener('click', () => this.compactContext());
        this.container.querySelector('#claudeAbortBtn').addEventListener('click', () => this.abort());

        // Model selector — persist to localStorage
        // Pasted images (current draft)
        this.pendingImages = []; // [{data, mediaType}]
        this.attachmentsEl = this.container.querySelector('#claudeAttachments');

        // Paste handler — capture images from clipboard
        this.inputEl.addEventListener('paste', async (e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type && item.type.startsWith('image/')) {
                    e.preventDefault();
                    const blob = item.getAsFile();
                    if (blob) await this.attachImage(blob);
                }
            }
        });

        this.modelSelect = this.container.querySelector('#claudeModelSelect');
        const savedModel = localStorage.getItem('lightide-claude-model');
        if (savedModel) this.modelSelect.value = savedModel;
        this.modelSelect.addEventListener('change', () => {
            localStorage.setItem('lightide-claude-model', this.modelSelect.value);
            this.refreshThinkingButton();
        });

        // Thinking toggle — only shown for thinking-capable models
        this.thinkingBtn = this.container.querySelector('#claudeThinkingToggle');
        this.thinkingEnabled = localStorage.getItem('lightide-claude-thinking') === '1';
        this.refreshThinkingButton();
        this.thinkingBtn.addEventListener('click', () => {
            this.thinkingEnabled = !this.thinkingEnabled;
            localStorage.setItem('lightide-claude-thinking', this.thinkingEnabled ? '1' : '0');
            this.refreshThinkingButton();
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
            this.sendQuick('commit 然後 push', 'claude-haiku-4-5-20251001');
        });
        this.container.querySelector('#claudeChangelogBtn').addEventListener('click', () => {
            this.sendQuick('更新 CHANGELOG', 'claude-haiku-4-5-20251001');
        });
        this.container.querySelector('#claudeSbBtn').addEventListener('click', () => {
            this.sendSbError();
        });
        this.container.querySelector('#claudeProjectPanelBtn').addEventListener('click', () => {
            this.openProjectPanel();
        });

        // Event delegation: double-click any file path to open it in editor
        this.messagesWrapper.addEventListener('dblclick', (e) => {
            const el = e.target.closest('[data-file-path]');
            if (!el) return;
            const path = el.dataset.filePath;
            if (path) this.openFileInEditor(path);
        });

        // Event delegation: click triangle to expand/collapse a tool block
        // (delegated because innerHTML restore on workspace reload drops listeners)
        this.messagesWrapper.addEventListener('click', (e) => {
            const toggle = e.target.closest('.tool-toggle');
            if (!toggle) return;
            e.stopPropagation();
            const block = toggle.closest('.claude-tool-block');
            if (!block) return;
            const collapsed = block.classList.toggle('is-collapsed');
            toggle.textContent = collapsed ? '▶' : '▼';
            toggle.title = collapsed ? '展開' : '收合';
        });
    }

    scheduleTreeRefresh() {
        clearTimeout(this._treeRefreshTimer);
        this._treeRefreshTimer = setTimeout(() => {
            if (typeof fileTree !== 'undefined' && state?.projectPath) {
                fileTree.loadDirectory(state.projectPath);
            }
        }, 300);
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

        // Listen for terminal exit events — used to detect bg task completion
        window.__TAURI__.event.listen('terminal-exit', (event) => {
            const { terminalId } = event.payload;
            this.handleBgTaskExit(terminalId);
        }).then(unlisten => { this._exitUnlisten = unlisten; });

        // Also listen for our sentinel-based bg task done custom event
        // (more reliable than terminal-exit for interactive shells that don't cleanly exit)
        window.addEventListener('bg-task-done', (e) => {
            const { tabId, terminalId } = e.detail;
            this.handleBgTaskExit(terminalId);
        });
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
        const hasData = t.output > 0 || t.input > 0 || t.cache_read > 0 || t.cache_create > 0;
        if (hasData) {
            const parts = [];
            if (t.input > 0) parts.push(`↓${this.formatTokens(t.input)}`);
            if (t.cache_create > 0) parts.push(`📝${this.formatTokens(t.cache_create)}`);
            if (t.cache_read > 0) parts.push(`💾${this.formatTokens(t.cache_read)}`);
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

        // Input stays enabled so user can type next message while waiting
        this.inputEl.disabled = false;

        // During processing, send button becomes abort button
        if (processing) {
            this.sendBtn.disabled = false;
            this.sendBtn.textContent = '⏹';
            this.sendBtn.title = '中止 (Ctrl+C)';
            this.sendBtn.classList.add('is-abort');
        } else {
            this.sendBtn.disabled = false;
            this.sendBtn.textContent = '▶';
            this.sendBtn.title = '送出 (Enter)';
            this.sendBtn.classList.remove('is-abort');
        }

        // Keep the separate abort button in the action row too (fallback)
        this.container.querySelector('#claudeAbortBtn').style.display = processing ? 'inline-flex' : 'none';
    }

    // ========== Send ==========

    async sendQuick(message, forcedModel, displayText) {
        // Send a pre-defined message with a forced model (used by quick action buttons).
        // displayText (optional) lets the chat bubble show a short label instead of the raw prompt.
        const view = this.getActiveView();
        const workspaceId = this.activeWorkspaceId;
        if (!view || !workspaceId || view.isProcessing) return;

        this.addUserMessage(view, displayText || message);
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

    sendSbError() {
        // "你這什麼sb錯誤！" — the user smashes this when the prior turn went badly off the rails.
        // Asks Opus 4.6 to diagnose, fix, then append a lesson to .claude/sb-errors.log so
        // the same class of mistake can be avoided next time.
        const prompt = `[嚴重錯誤檢討 — 使用者按了「你這什麼sb錯誤！」按鈕]

你剛才的回應有嚴重錯誤。請按以下步驟處理：

1. **回顧**：仔細讀我之前的訊息和你的回應，找出你錯在哪裡（誤解需求？跳過驗證？亂改檔案？破壞了現有功能？亂猜檔案路徑/API？）。
2. **歸因**：用一兩句話講出根本原因，不是表面症狀。
3. **修復**：重新正確完成原本的任務，包含修復你剛才造成的破壞（如有）。
4. **寫入教訓**：任務做完後，將以下格式 append 到專案根目錄的 \`.claude/sb-errors.log\`（檔案不存在則建立 .claude 目錄與檔案）：

\`\`\`
================================================================
[YYYY-MM-DD HH:MM]  ← 用今天的實際日期時間
情境：使用者當時要做什麼
我做錯了什麼：一兩句具體描述
根本原因：為什麼會這樣錯（誤解了什麼前提、跳過了什麼確認、預設了什麼不該預設的東西）
教訓：未來在 [類似情境] 下，應該 [具體做法]，避免 [具體陷阱]
================================================================
\`\`\`

寫入規則：
- **append 模式**：寫入前先 Read \`.claude/sb-errors.log\`（若存在），把舊內容完整保留在最前面，新條目接在後面。**禁止覆寫舊 log**。
- 若 .claude 目錄不存在請先建立。
- 「教訓」要具體可行，不要寫「下次更小心」這種廢話。寫完整段後再 Write 整個檔案。

現在開始。`;
        this.sendQuick(prompt, 'claude-opus-4-6', '😡 你這什麼sb錯誤！（請檢討、修復並寫入 sb-errors.log）');
    }

    async send() {
        const userInput = this.inputEl.value.trim();
        const workspaceId = this.activeWorkspaceId;
        if (!workspaceId) return;

        const view = this.getActiveView();
        // Allow sending if there's text OR images
        if ((!userInput && this.pendingImages.length === 0) || view.isProcessing) return;

        // If we have a prior summary from compact, prepend it to the message (one-time)
        let message = userInput || '(圖片訊息)';
        if (view._priorSummary) {
            message = `[從前次對話的摘要繼續]\n${view._priorSummary}\n\n[使用者新訊息]\n${message}`;
            view._priorSummary = null;
        }

        // Capture images for this send and clear pending
        const images = this.pendingImages.slice();
        this.pendingImages = [];
        this.renderAttachments();

        this.addUserMessage(view, userInput || '', images);
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
            await window.__TAURI__.core.invoke('claude_send_message', {
                message, cwd, workspaceId, sessionId, model, promptMode,
                images: images.length ? images : null,
                thinking: this.modelSupportsThinking(model) && this.thinkingEnabled,
            });
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

        // Handle background task spawn requests from sidecar
        if (data.type === 'bg_spawn_request') {
            this.handleBgSpawnRequest(data);
            return;
        }

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

            case 'thinking':
                this.hideThinking(view);
                this.appendThinkingBlock(view, data.text);
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

                        // If a Write/Edit/MultiEdit (or any file-touching tool) succeeded,
                        // refresh the file tree so newly created files appear.
                        if (!data.is_error && toolEl.dataset.toolName && typeof fileTree !== 'undefined' && state?.projectPath) {
                            this.scheduleTreeRefresh();
                        }
                    }

                    view.pendingTools.delete(data.id);
                }
                this.scrollToBottom(view);
                break;
            }

            case 'usage':
                view.totalTokens.input += data.input_tokens || 0;
                view.totalTokens.cache_read += data.cache_read || 0;
                view.totalTokens.cache_create += data.cache_create || 0;
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
                this.addTurnStats(view, data, workspaceId);

                if (this.activeWorkspaceId === workspaceId) {
                    this.refreshStatusBar();
                    this.updateButtonState();
                } else if (!data.aborted && typeof workspaceManager !== 'undefined') {
                    // Turn finished for a workspace the user isn't viewing — flag the tab.
                    // Aborted turns are skipped: the user clicked stop, they already know.
                    workspaceManager.markCompleted?.(workspaceId);
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

    appendThinkingBlock(view, text) {
        // End any current text block so thinking shows as separate
        view.currentAssistantEl = null;

        const el = document.createElement('div');
        el.className = 'claude-thinking-block';
        el.innerHTML = `
            <div class="thinking-block-header">🧠 思考過程 <span class="thinking-block-toggle">▼</span></div>
            <div class="thinking-block-body">${this.esc(text)}</div>
        `;
        const header = el.querySelector('.thinking-block-header');
        const body = el.querySelector('.thinking-block-body');
        const toggle = el.querySelector('.thinking-block-toggle');
        header.addEventListener('click', () => {
            const open = body.style.display !== 'none';
            body.style.display = open ? 'none' : 'block';
            toggle.textContent = open ? '▶' : '▼';
        });
        view.messagesEl.appendChild(el);
        this.scrollToBottom(view);
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
        const isRead = toolName === 'Read';

        // Track file path on the element for auto-reload after tool_result
        if (isFileEdit && block.input?.file_path) {
            toolEl.dataset.filePath = block.input.file_path;
            toolEl.dataset.toolName = toolName;
        }
        // Mark Bash too — it might create/modify files; we'll refresh the tree on success
        if (toolName === 'Bash') {
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

        // For Read: show the file path inline in the header and start collapsed.
        // The input/output bodies stay in the DOM but hidden until the user clicks the triangle.
        let headerExtra = desc;
        let toggleBtn = '';
        if (isRead && block.input?.file_path) {
            const fp = block.input.file_path;
            const meta = [];
            if (block.input.offset) meta.push(`offset ${block.input.offset}`);
            if (block.input.limit) meta.push(`limit ${block.input.limit}`);
            const metaHtml = meta.length ? ` <span class="tool-read-meta">(${meta.join(', ')})</span>` : '';
            headerExtra = `<span class="tool-read-path file-clickable" data-file-path="${this.esc(fp)}" title="${this.esc(fp)} — 雙擊開啟">${this.esc(fp)}</span>${metaHtml}`;
            toolEl.classList.add('is-collapsed');
            toggleBtn = `<button class="tool-toggle" type="button" title="展開">▶</button>`;
            // Don't render the redundant input pre — file path is already in the header
            inputBody = '';
        }

        const inputBlock = inputBody ? `<div class="tool-input">${inputBody}</div>` : '';
        toolEl.innerHTML = `
            <div class="tool-header">
                <span class="tool-icon">${this.getToolIcon(toolName)}</span>
                <span class="tool-name">${this.esc(toolName)}</span>
                ${headerExtra}
                ${toggleBtn}
                <span class="tool-status running"><span class="tool-spinner"></span>執行中</span>
            </div>
            ${inputBlock}
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

    addUserMessage(view, text, images) {
        const el = document.createElement('div');
        el.className = 'claude-msg claude-msg-user';
        const imgsHtml = (images && images.length) ? `<div class="claude-msg-images">${
            images.map(img => `<img src="data:${img.mediaType};base64,${img.data}" alt="">`).join('')
        }</div>` : '';
        const textHtml = text ? `<div class="claude-msg-content">${this.esc(text)}</div>` : '';
        el.innerHTML = imgsHtml + textHtml;
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

    addTurnStats(view, data, workspaceId) {
        // Track total cost
        if (data.cost) view.totalTokens.cost += data.cost;

        const duration = data.duration_ms ? (data.duration_ms / 1000).toFixed(1) + 's' : '-';
        const newIn = data.input_tokens || 0;
        const cacheRead = data.cache_read_tokens || 0;
        const cacheCreate = data.cache_creation_tokens || 0;
        const outTokens = data.output_tokens || 0;
        const cost = data.cost ? `$${data.cost.toFixed(4)}` : '';
        const turns = data.num_turns && data.num_turns > 1 ? `${data.num_turns} turns` : '';
        const aborted = data.aborted ? '<span class="stats-aborted">已中止</span>' : '';

        // Fire-and-forget: push this turn to Supabase llm_usage
        this.logUsageRemote(view, data, workspaceId).catch(e => {
            console.warn('[llm_usage] upload failed:', e);
        });

        const parts = [`<span class="stat-item">⏱ ${duration}</span>`];

        // Build token breakdown: new input ↓, cache create 📝, cache read 💾, output ↑
        const tokenParts = [];
        if (newIn > 0) tokenParts.push(`<span class="tk-new" title="新輸入 (全價)">↓${this.formatTokens(newIn)}</span>`);
        if (cacheCreate > 0) tokenParts.push(`<span class="tk-cwrite" title="寫入快取 (1.25x)">📝${this.formatTokens(cacheCreate)}</span>`);
        if (cacheRead > 0) tokenParts.push(`<span class="tk-cread" title="讀取快取 (0.1x)">💾${this.formatTokens(cacheRead)}</span>`);
        if (outTokens > 0) tokenParts.push(`<span class="tk-out" title="輸出">↑${this.formatTokens(outTokens)}</span>`);
        if (tokenParts.length) parts.push(`<span class="stat-item stat-tokens">${tokenParts.join(' ')}</span>`);

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

    async logUsageRemote(view, data, workspaceId) {
        const ws = workspaceManager?.workspaces?.find(w => w.id === workspaceId);
        // Per-workspace turn counter — every 3 completed turns, ask backend to refresh /usage.
        view.turnCount = (view.turnCount || 0) + 1;
        const shouldProbe = view.turnCount % 3 === 0;

        const payload = {
            session_id: ws?.claudeSessionId || null,
            num_turns: data.num_turns || null,
            is_subagent: false,
            aborted: !!data.aborted,
            project_name: ws?.projectName || ws?.name || null,
            project_path: ws?.projectPath || null,
            model: data.model || this.modelSelect?.value || null,
            input_tokens: data.input_tokens || 0,
            cache_creation_tokens: data.cache_creation_tokens || 0,
            cache_creation_5m_tokens: data.cache_creation_5m_tokens || 0,
            cache_creation_1h_tokens: data.cache_creation_1h_tokens || 0,
            cache_read_tokens: data.cache_read_tokens || 0,
            output_tokens: data.output_tokens || 0,
            cost_usd: data.cost || 0,
            duration_ms: data.duration_ms || 0,
            thinking_enabled: !!this.thinkingEnabled,
            prompt_mode: this.promptModeSelect?.value || null,
            error: (!data.success && !data.aborted) ? 'turn failed' : null,
            should_probe: shouldProbe,
        };
        await window.__TAURI__.core.invoke('log_llm_usage', { payload });
    }

    // ========== Actions ==========

    async abort() {
        const workspaceId = this.activeWorkspaceId;
        if (!workspaceId) return;
        try { await window.__TAURI__.core.invoke('claude_abort_workspace', { workspaceId }); } catch (e) {}
    }

    async handleBgSpawnRequest(data) {
        const { reqId, workspaceId, command, cwd } = data;

        try {
            if (typeof terminal === 'undefined' || !terminal.createBgTaskTab) {
                throw new Error('Terminal component not available');
            }

            // Auto-switch right panel to terminal mode so user can see it
            if (window.app?.switchMode) {
                window.app.switchMode('terminal');
            }

            // Create a new terminal tab, feed the command, return the terminalId + logPath
            const result = await terminal.createBgTaskTab(command, cwd);

            // Add a notification card in the Claude chat view
            const view = this.getOrCreateView(workspaceId);
            const cardEl = this.addBgTaskCard(view, {
                command,
                terminalId: result.terminalId,
                logFile: result.logFile,
                tabId: result.tabId,
            });

            // Track so we can update card when task exits
            if (result.terminalId) {
                this.bgTasks.set(result.terminalId, {
                    cardEl,
                    tabId: result.tabId,
                    command,
                    workspaceId,
                    logFile: result.logFile,
                });
            }

            // Respond to sidecar
            await window.__TAURI__.core.invoke('claude_bg_response', {
                response: {
                    type: 'bg_spawn_response',
                    reqId,
                    success: true,
                    terminalId: result.terminalId || result.tabId,
                    logPath: result.logFile,
                },
            });
        } catch (e) {
            console.error('Failed to spawn bg task:', e);
            await window.__TAURI__.core.invoke('claude_bg_response', {
                response: {
                    type: 'bg_spawn_response',
                    reqId,
                    success: false,
                    error: e.message || String(e),
                },
            });
        }
    }

    addBgTaskCard(view, info) {
        const el = document.createElement('div');
        el.className = 'claude-bg-task-card running';
        el.dataset.tabId = info.tabId;
        el.innerHTML = `
            <div class="bg-task-header">
                <span class="bg-task-icon">⚡</span>
                <span class="bg-task-title">背景任務執行中</span>
                <span class="bg-task-status">🔄 運行中</span>
            </div>
            <div class="bg-task-body">
                <div class="bg-task-cmd">${this.esc(info.command)}</div>
                <div class="bg-task-meta">
                    <span>📝 log: <code>${this.esc(info.logFile || 'N/A')}</code></span>
                </div>
                <div class="bg-task-actions">
                    <button class="bg-task-btn" data-action="view">🔍 切換到終端機</button>
                    <button class="bg-task-btn" data-action="close">🗑 關閉 tab</button>
                </div>
            </div>
        `;
        el.querySelector('[data-action="view"]').addEventListener('click', () => {
            if (window.app?.switchMode) window.app.switchMode('terminal');
            if (typeof terminal !== 'undefined' && terminal.switchTab) {
                terminal.switchTab(info.tabId);
            }
        });
        el.querySelector('[data-action="close"]').addEventListener('click', () => {
            if (typeof terminal !== 'undefined' && terminal.closeTab) {
                terminal.closeTab(info.tabId);
            }
        });
        view.messagesEl.appendChild(el);
        this.scrollToBottom(view);
        return el;
    }

    handleBgTaskExit(terminalId) {
        const task = this.bgTasks.get(terminalId);
        if (!task) return;

        // Update the card to "completed" state
        const card = task.cardEl;
        if (card) {
            card.classList.remove('running');
            card.classList.add('completed');
            const title = card.querySelector('.bg-task-title');
            const status = card.querySelector('.bg-task-status');
            if (title) title.textContent = '背景任務已完成';
            if (status) {
                status.textContent = '✅ 已完成';
                status.className = 'bg-task-status done';
            }
        }

        // Remove from tracking first (prevents re-entry)
        this.bgTasks.delete(terminalId);

        // Auto-switch back to Claude mode so user sees the notification
        if (window.app?.switchMode) {
            window.app.switchMode('claude');
        }

        // Auto-close the terminal tab after a short delay (release RAM).
        // Delay lets the user briefly see the final output if they're looking.
        if (task.tabId && typeof terminal !== 'undefined' && terminal.closeTab) {
            setTimeout(() => {
                terminal.closeTab(task.tabId);
            }, 1500);
        }
    }

    modelSupportsThinking(model) {
        // Haiku doesn't support extended thinking; Sonnet/Opus 4.5+ do
        if (!model) return false;
        if (model.includes('haiku')) return false;
        return /sonnet|opus/.test(model);
    }

    refreshThinkingButton() {
        if (!this.thinkingBtn) return;
        const supports = this.modelSupportsThinking(this.modelSelect?.value);
        this.thinkingBtn.style.display = supports ? 'inline-flex' : 'none';
        if (supports) {
            this.thinkingBtn.classList.toggle('active', this.thinkingEnabled);
            this.thinkingBtn.title = this.thinkingEnabled ? '思考已開啟（點擊關閉）' : '思考已關閉（點擊開啟）';
        }
    }

    async attachImage(blob) {
        const mediaType = blob.type || 'image/png';
        const data = await this.blobToBase64(blob);
        this.pendingImages.push({ data, mediaType, size: blob.size });
        this.renderAttachments();
    }

    blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result;
                const base64 = typeof result === 'string' ? result.split(',')[1] : '';
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    renderAttachments() {
        if (!this.attachmentsEl) return;
        if (this.pendingImages.length === 0) {
            this.attachmentsEl.innerHTML = '';
            this.attachmentsEl.style.display = 'none';
            return;
        }
        this.attachmentsEl.style.display = 'flex';
        this.attachmentsEl.innerHTML = this.pendingImages.map((img, i) => {
            const sizeKb = Math.round(img.size / 1024);
            return `
                <div class="claude-attachment">
                    <img src="data:${img.mediaType};base64,${img.data}" alt="圖片 ${i + 1}">
                    <span class="att-size">${sizeKb}KB</span>
                    <button class="att-remove" data-idx="${i}" title="移除">×</button>
                </div>
            `;
        }).join('');
        this.attachmentsEl.querySelectorAll('.att-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                this.pendingImages.splice(idx, 1);
                this.renderAttachments();
            });
        });
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

    // Generic single-line input modal (returns string or null on cancel)
    showInput({ icon = '✏️', title = '輸入', label = '', placeholder = '', defaultValue = '', confirmText = '確定', cancelText = '取消', validate = null }) {
        return new Promise(resolve => {
            const modal = document.createElement('div');
            modal.className = 'claude-confirm-modal';
            modal.innerHTML = `
                <div class="claude-confirm-content">
                    <div class="claude-confirm-icon">${icon}</div>
                    <div class="claude-confirm-title">${this.esc(title)}</div>
                    ${label ? `<div class="claude-confirm-body" style="margin-bottom:8px;">${this.esc(label)}</div>` : ''}
                    <input type="text" class="claude-input-field" placeholder="${this.esc(placeholder)}" value="${this.esc(defaultValue)}" />
                    <div class="claude-confirm-error" style="display:none; color:var(--error,#e57373); font-size:12px; margin-top:6px;"></div>
                    <div class="claude-confirm-actions" style="margin-top:16px;">
                        <button class="claude-confirm-cancel">${this.esc(cancelText)}</button>
                        <button class="claude-confirm-ok">${this.esc(confirmText)}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            const inputEl = modal.querySelector('.claude-input-field');
            const errorEl = modal.querySelector('.claude-confirm-error');

            const cleanup = () => {
                modal.remove();
                document.removeEventListener('keydown', onKey);
            };
            const submit = () => {
                const val = inputEl.value.trim();
                if (validate) {
                    const err = validate(val);
                    if (err) {
                        errorEl.textContent = err;
                        errorEl.style.display = 'block';
                        return;
                    }
                }
                cleanup();
                resolve(val);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') { cleanup(); resolve(null); }
                if (e.key === 'Enter') { e.preventDefault(); submit(); }
            };
            modal.querySelector('.claude-confirm-cancel').addEventListener('click', () => { cleanup(); resolve(null); });
            modal.querySelector('.claude-confirm-ok').addEventListener('click', submit);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) { cleanup(); resolve(null); }
            });
            document.addEventListener('keydown', onKey);
            setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);
        });
    }

    // ========== Project .claude settings panel ==========

    // Inline SVG icons (Lucide-style, stroke-based, follow currentColor)
    _icon(name, size = 14) {
        const paths = {
            settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
            fileCog: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="12" cy="15" r="2"/>',
            layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
            terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
            bot: '<rect x="3" y="11" width="18" height="10" rx="2" ry="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8.01" y2="16"/><line x1="16" y1="16" x2="16.01" y2="16"/>',
            folderOpen: '<path d="M6 14l1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2"/>',
            plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
            close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
            pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
            alertTriangle: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
            trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
            refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
        };
        return `<svg class="claude-svg-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
    }

    _projectPanelTemplates() {
        return {
            settingsJson: `{
  "//": "Claude Code project settings — loaded when LightIDE chat is in '完整' (full) prompt mode.",
  "//hooks": "Hooks are shell commands triggered on tool/lifecycle events. Remove this template once you wire real hooks.",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "echo 'About to run a Bash tool call'" }
        ]
      }
    ],
    "PostToolUse": [],
    "Stop": [],
    "UserPromptSubmit": []
  }
}
`,
            skillMd: (name) => `---
name: ${name}
description: One-line description that helps Claude decide when to invoke this skill. Be specific about triggers.
---

# ${name}

Describe what this skill does.

## When to use

- Trigger condition 1
- Trigger condition 2

## Steps

1. First step
2. Second step
`,
            commandMd: (name) => `---
description: One-line description shown in the slash menu.
---

You are running the /${name} command. Write your prompt to Claude here.

User arguments are available as $ARGUMENTS.
`,
            agentMd: (name) => `---
name: ${name}
description: When to use this subagent. Be specific so Claude picks the right one.
tools: Read, Grep, Glob
---

You are a specialized assistant for ...

Your task is to ...
`,
        };
    }

    // Parse simple YAML-ish frontmatter from a markdown string. Returns {} on failure.
    _parseFrontmatter(text) {
        if (!text) return {};
        const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
        if (!m) return {};
        const out = {};
        for (const line of m[1].split('\n')) {
            const kv = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
            if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
        }
        return out;
    }

    async _readFileSafe(path) {
        try {
            const r = await window.__TAURI__.core.invoke('read_file', { path });
            if (r && r.success) return r.data;
        } catch {}
        return null;
    }

    async _listDirSafe(path) {
        try {
            const r = await window.__TAURI__.core.invoke('get_file_tree', { path });
            if (r && r.success) return r.data || [];
        } catch {}
        return null; // null = dir not found / unreadable
    }

    async _ensureDir(path) {
        try {
            await window.__TAURI__.core.invoke('create_directory', { path });
            return true;
        } catch { return false; }
    }

    async _writeFile(path, content) {
        try {
            const r = await window.__TAURI__.core.invoke('save_file', { path, content });
            return r && r.success;
        } catch { return false; }
    }

    _joinPath(base, ...parts) {
        const sep = base.includes('\\') ? '\\' : '/';
        return [base, ...parts].join(sep).replace(/[\\/]+/g, sep);
    }

    async openProjectPanel() {
        const cwd = (typeof state !== 'undefined' && state?.projectPath) || null;
        if (!cwd) {
            await this.showConfirm({
                icon: '📁', title: '尚未開啟專案',
                body: '請先開啟一個專案資料夾，再使用此面板。',
                confirmText: '了解', cancelText: '',
            });
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'claude-confirm-modal claude-project-panel';
        modal.innerHTML = `
            <div class="claude-confirm-content claude-project-content">
                <div class="claude-project-header">
                    <div class="claude-project-title">${this._icon('settings', 16)} 專案 .claude 設定</div>
                    <button class="claude-project-close" title="關閉 (Esc)">${this._icon('close', 16)}</button>
                </div>
                <div class="claude-project-path">${this.esc(cwd)}</div>
                <div class="claude-project-tabs">
                    <button class="claude-project-tab active" data-tab="hooks">${this._icon('fileCog')} Hooks</button>
                    <button class="claude-project-tab" data-tab="skills">${this._icon('layers')} Skills</button>
                    <button class="claude-project-tab" data-tab="commands">${this._icon('terminal')} Commands</button>
                    <button class="claude-project-tab" data-tab="agents">${this._icon('bot')} Agents</button>
                    <button class="claude-project-tab" data-tab="errors">${this._icon('alertTriangle')} 錯誤log</button>
                </div>
                <div class="claude-project-body" id="claudeProjectBody"></div>
                <div class="claude-project-footer">
                    僅在「完整」prompt 模式下載入；存檔後需新對話才生效。
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const close = () => {
            modal.remove();
            document.removeEventListener('keydown', onKey);
        };
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        modal.querySelector('.claude-project-close').addEventListener('click', close);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

        const bodyEl = modal.querySelector('#claudeProjectBody');
        const tabs = modal.querySelectorAll('.claude-project-tab');
        const renderers = {
            hooks: () => this._renderHooksTab(bodyEl, cwd),
            skills: () => this._renderSkillsTab(bodyEl, cwd),
            commands: () => this._renderCommandsTab(bodyEl, cwd),
            agents: () => this._renderAgentsTab(bodyEl, cwd),
            errors: () => this._renderErrorsTab(bodyEl, cwd),
        };
        tabs.forEach(t => {
            t.addEventListener('click', () => {
                tabs.forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                renderers[t.dataset.tab]();
            });
        });

        // initial render
        renderers.hooks();
    }

    async _renderHooksTab(bodyEl, cwd) {
        bodyEl.innerHTML = '<div class="claude-project-loading">載入中…</div>';
        const claudeDir = this._joinPath(cwd, '.claude');
        const settingsPath = this._joinPath(claudeDir, 'settings.json');
        const localPath = this._joinPath(claudeDir, 'settings.local.json');
        const settings = await this._readFileSafe(settingsPath);
        const local = await this._readFileSafe(localPath);

        const fileRow = (label, path, content, isLocal) => {
            const exists = content !== null;
            return `
                <div class="claude-project-row" data-path="${this.esc(path)}">
                    <div class="claude-project-row-main">
                        <div class="claude-project-row-name">${this.esc(label)}${isLocal ? ' <span class="claude-project-tag">gitignored</span>' : ''}</div>
                        <div class="claude-project-row-meta">${this.esc(path)}</div>
                    </div>
                    <div class="claude-project-row-actions">
                        ${exists
                            ? `<button class="claude-project-btn open">${this._icon('folderOpen')} 開啟</button>`
                            : `<button class="claude-project-btn create">${this._icon('plus')} 建立 (套模板)</button>`}
                    </div>
                </div>
            `;
        };

        bodyEl.innerHTML = `
            <div class="claude-project-section-title">Hook 設定檔</div>
            ${fileRow('settings.json', settingsPath, settings, false)}
            ${fileRow('settings.local.json', localPath, local, true)}
            <div class="claude-project-hint">
                Hook 是 SDK 在工具呼叫/生命週期事件上跑的 shell 指令。<code>settings.json</code> 提交版本控制，<code>settings.local.json</code> 為個人覆寫。完整 schema 請見 Claude Code 文件。
            </div>
        `;

        bodyEl.querySelectorAll('.claude-project-row').forEach(row => {
            const path = row.dataset.path;
            const openBtn = row.querySelector('.claude-project-btn.open');
            const createBtn = row.querySelector('.claude-project-btn.create');
            if (openBtn) openBtn.addEventListener('click', () => this._openInEditor(path));
            if (createBtn) createBtn.addEventListener('click', async () => {
                await this._ensureDir(this._joinPath(cwd, '.claude'));
                const tpl = this._projectPanelTemplates().settingsJson;
                const ok = await this._writeFile(path, tpl);
                if (ok) {
                    await this._openInEditor(path);
                    this._renderHooksTab(bodyEl, cwd); // refresh
                }
            });
        });
    }

    async _renderSkillsTab(bodyEl, cwd) {
        bodyEl.innerHTML = '<div class="claude-project-loading">掃描 .claude/skills/ …</div>';
        const skillsDir = this._joinPath(cwd, '.claude', 'skills');
        const entries = await this._listDirSafe(skillsDir);

        const items = [];
        if (Array.isArray(entries)) {
            for (const e of entries) {
                if (!e.is_dir && !e.isDir) continue;
                const skillFile = this._joinPath(e.path, 'SKILL.md');
                const content = await this._readFileSafe(skillFile);
                const meta = this._parseFrontmatter(content);
                items.push({
                    name: meta.name || e.name,
                    description: meta.description || '(無 SKILL.md 或缺少 description)',
                    path: skillFile,
                    exists: content !== null,
                });
            }
        }

        bodyEl.innerHTML = `
            <div class="claude-project-section-title">
                Skills (${items.length})
                <button class="claude-project-add-btn" id="claudeAddSkill">${this._icon('plus', 12)} 新增 skill</button>
            </div>
            ${items.length === 0
                ? `<div class="claude-project-empty">尚無 skill。點上方「+ 新增 skill」建立第一個。</div>`
                : items.map(s => `
                    <div class="claude-project-row" data-path="${this.esc(s.path)}">
                        <div class="claude-project-row-main">
                            <div class="claude-project-row-name">${this.esc(s.name)}${s.exists ? '' : ' <span class="claude-project-tag warn">缺 SKILL.md</span>'}</div>
                            <div class="claude-project-row-desc">${this.esc(s.description)}</div>
                        </div>
                        <div class="claude-project-row-actions">
                            <button class="claude-project-btn open">${this._icon('folderOpen')} 開啟</button>
                        </div>
                    </div>
                `).join('')
            }
            <div class="claude-project-hint">
                每個 skill 是 <code>.claude/skills/&lt;name&gt;/SKILL.md</code>，frontmatter 的 <code>description</code> 決定 Claude 何時呼叫它。
            </div>
        `;

        bodyEl.querySelectorAll('.claude-project-row .open').forEach(btn => {
            btn.addEventListener('click', () => this._openInEditor(btn.closest('.claude-project-row').dataset.path));
        });
        bodyEl.querySelector('#claudeAddSkill').addEventListener('click', async () => {
            const name = await this._askName('skill');
            if (!name) return;
            const dir = this._joinPath(skillsDir, name);
            await this._ensureDir(dir);
            const file = this._joinPath(dir, 'SKILL.md');
            const ok = await this._writeFile(file, this._projectPanelTemplates().skillMd(name));
            if (ok) {
                await this._openInEditor(file);
                this._renderSkillsTab(bodyEl, cwd);
            }
        });
    }

    async _renderCommandsTab(bodyEl, cwd) {
        bodyEl.innerHTML = '<div class="claude-project-loading">掃描 .claude/commands/ …</div>';
        const dir = this._joinPath(cwd, '.claude', 'commands');
        const entries = await this._listDirSafe(dir);

        const items = [];
        if (Array.isArray(entries)) {
            for (const e of entries) {
                if (e.is_dir || e.isDir) continue;
                if (!e.name.endsWith('.md')) continue;
                const content = await this._readFileSafe(e.path);
                const meta = this._parseFrontmatter(content);
                items.push({
                    name: e.name.replace(/\.md$/, ''),
                    description: meta.description || '(無 description)',
                    path: e.path,
                });
            }
        }

        bodyEl.innerHTML = `
            <div class="claude-project-section-title">
                Slash Commands (${items.length})
                <button class="claude-project-add-btn" id="claudeAddCommand">${this._icon('plus', 12)} 新增 command</button>
            </div>
            ${items.length === 0
                ? `<div class="claude-project-empty">尚無 slash command。檔名 = 指令名稱（例如 <code>review.md</code> → <code>/review</code>）。</div>`
                : items.map(c => `
                    <div class="claude-project-row" data-path="${this.esc(c.path)}">
                        <div class="claude-project-row-main">
                            <div class="claude-project-row-name">/${this.esc(c.name)}</div>
                            <div class="claude-project-row-desc">${this.esc(c.description)}</div>
                        </div>
                        <div class="claude-project-row-actions">
                            <button class="claude-project-btn open">${this._icon('folderOpen')} 開啟</button>
                        </div>
                    </div>
                `).join('')
            }
            <div class="claude-project-hint">
                <code>.claude/commands/&lt;name&gt;.md</code> 對應 <code>/&lt;name&gt;</code>。檔案內容會被當成送給 Claude 的 prompt，可用 <code>$ARGUMENTS</code> 帶入使用者輸入。
            </div>
        `;

        bodyEl.querySelectorAll('.claude-project-row .open').forEach(btn => {
            btn.addEventListener('click', () => this._openInEditor(btn.closest('.claude-project-row').dataset.path));
        });
        bodyEl.querySelector('#claudeAddCommand').addEventListener('click', async () => {
            const name = await this._askName('command');
            if (!name) return;
            await this._ensureDir(dir);
            const file = this._joinPath(dir, `${name}.md`);
            const ok = await this._writeFile(file, this._projectPanelTemplates().commandMd(name));
            if (ok) {
                await this._openInEditor(file);
                this._renderCommandsTab(bodyEl, cwd);
            }
        });
    }

    async _renderAgentsTab(bodyEl, cwd) {
        bodyEl.innerHTML = '<div class="claude-project-loading">掃描 .claude/agents/ …</div>';
        const dir = this._joinPath(cwd, '.claude', 'agents');
        const entries = await this._listDirSafe(dir);

        const items = [];
        if (Array.isArray(entries)) {
            for (const e of entries) {
                if (e.is_dir || e.isDir) continue;
                if (!e.name.endsWith('.md')) continue;
                const content = await this._readFileSafe(e.path);
                const meta = this._parseFrontmatter(content);
                items.push({
                    name: meta.name || e.name.replace(/\.md$/, ''),
                    description: meta.description || '(無 description)',
                    tools: meta.tools || '',
                    path: e.path,
                });
            }
        }

        bodyEl.innerHTML = `
            <div class="claude-project-section-title">
                Subagents (${items.length})
                <button class="claude-project-add-btn" id="claudeAddAgent">${this._icon('plus', 12)} 新增 agent</button>
            </div>
            ${items.length === 0
                ? `<div class="claude-project-empty">尚無 subagent。建議 frontmatter 含 <code>name</code> / <code>description</code> / <code>tools</code>。</div>`
                : items.map(a => `
                    <div class="claude-project-row" data-path="${this.esc(a.path)}">
                        <div class="claude-project-row-main">
                            <div class="claude-project-row-name">${this.esc(a.name)}${a.tools ? ` <span class="claude-project-tag">${this.esc(a.tools)}</span>` : ''}</div>
                            <div class="claude-project-row-desc">${this.esc(a.description)}</div>
                        </div>
                        <div class="claude-project-row-actions">
                            <button class="claude-project-btn open">${this._icon('folderOpen')} 開啟</button>
                        </div>
                    </div>
                `).join('')
            }
            <div class="claude-project-hint">
                <code>.claude/agents/&lt;name&gt;.md</code>。Claude 會根據 <code>description</code> 自動挑選合適的 subagent 來分派子任務。
            </div>
        `;

        bodyEl.querySelectorAll('.claude-project-row .open').forEach(btn => {
            btn.addEventListener('click', () => this._openInEditor(btn.closest('.claude-project-row').dataset.path));
        });
        bodyEl.querySelector('#claudeAddAgent').addEventListener('click', async () => {
            const name = await this._askName('agent');
            if (!name) return;
            await this._ensureDir(dir);
            const file = this._joinPath(dir, `${name}.md`);
            const ok = await this._writeFile(file, this._projectPanelTemplates().agentMd(name));
            if (ok) {
                await this._openInEditor(file);
                this._renderAgentsTab(bodyEl, cwd);
            }
        });
    }

    async _renderErrorsTab(bodyEl, cwd) {
        bodyEl.innerHTML = '<div class="claude-project-loading">讀取 .claude/sb-errors.log …</div>';
        const logPath = this._joinPath(cwd, '.claude', 'sb-errors.log');
        const content = await this._readFileSafe(logPath);

        // Split entries on the ===== separator the SB-error prompt uses, keep order newest→oldest
        const entries = [];
        if (content) {
            const blocks = content.split(/={10,}\s*\n/).map(s => s.trim()).filter(Boolean);
            // Each entry is bracketed by ===, so we expect blocks to alternate. Just take non-empty trimmed blocks.
            entries.push(...blocks);
            entries.reverse(); // newest first
        }

        bodyEl.innerHTML = `
            <div class="claude-project-section-title">
                <span>錯誤紀錄 (${entries.length})</span>
                <div style="display:flex; gap:6px; margin-left:auto;">
                    <button class="claude-project-add-btn" id="claudeRefreshErrors">${this._icon('refresh', 12)} 重新整理</button>
                    ${content ? `<button class="claude-project-add-btn" id="claudeOpenErrors">${this._icon('folderOpen', 12)} 在編輯器開啟</button>` : ''}
                    ${content ? `<button class="claude-project-add-btn claude-project-danger" id="claudeClearErrors">${this._icon('trash', 12)} 清空</button>` : ''}
                </div>
            </div>
            ${!content
                ? `<div class="claude-project-empty">尚無錯誤紀錄。當你按下聊天區的「😡 你這什麼sb錯誤！」按鈕，Claude 修復完會把教訓 append 到 <code>.claude/sb-errors.log</code>。</div>`
                : entries.length === 0
                    ? `<div class="claude-project-empty">log 檔存在但內容為空或無法解析。<button class="claude-project-add-btn" id="claudeOpenErrors2">${this._icon('folderOpen', 12)} 直接開啟</button></div>`
                    : `<div class="claude-error-log-list">${entries.map(e => `
                        <div class="claude-error-entry"><pre>${this.esc(e)}</pre></div>
                    `).join('')}</div>`
            }
            <div class="claude-project-hint">
                條目從新到舊。檔案路徑：<code>${this.esc(logPath)}</code>
            </div>
        `;

        const refreshBtn = bodyEl.querySelector('#claudeRefreshErrors');
        const openBtn = bodyEl.querySelector('#claudeOpenErrors') || bodyEl.querySelector('#claudeOpenErrors2');
        const clearBtn = bodyEl.querySelector('#claudeClearErrors');

        if (refreshBtn) refreshBtn.addEventListener('click', () => this._renderErrorsTab(bodyEl, cwd));
        if (openBtn) openBtn.addEventListener('click', () => this._openInEditor(logPath));
        if (clearBtn) clearBtn.addEventListener('click', async () => {
            const ok = await this.showConfirm({
                icon: '🗑',
                title: '清空錯誤紀錄',
                body: '確定要清空 .claude/sb-errors.log 嗎？所有教訓條目會被刪除（無法復原）。',
                confirmText: '清空',
                cancelText: '取消',
            });
            if (!ok) return;
            await this._writeFile(logPath, '');
            this._renderErrorsTab(bodyEl, cwd);
        });
    }

    async _askName(kind) {
        return await this.showInput({
            icon: this._icon('pencil', 32),
            title: `新增 ${kind}`,
            label: '名稱（英數、破折號、底線）：',
            placeholder: `my-${kind}`,
            confirmText: '建立',
            validate: (v) => {
                if (!v) return '請輸入名稱';
                if (!/^[A-Za-z0-9_-]+$/.test(v)) return '只能使用英數、破折號、底線';
                return null;
            },
        });
    }

    async _openInEditor(path) {
        if (typeof fileTree !== 'undefined') {
            try { await fileTree.openFile(path); } catch (e) { console.error(e); }
        }
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
        view.totalTokens = { input: 0, cache_read: 0, cache_create: 0, output: 0, cost: 0 };
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
            view.totalTokens = { input: 0, cache_read: 0, cache_create: 0, output: 0, cost: 0 };
            view.stopTimer();
            view.startTime = null;
        }
        this.refreshStatusBar();
    }

    // ========== Markdown ==========

    renderMarkdown(text) {
        if (!text) return '';
        let html = text;

        // Escape HTML
        html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Code blocks (protect from further processing)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (m, lang, code) =>
            `<pre><code class="language-${lang}">${code.trim()}</code></pre>`);

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Headers
        html = html.replace(/^######\s+(.*)$/gm, '<h6>$1</h6>');
        html = html.replace(/^#####\s+(.*)$/gm, '<h5>$1</h5>');
        html = html.replace(/^####\s+(.*)$/gm, '<h4>$1</h4>');
        html = html.replace(/^###\s+(.*)$/gm, '<h3>$1</h3>');
        html = html.replace(/^##\s+(.*)$/gm, '<h2>$1</h2>');
        html = html.replace(/^#\s+(.*)$/gm, '<h1>$1</h1>');

        // Bold / italic
        html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/___(.+?)___/g, '<strong><em>$1</em></strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        // Only match single * / _ that aren't adjacent to other * / _
        html = html.replace(/(^|[^*])\*([^*\n]+?)\*([^*]|$)/g, '$1<em>$2</em>$3');
        html = html.replace(/(^|[^_])_([^_\n]+?)_([^_]|$)/g, '$1<em>$2</em>$3');
        html = html.replace(/~~(.+?)~~/g, '<del>$1</del>');

        // Links
        html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

        // HR
        html = html.replace(/^[-*_]{3,}$/gm, '<hr>');

        // Blockquote
        html = html.replace(/^&gt;\s+(.*)$/gm, '<blockquote>$1</blockquote>');
        html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');

        // ---- Lists (improved) ----
        // Mark unordered and ordered list items distinctly, then wrap consecutive
        // items (tolerating blank lines between them) in proper <ul>/<ol>.
        html = html.replace(/^[\*\-]\s+(.*)$/gm, '<liu>$1</liu>');
        html = html.replace(/^\d+\.\s+(.*)$/gm, '<lio>$1</lio>');

        // Wrap consecutive unordered items (allow blank lines between)
        html = html.replace(/(<liu>[^\n]*<\/liu>(?:\s*\n\s*<liu>[^\n]*<\/liu>)*)/g, (match) => {
            const items = match.replace(/<liu>/g, '<li>').replace(/<\/liu>/g, '</li>').replace(/\s+/g, ' ');
            return `<ul>${items}</ul>`;
        });
        // Wrap consecutive ordered items
        html = html.replace(/(<lio>[^\n]*<\/lio>(?:\s*\n\s*<lio>[^\n]*<\/lio>)*)/g, (match) => {
            const items = match.replace(/<lio>/g, '<li>').replace(/<\/lio>/g, '</li>').replace(/\s+/g, ' ');
            return `<ol>${items}</ol>`;
        });
        // Safety: any leftover <liu>/<lio> becomes a plain <li> wrapped in <ul>
        html = html.replace(/<liu>/g, '<li>').replace(/<\/liu>/g, '</li>');
        html = html.replace(/<lio>/g, '<li>').replace(/<\/lio>/g, '</li>');

        // Tables
        html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
            const cells = content.split('|').map(c => c.trim());
            if (cells.every(c => /^[-:]+$/.test(c))) return '';
            return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        });
        html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');

        // Paragraphs — wrap lines that don't start with a tag
        html = html.replace(/^(?!<[a-z/]|$)(.+)$/gm, '<p>$1</p>');
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
        if (this._exitUnlisten) this._exitUnlisten();
        if (this.container) this.container.remove();
    }
}
