# Changelog

所有重要的變更都會記錄在此文件中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

---

## [0.2.1] - 2026-05-01

### 🐛 修復：背景 Bash 派發三連 bug

#### 症狀
- 命令送進終端機後 tab 「閃一下」就顯示完成，實際命令完全沒跑（或跑沒幾秒就被殺）
- Claude 對長命令時而選 `run_in_background=true` 時而選 `false`，行為不一致
- 完成後右側面板自動切回 claude 頁，使用者看不到輸出

#### 根因
**核心 bug：sentinel 字串撞自己的 input echo。**
`createBgTaskTab` 把 `${command}; echo "__LIGHTIDE_BG_DONE_xxx__"` 整段 input 進 `bash -i`。互動 shell 預設會把收到的 input **即時 echo 回 PTY**（TTY line editing 行為）。所以 stream 在第一個 chunk 就已經含有 sentinel 字面值——不是命令跑完，是 shell 在回顯使用者打進去的字。

`terminal.js` 的 `_bgSentinelBuf.includes(sentinel)` 立刻成立 → 觸發 `bg-task-done` → `handleBgTaskExit`：
1. card 標完成
2. 自動切回 claude 頁（你看到的「閃一下」）
3. **1.5 秒後自動 closeTab → Rust 端 Drop → PTY 殺 child process**

於是還在啟動的 dev server 直接被砍。「實際沒完成」就是這樣來的。

#### 修法
1. **`terminal.js` createBgTaskTab**：sentinel 改包進 shell 變數送出：
   ```bash
   _LDID='__LIGHTIDE_BG_DONE_xxx__'; ${command}; echo "$_LDID"
   ```
   bash 回顯的 input 字面只含 `$_LDID`，sentinel 值僅在命令真的跑完、`echo` 展開時才出現在 stream 裡。一勞永逸消除假觸發。

2. **`claude-chat.js` handleBgTaskExit**：移除「自動切回 claude」與「1.5 秒自動關 tab」。即使未來再有別的偽完成 trigger，也不會再悄悄殺掉 user 的 process。tab 由 user 自己決定何時關（chat view 的 bg-task card 內已有「🗑 關閉 tab」按鈕）。

3. **`claude-sidecar.mjs` minimal 模式 system prompt**：補一段告訴 Claude bg 派發機制存在，並明示「dev server / watch / 完整 build / 完整 test 一律 `run_in_background=true`」，讓對長命令的選擇穩定下來。

---

## [0.2.0] - 2026-05-01

### ✨ 新增功能

#### 跨平台支援
- **macOS / Linux** — 原本只跑 Windows，現在三大桌面平台皆可從原始碼編譯
  - 新增 Shell 類型：`Zsh`、`Bash`、`Sh`（Unix 變體優先抓 `$SHELL` 而非寫死路徑）
  - 啟動 shell 帶 `-l -i` flag 以載入 `.zshrc` / `.bash_profile`
  - 前端 OS 偵測，下拉選單與預設 shell 依平台動態切換
  - README 補完三平台前置設定（含 macOS Gatekeeper 繞過提示）

#### Claude Chat 體驗
- **Read 工具預設折疊** — 檔案路徑直接顯示在 header，內容預設收合，右側三角按鈕展開／收合（其他工具如 Write/Bash/Edit 維持展開）
- **「😡 你這什麼sb錯誤！」按鈕** — 紅色警示按鈕，強制 Opus 4.6 檢討錯誤、修復後將教訓 append 到 `.claude/sb-errors.log`
- **錯誤 log 分頁** — `.claude 設定`面板新增第 5 個 tab，瀏覽歷次 sb-errors（新到舊排序、可直接編輯、可清空）

#### 工作區
- **完成中通知** — 在其他 tab 工作時，背景 workspace 的 Claude turn 完成後 tab 變橘紅色脈動，切回去自動恢復
- **工作區 tab 拖拽排序修復** — 修復 Tauri 2 預設 `dragDropEnabled: true` 攔截 WebView 拖拽事件導致 HTML5 DnD 失效的問題

### 🔧 內部改動

