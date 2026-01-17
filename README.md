# LightIDE

<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="LightIDE Logo" width="128" height="128">
</p>

<p align="center">
  <strong>輕量、極速的程式碼編輯器</strong>
</p>

<p align="center">
  <a href="#特色">特色</a> •
  <a href="#安裝">安裝</a> •
  <a href="#開發">開發</a> •
  <a href="#技術架構">技術架構</a> •
  <a href="#路線圖">路線圖</a> •
  <a href="#授權">授權</a>
</p>

---

## 特色

- **極速啟動** — 使用原生 Rust 後端，啟動迅速
- **輕量資源** — 使用 Tauri 框架，資源佔用更低
- **真正的終端機** — 支援 PowerShell、CMD、Git Bash，使用 xterm.js 專業渲染
- **檔案瀏覽** — 內建檔案樹，輕鬆瀏覽專案結構
- **現代 UI** — 深色主題，舒適的開發體驗

## 功能

| 功能 | 描述 |
|------|------|
| 檔案總管 | 瀏覽專案目錄結構 |
| 程式碼編輯 | 基礎的程式碼編輯功能 |
| 終端機 | PowerShell / CMD / Git Bash |
| 即時預覽 | HTML、Markdown 檔案預覽 |

## 效能目標

| 指標 | 目標值 | 當前狀態 |
|------|--------|----------|
| 啟動時間 | < 1 秒 | 達成 |
| 記憶體佔用 | < 150 MB (Release) | 測試中 |
| 執行檔大小 | < 20 MB | 達成 |

---

## 安裝

### 從 Release 下載

