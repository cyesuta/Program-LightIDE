# LightIDE - 開發文件

> 🦀 **技術棧：Rust + Tauri** | 此文件為內部開發參考文件

---

## 📋 專案概述

LightIDE 是一個使用 Rust + Tauri 開發的輕量級程式碼編輯器。

> 📖 使用說明請參考 [README.md](README.md)

---

## 🎯 效能目標

| 指標 | 目標值 | 當前狀態 |
|------|--------|----------|
| 啟動時間 | < 1 秒 | ✅ 達成 |
| 記憶體佔用 | < 150 MB (Release) | ⚠️ 測試中 |
| 執行檔大小 | < 20 MB | ✅ 達成 |

---

## 🏗️ 技術架構

```
┌─────────────────────────────────────────────────────────┐
│                      LightIDE                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              UI Layer (HTML/CSS/JS)              │   │
│  │  • xterm.js 終端機渲染                           │   │
│  │  • WebView2 (Tauri)                             │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │            Core Layer (Rust)                     │   │
│  │  • 檔案系統操作                                   │   │
│  │  • 終端機管理 (portable-pty)                     │   │
│  │  • 編輯器狀態                                     │   │
│  └─────────────────────────────────────────────────┘   │
│                         │                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │           Platform Layer (Windows)               │   │
│  │  • ConPTY (Windows Pseudo Terminal)             │   │
│  │  • WebView2                                      │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 核心依賴

| 功能 | Crate | 說明 |
|------|-------|------|
| **應用框架** | `tauri` | 輕量桌面應用框架 |
| **終端機** | `portable-pty` | 跨平台 PTY (使用 ConPTY) |
| **檔案監視** | `notify` | 檔案變更監聽 |
| **序列化** | `serde` | JSON 序列化 |
| **非同步** | `tokio` | 非同步 IO |
| **終端機前端** | `xterm.js` | 專業終端機渲染 |

---

## 📦 模組設計

### 後端模組 (`src-tauri/src/`)

| 模組 | 職責 |
|------|------|
| `main.rs` | Tauri 應用入口 |
| `lib.rs` | 模組匯出 |
| `terminal.rs` | PTY 終端機管理、ShellType 定義 |
| `terminal_commands.rs` | Tauri IPC 命令 |
| `file_system.rs` | 檔案操作、目錄列舉 |
| `editor.rs` | 編輯器狀態管理 |
| `commands.rs` | 通用命令結構 |

### 前端組件 (`src/components/`)

| 組件 | 職責 |
|------|------|
| `app.js` | 應用初始化、快捷鍵 |
| `terminal.js` | xterm.js 終端機組件 |
| `file-tree.js` | 檔案樹組件 |
| `editor.js` | 程式碼編輯器 |
| `statusbar.js` | 狀態列 |
| `state.js` | 全局狀態管理 |

---

## 🚀 開發路線圖

### Phase 1: 基礎框架 ✅ 完成

- [x] Tauri 專案初始化
- [x] 三欄式基本佈局
- [x] 檔案樹基本顯示
- [x] 純文字檔案讀取與顯示
- [x] 終端機整合 (PowerShell/CMD/Git Bash)
- [x] xterm.js 專業渲染

### Phase 2: 核心編輯功能 — 開發中

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

## ⚙️ 設定檔結構 (計劃中)

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

## 🎨 UI 設計原則

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

## 📚 參考資源

### 編輯器參考
- [Zed](https://github.com/zed-industries/zed) — GPU 加速編輯器
- [Lapce](https://github.com/lapce/lapce) — Rust GUI 編輯器
- [Helix](https://github.com/helix-editor/helix) — 終端機編輯器

### 核心技術
- [Tauri](https://tauri.app/) — 應用框架
- [xterm.js](https://xtermjs.org/) — 終端機渲染
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) — PTY 實作

---

## � 相關文件

- [README.md](README.md) — 專案介紹
- [市場分析](docs/market_analysis.md) — IDE 技術棧對比研究

---

> 🚀 **專案狀態：開發中**
> 
> 📅 開始日期：2026-01-13
> 
> ✅ 最後更新：2026-01-17