- `ShellType::executable()` 從 `&'static str` 改回 `String`（為支援 Unix 動態路徑）
- 新增 `ShellType::default_for_platform()` helper，用 `#[cfg]` 在編譯期挑選預設 shell
- `tauri.conf.json` 加 `"dragDropEnabled": false`（副作用：OS 拖檔進視窗失效，但 codebase 本來就沒用）

---

## [0.1.0] - 2026-01-17

### 🎉 初始版本

這是 LightIDE 的第一個公開版本，實現了基礎的 IDE 框架。

### ✨ 新增功能

#### 終端機
- 支援 **PowerShell**、**CMD**、**Git Bash** 三種 Shell
- 使用 `portable-pty` (ConPTY) 實現真正的偽終端
- 使用 `xterm.js` 專業終端機渲染
- 支援 ANSI 轉義序列、顏色顯示
- 支援互動式應用程式（如 Claude CLI）

#### 檔案系統
- 目錄樹瀏覽
- 點擊檔案開啟預覽
- 支援常見文字檔案格式

#### 編輯器
- 基礎程式碼顯示
- 行號顯示
- 深色主題

#### UI
- 三欄式佈局（檔案樹 | 編輯器 | 終端機）
- 可調整面板大小
- 狀態列顯示

### 🔧 技術細節

- **後端**: Rust + Tauri 2.x
- **前端**: HTML + CSS + JavaScript
- **終端機**: portable-pty + xterm.js
- **編譯目標**: Windows 10/11

### 📦 依賴

| 依賴 | 版本 | 用途 |
|------|------|------|
| tauri | 2.x | 應用框架 |
| portable-pty | 0.8 | PTY 終端機 |
| xterm.js | 5.3.0 | 終端機渲染 |
| tokio | 1.x | 非同步執行 |

---

## [開發中] - 未來計劃

### 計劃功能
- [ ] 語法高亮
- [ ] 程式碼編輯功能
- [ ] 分頁支援
- [ ] 搜尋與替換
- [ ] 設定檔
- [ ] 主題切換

---

## 開發日誌

### 2026-04-28
- ✅ **修復中止鈕無效**：`claude-sidecar.mjs` 把 `abortController` 從 `query()`
  頂層搬進 `options`。SDK 的 `query({prompt, options})` 只解構這兩個 key，
  頂層 `abortController` 會被丟掉，內部 fallback `l1()` 自建一個——使用者
  造的 controller 完全沒接到 SDK，按中止後 LLM 仍會持續送 text/tool_use
- ✅ **對話儲存改用 IndexedDB**：`workspace.js` 從 `localStorage` 一坨 JSON
  改成 per-workspace key 的 IndexedDB。chat HTML 用 `CompressionStream('gzip')`
  壓成 `Uint8Array` 直接存 IDB（省 base64 33% 膨脹）。寫入前掃 `.diff-block`
  超過 200 行就截斷加提示。一次性遷移從 localStorage 搬資料後 `removeItem`
- ✅ **maxTurns 50 → 100** (`claude-sidecar.mjs`)
- ✅ **左側檔案樹建立資料夾 + 雙擊命名**：面板加 📁＋ / 📄＋ 按鈕；右鍵
  完整 context menu (建立/重新命名/刪除/複製路徑)；中鍵改為複製路徑
  (原本是命名)；inline `<input>` 取代 prompt 對話框；修掉 rename 路徑
  分隔符的 `'\\\\'` bug
- ✅ **Claude 寫檔後刷新檔案樹**：Write/Edit/MultiEdit/Bash 成功後
  debounce 300ms 觸發 `fileTree.loadDirectory(state.projectPath)`
- ✅ **工作區 tab 關閉確認 + 拖曳排序**：`closeWorkspace` 改 async + 自訂
  confirm modal；`renderTabs` 加 HTML5 drag/drop，左右半區域決定插入位置

### 2026-04-14 (背景 Bash 重導)
- ✅ **canUseTool 攔截背景 Bash**：透過 SDK 的 `canUseTool` callback 攔截
  `Bash(run_in_background: true)`，雙向 IPC (sidecar ⇄ frontend) 把指令
  重導到 LightIDE 的 xterm.js 終端機 tab 執行。User 看到真正的即時串流
  (不再靠 Claude 主動 poll)