前往 [Releases](https://github.com/cyesuta/Program-LightIDE/releases) 頁面下載最新版本。

### 從原始碼編譯

```bash
# 複製倉庫
git clone https://github.com/cyesuta/Program-LightIDE.git
cd Program-LightIDE

# 安裝 Node.js 依賴
npm install

# 下載前端依賴 (xterm.js)
npm run setup

# 編譯並運行
cd src-tauri
cargo run

# 編譯 Release 版本
cargo build --release
```

---

## 開發

### 前置需求

- [Rust](https://www.rust-lang.org/) 1.70+
- [Node.js](https://nodejs.org/) 18+
- Windows 10/11

### 專案結構

```
LightIDE/
├── src/                    # 前端代碼
│   ├── components/         # JavaScript 組件
│   ├── styles/             # CSS 樣式
│   ├── assets/             # 靜態資源
│   └── index.html          # 主頁面
├── src-tauri/              # Rust 後端
│   ├── src/
│   │   ├── main.rs         # 入口點
│   │   ├── terminal.rs     # 終端機模組
│   │   ├── file_system.rs  # 檔案系統模組
│   │   └── editor.rs       # 編輯器狀態模組
│   ├── Cargo.toml          # Rust 依賴
│   └── tauri.conf.json     # Tauri 配置
└── docs/                   # 文件
```

### 後端模組 (src-tauri/src/)

| 模組 | 職責 |
|------|------|
| `main.rs` | Tauri 應用入口 |
| `lib.rs` | 模組匯出 |
| `terminal.rs` | PTY 終端機管理、ShellType 定義 |
| `terminal_commands.rs` | Tauri IPC 命令 |
| `file_system.rs` | 檔案操作、目錄列舉 |
| `editor.rs` | 編輯器狀態管理 |
| `commands.rs` | 通用命令結構 |

### 前端組件 (src/components/)

| 組件 | 職責 |
|------|------|
| `app.js` | 應用初始化、快捷鍵 |
| `terminal.js` | xterm.js 終端機組件 |
| `file-tree.js` | 檔案樹組件 |
| `editor.js` | 程式碼編輯器 |
| `statusbar.js` | 狀態列 |
| `state.js` | 全局狀態管理 |

---

## 技術架構

```
┌─────────────────────────────────────────────────────────────┐
│                      LightIDE                               │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              UI Layer (HTML/CSS/JS)                  │   │
│  │  • xterm.js 終端機渲染                               │   │
│  │  • WebView2 (Tauri)                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            Core Layer (Rust)                         │   │
│  │  • 檔案系統操作                                       │   │
│  │  • 終端機管理 (portable-pty)                         │   │
│  │  • 編輯器狀態                                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Platform Layer (Windows)                   │   │
│  │  • ConPTY (Windows Pseudo Terminal)                 │   │
│  │  • WebView2                                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 核心依賴

| 層級 | 技術 |
|------|------|
| **前端** | HTML + CSS + JavaScript |
| **終端機** | [xterm.js](https://xtermjs.org/) (MIT) |
| **後端** | Rust + [Tauri](https://tauri.app/) (MIT) |
| **PTY** | [portable-pty](https://github.com/wez/wezterm/tree/main/pty) (MIT) |
| **視窗** | WebView2 |

### Rust Crates

| 功能 | Crate | 說明 |
|------|-------|------|
| **應用框架** | `tauri` | 輕量桌面應用框架 |
| **終端機** | `portable-pty` | 跨平台 PTY (使用 ConPTY) |
| **檔案監視** | `notify` | 檔案變更監聽 |
| **序列化** | `serde` | JSON 序列化 |
| **非同步** | `tokio` | 非同步 IO |

---

## 路線圖

### Phase 1: 基礎框架 (已完成)

- [x] Tauri 專案初始化
- [x] 三欄式基本佈局
- [x] 檔案樹基本顯示
- [x] 純文字檔案讀取與顯示
- [x] 終端機整合 (PowerShell/CMD/Git Bash)
- [x] xterm.js 專業渲染

### Phase 2: 核心編輯功能 (開發中)

- [ ] 語法高亮 (Tree-sitter 或 Prism.js)
- [ ] 游標移動與編輯
- [ ] Undo/Redo 功能
- [ ] 檔案儲存
- [ ] 分頁功能

### Phase 3: 優化與完善

- [ ] 主題系統 (深色/淺色)
- [ ] 設定檔
- [ ] 快捷鍵自訂
- [ ] 搜尋與替換
- [ ] 效能優化

### Phase 4: 進階功能 (可選)

- [ ] 分割視窗
- [ ] 迷你地圖
- [ ] Git 整合
- [ ] 插件系統

---

## 設定檔結構 (計劃中)

```toml
# config/settings.toml

[editor]
font_family = "JetBrains Mono"
font_size = 14
tab_size = 4
line_numbers = true

[theme]
name = "dark"

[terminal]
shell = "powershell"  # "powershell" | "cmd" | "gitbash"
font_size = 13

[window]
width = 1400
height = 900
```

---

## UI 設計原則

1. **極簡主義** — 只顯示必要資訊
2. **高對比度** — 深色主題為主
3. **一致性** — 統一的視覺語言
4. **響應式** — 即時回饋使用者操作

### 色彩規範 (深色主題)

| 用途 | 顏色 | Hex |
|------|------|-----|
| 主背景 | 深灰 | `#1E1E1E` |
| 次背景 | 淺灰 | `#252526` |
| 主文字 | 白灰 | `#D4D4D4` |
| 強調色 | 藍色 | `#007ACC` |
| 錯誤 | 紅色 | `#F44747` |
| 成功 | 青色 | `#4EC9B0` |

---

## 授權

本專案使用 [MIT License](LICENSE) 開源。

## 致謝

- [Tauri](https://tauri.app/) - 輕量的桌面應用框架 (MIT License)
- [xterm.js](https://xtermjs.org/) - 終端機渲染庫 (MIT License)
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) - 跨平台 PTY 支援 (MIT License)

## 參考資源

### 編輯器參考
- [Zed](https://github.com/zed-industries/zed) — GPU 加速編輯器
- [Lapce](https://github.com/lapce/lapce) — Rust GUI 編輯器
- [Helix](https://github.com/helix-editor/helix) — 終端機編輯器

### 相關文件
- [市場分析](docs/market_analysis.md) — IDE 技術棧對比研究

---

<p align="center">
  Made with Rust by <a href="https://github.com/cyesuta">cyesuta</a>
</p>
