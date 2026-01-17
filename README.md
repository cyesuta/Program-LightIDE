# LightIDE

<p align="center">
  <img src="src-tauri/icons/128x128.png" alt="LightIDE Logo" width="128" height="128">
</p>

<p align="center">
  <strong>🚀 輕量、極速的程式碼編輯器</strong>
</p>

<p align="center">
  <a href="#特色">特色</a> •
  <a href="#截圖">截圖</a> •
  <a href="#安裝">安裝</a> •
  <a href="#開發">開發</a> •
  <a href="#技術棧">技術棧</a> •
  <a href="#授權">授權</a>
</p>

---

## ✨ 特色

- ⚡ **極速啟動** — 使用原生 Rust 後端，啟動迅速
- 🪶 **輕量資源** — 使用 Tauri 框架，資源佔用更低
- 💻 **真正的終端機** — 支援 PowerShell、CMD、Git Bash，使用 xterm.js 專業渲染
- 📁 **檔案瀏覽** — 內建檔案樹，輕鬆瀏覽專案結構
- 🎨 **現代 UI** — 深色主題，舒適的開發體驗

## 🖥️ 功能

| 功能 | 描述 |
|------|------|
| 📂 檔案總管 | 瀏覽專案目錄結構 |
| 📝 程式碼編輯 | 基礎的程式碼編輯功能 |
| 💻 終端機 | PowerShell / CMD / Git Bash |
| 🔄 即時預覽 | HTML、Markdown 檔案預覽 |

## 📦 安裝

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

## 🛠️ 開發

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

## 🔧 技術棧

| 層級 | 技術 |
|------|------|
| **前端** | HTML + CSS + JavaScript |
| **終端機** | [xterm.js](https://xtermjs.org/) (MIT) |
| **後端** | Rust + [Tauri](https://tauri.app/) (MIT) |
| **PTY** | [portable-pty](https://github.com/wez/wezterm/tree/main/pty) (MIT) |
| **視窗** | WebView2 |

## 📖 路線圖

- [ ] 語法高亮 (Tree-sitter)
- [ ] 更好的程式碼編輯器
- [ ] 分頁功能
- [ ] 搜尋與替換
- [ ] 插件系統
- [ ] 設定檔

## 📄 授權

本專案使用 [MIT License](LICENSE) 開源。

## 🙏 致謝

- [Tauri](https://tauri.app/) - 輕量的桌面應用框架 (MIT License)
- [xterm.js](https://xtermjs.org/) - 終端機渲染庫 (MIT License)
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) - 跨平台 PTY 支援 (MIT License)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/cyesuta">cyesuta</a>
</p>