- ✅ **`allow + echo` 避免 Claude 重試**：攔截後用 `behavior: 'allow'` +
  `updatedInput` 把指令換成廉價 `echo` 通知訊息，Claude 拿到「成功」的
  tool_result 就不會再重跑一次
- ✅ **`permissionMode: 'default'`**：從 `bypassPermissions` 改為 `default`
  才能讓 `canUseTool` 被呼叫 (bypass 會跳過整個權限流程)
- ✅ **Terminal 支援 log file**：`terminal.rs` 新增 `log_file` 參數，
  PTY 輸出同步寫入指定檔案。背景任務用此機制讓 Claude 能 Read log
- ✅ **新增 `claude_bg_response` Tauri command**：frontend spawn 成功後
  把 response 寫回 sidecar stdin，完成雙向 IPC
- ✅ **背景任務卡片**：Claude chat 顯示卡片含指令、log 路徑、切換到終端
  按鈕、關閉 tab 按鈕
- ✅ **自動切換模式**：背景 bash 啟動時自動切換到終端機模式，完成時自動
  切回 Claude 模式 (監聽 `terminal-exit` 事件)

### 2026-04-14 (後續)
- ✅ **Claude chat 圖片貼上**：輸入框支援 Ctrl+V 貼上圖片，縮圖預覽可移除，
  Sidecar 偵測圖片時自動切換 streaming input 模式，用 Anthropic content blocks
  格式 (text + image base64) 傳送。訊息泡泡顯示圖片縮圖
- ✅ **思考模型支援**：模型選擇器旁加「🧠 思考」按鈕，僅在支援的模型顯示
  (Sonnet/Opus 4.5/4.6)。4.6 用 adaptive 思考，4.5 用 enabled + 8000 budget。
  Sidecar 轉發 thinking 內容區塊，前端以紫色左邊框折疊區顯示
- ✅ **IDE 預設開啟 Claude 模式** (而非終端機)
- ✅ **檔案樹 SVG 圖示**：每種檔案類型獨立 SVG 圖示，帶語言顏色
  (Rust 橘/JS 黃/TS 藍/Python 藍底黃字/Go 青/HTML 紅/CSS 藍/JSON 黃/Markdown 藍/圖片紫)
- ✅ **TodoWrite 工具清單渲染**：✅完成/🔄進行中/⬜待辦，取代原 JSON 顯示
- ✅ **快速動作按鈕** (強制 Haiku 4.5)：📤 Commit+Push、📋 記錄 Changelog
- ✅ **打包重開** (📦) 按鈕：請 Sonnet 4.5 壓縮對話為摘要，重置 session，
  摘要自動 prepend 到下次訊息。避免無限累積歷史
- ✅ **清空顯示** (🧹) 按鈕：保留最後 2 輪對話，session 不變
- ✅ **自訂 confirm modal**：取代原生 confirm 對話框，帶動畫和鍵盤支援
- ✅ **背景 Bash 初版**：`run_in_background: true` 的 Bash 特殊顯示，
  但依賴 Claude 主動 BashOutput，UX 有限制
- ✅ **Workspace tabs 放大**：更容易點擊 (28px → 42px 高度)
- ✅ 修復 tab bar 被 main-container 遮蔽的 flex 佈局問題

### 2026-04-14
- ✅ **Token 用量大幅優化 (省 token 模式)**
  - **問題**: 預設 Claude Code preset system prompt ~21k tokens，每輪都要重送
  - **解法**: 加入「省 token / 完整」模式切換器
    - 省 token 模式：自訂 minimal system prompt (~500 tokens)
    - 完整模式：用 `claude_code` preset，含 CLAUDE.md memory、hooks、slash commands
  - **明確 SDK isolation**: `settingSources: []` 不載入任何 settings.json/plugins
  - **預設停用 extended thinking**: `thinking: { type: "disabled" }` 省 output tokens
  - **預設模型改為 Sonnet 4.5**: 比 Opus 便宜 5 倍
- ✅ **模型選擇器**
  - 下拉選單支援 Sonnet 4.5/4.6、Haiku 4.5、Opus 4.5/4.6
  - 選擇持久化到 localStorage
