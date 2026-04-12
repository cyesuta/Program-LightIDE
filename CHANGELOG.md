# Changelog

所有重要的變更都會記錄在此文件中。

格式基於 [Keep a Changelog](https://keepachangelog.com/zh-TW/1.0.0/)。

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