- ✅ **Token 顯示拆分**
  - 區分新輸入 (↓)、快取 (💾)、輸出 (↑)、費用 ($)
  - 修正之前把 cache_read 算入「輸入」造成的數字虛高
- ✅ **每輪統計列**
  - 每次回覆完成後在訊息下方顯示：耗時、token 細分、費用、turn 數
- ✅ **清空顯示按鈕** (🧹)
  - 只保留最後 2 輪對話，session 不變（不重置）
  - 避免長對話 scrollbar 過長
- ✅ **背景 Bash 特殊顯示**
  - `run_in_background: true` 的 Bash 工具用藍色框 + 「🔄 背景執行中」狀態
  - 即時輸出區域可點擊摺疊/展開
  - BashOutput 工具呼叫的結果自動 append 到對應的 bash 區塊（依 bash_id 路由）

### 2026-04-12
- ✅ **多工作區支援 (Workspace Tabs)**
  - 左下方新增工作區 tab bar，支援多個獨立工作區
  - 每個 workspace 有獨立的：專案路徑、檔案樹、開啟檔案、編輯器狀態、Claude 對話、Claude session
  - `+` 按鈕新增工作區，每個 tab 可獨立關閉
  - 切換 workspace 時自動保存/恢復完整狀態
- ✅ **Claude Code 整合 (Agent SDK)**
  - 右側面板新增模式切換器 (終端機 / Claude)
  - 使用 `@anthropic-ai/claude-agent-sdk` 透過 Node.js sidecar
  - 長駐 sidecar 進程避免每次訊息重新載入 context
  - 使用已登入的 Claude 帳號（無需 API key）
  - Rust 端管理 sidecar 生命週期，stdin/stdout JSON lines 通訊
  - **Per-workspace session 隔離**：每個 workspace 有獨立的 sidecar session_id
  - **Session 持久化**：使用 `resume` 參數接續對話，SDK 自動保存至 `~/.claude/projects/`
  - **並發查詢**：多個 workspace 可同時運行各自的 Claude 查詢，互不干擾
  - **事件路由**：sidecar 事件帶 `workspaceId`，前端自動路由到對應 view
- ✅ **Claude 聊天介面**
  - 即時串流顯示 assistant 文字、工具呼叫、工具結果
  - 工具執行框顯示即時狀態（執行中 spinner → 完成/錯誤）
  - Bash、Read、Write、Edit、Grep、Glob 等工具有獨立圖示
  - 工具輸出完整顯示在可滾動框內（max 8KB，超過截斷）
  - 頂部狀態列顯示即時計時器與 token 計數（輸入/輸出）
  - Markdown 渲染：標題、粗體、表格、程式碼塊、清單、引用、連結
  - 所有訊息內容可選取複製
  - 新對話 / 中止 按鈕
  - `permissionMode: bypassPermissions` 自動執行工具不詢問
- ✅ **檔案樹效能優化**
  - innerHTML 字串拼接取代逐個 createElement，大幅減少 DOM 操作
  - 事件委派：3 個監聽器掛在容器上，取代每個項目各 3 個
  - 選取檔案時僅更新 CSS class，不再重繪整棵樹
  - 修復空目錄展開時無限循環卡死的 bug
- ✅ **Panel 佈局修正**
  - 修復 flex 佈局 `min-height: 0` 缺失導致子元素無法正確滾動
  - Claude 聊天框內多個工具區塊時整體有滾動條
  - 右側面板可拉至最寬 1400px（原為 500px）
  - Claude 聊天字體放大 1.5x
- ✅ **持久化 (LocalStorage)**
  - Workspace tabs 列表持久化（projectPath、claudeSessionId）
  - Claude 對話歷史 HTML 持久化（每個 workspace 獨立）
  - 重啟後自動恢復所有 tab、active workspace 及聊天記錄
  - 跨重啟接續對話：發送訊息時帶 sessionId 給 sidecar，使用 SDK `resume` 參數
- ✅ **Claude 工具改進**
  - **檔案修改自動刷新編輯器**：Write/Edit/MultiEdit 完成後若該檔案在編輯器開啟，自動重新讀取磁碟內容
  - **Diff 顯示**：Edit/MultiEdit 顯示紅色 `-` 舊行 / 綠色 `+` 新行；Write 非同步讀取舊內容做完整 diff
  - **長行換行**：diff 用 `pre-wrap` + `break-all`，無水平滾動條
  - **檔案路徑可雙擊開啟**：Read/Write/Edit/Grep 等工具的 file_path 可雙擊在編輯器開啟預覽
- ✅ **檔案樹顯示 dotfiles**
  - 不再隱藏所有 `.` 開頭檔案，現在 `.env`、`.gitignore` 等可見
  - 仍隱藏：`node_modules`、`target`、`__pycache__`、`.git`、`.next`、`.DS_Store`
- ✅ 刪除根目錄舊版 `lightide.exe`

### 2026-04-11
- ✅ **終端機輸出改為即時串流 (Event-Driven)**
  - 廢除原本每 50ms 輪詢 (`read_terminal`) 的低效作法
  - PTY 後端取得輸出資料後，立即透過 Tauri Events (`terminal-output`) 推送至前端
  - 完美支援 CLI 應用程式（如 Claude Code）的即時進度條渲染，絕無延遲
  - 新增 `terminal-exit` 事件監聽機制，在進程結束時提示

### 2026-01-18
- ✅ 修復大型文件 (10000+ 行) 開啟時凍結問題
- ✅ 添加 Debounce 輸入處理機制
- ✅ 大型文件自動停用語法高亮以提升效能
- ✅ **新增 Markdown/HTML 雙屏預覽功能**
  - 開啟 .md 或 .html 文件時自動顯示分割視圖
  - 左側為代碼編輯 (1/3)，右側為即時預覽 (2/3)
  - 支援 Ctrl+Shift+P 快捷鍵切換預覽
  - 內建 Markdown 解析器，支援標題、粗斜體、連結、圖片、代碼區塊、表格等
- ✅ **雙向滾動同步** - 編輯區和預覽區滾動互相同步
- ✅ 修復中英混合文字選取跑位問題
- ✅ **新增 TSX/JSX 即時預覽功能**
  - 使用 esbuild-wasm 在瀏覽器中即時編譯 React 組件
  - 使用 React 18 UMD 版本渲染預覽
  - 支援 useState, useEffect 等 React Hooks
- ✅ 滑鼠中鍵關閉編輯器頁簽
- ✅ 終端機寬度調整為 420px
- ✅ **終端機快捷指令功能**
  - 預設指令：npm dev/build、git status/pull/push、clear
  - 支援自訂指令（支援多行指令）
  - 指令儲存在 localStorage
- ✅ **終端機圖片貼上助手**
  - 新增圖片貼上按鈕 (🖼)
  - 支援 Ctrl+V 貼上或拖放圖片
  - 支援框選圖片區域
  - 自動保存圖片至專案目錄 (`.lightide/images/`) 避免權限問題
  - 點擊傳送路徑至終端機，方便 LLM 讀取
- ✅ **檔案樹功能增強**
  - **右鍵點擊**：複製檔案/資料夾絕對路徑 (閃爍提示)
  - **滑鼠中鍵**：內嵌式重命名檔案 (類似 Windows 檔案總管)
  - **左鍵單擊**：標準開啟檔案/切換目錄

### 2026-01-17
- ✅ 添加 MIT LICENSE
- ✅ 添加 README.md
- ✅ 整理 project.md 開發文件
- ✅ Release 版本編譯優化
- ✅ 推送至 GitHub 開源

### 2026-01-16
- ✅ 從 `conpty` 切換到 `portable-pty`
- ✅ 整合 xterm.js 終端機渲染
- ✅ 修復終端機輸入/輸出問題
- ✅ 支援 Claude CLI 互動式應用
- ✅ 修正換行符格式 (`\r\n` → `\r`)
- ✅ 添加環境變數配置 (TERM, COLORTERM)

### 2026-01-13
- ✅ 專案初始化
- ✅ Tauri 2.x 框架建立
- ✅ 基礎三欄式佈局
- ✅ 檔案樹組件
- ✅ 終端機基礎框架
