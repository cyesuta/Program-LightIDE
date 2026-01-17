# IDE 市場技術棧分析

> 此文件記錄了市面主流 IDE/編輯器的技術棧對比分析，作為 LightIDE 技術選型的參考依據。

---

## 📊 市面主流 IDE/編輯器技術棧分析

### 完整對比表（20款）

| # | 名稱 | 開源 | 核心語言 | UI 框架 | 記憶體佔用 | 安裝大小 | 備註 |
|---|------|------|----------|---------|-----------|---------|------|
| 1 | **VS Code** | ✅ | TypeScript | Electron (Chromium) | 150-300 MB | ~100 MB | 市佔率第一，74%開發者使用 |
| 2 | **IntelliJ IDEA** | 部分 | Java/Kotlin | Java Swing | 500 MB+ | ~800 MB | JetBrains 全系列基底 |
| 3 | **Visual Studio** | ❌ | C++/C# | 原生 Win32 + WPF | 1 GB+ | 10+ GB | 微軟旗艦 IDE |
| 4 | **Sublime Text** | ❌ | C++/Python | 自製原生 UI | 40-80 MB | ~30 MB | 極速啟動 |
| 5 | **Vim/Neovim** | ✅ | C/Lua | 終端機 TUI | 10-30 MB | ~10 MB | 終端機編輯器之王 |
| 6 | **Emacs** | ✅ | C/Emacs Lisp | GTK+/原生 | 100-200 MB | ~50 MB | 可程式化編輯器 |
| 7 | **Zed** ⭐ | ✅ | **Rust** | **GPUI (自製 GPU 渲染)** | **30-50 MB** | **~15 MB** | 2024 最新，120 FPS |
| 8 | **Helix** | ✅ | **Rust** | 終端機 TUI (crossterm) | 15-30 MB | ~10 MB | 類 Vim 的現代編輯器 |
| 9 | **Lapce** | ✅ | **Rust** | Floem (自製 GPU UI) | 50-80 MB | ~20 MB | 類 VS Code 的 Rust 編輯器 |
| 10 | **Atom** (已停) | ✅ | JavaScript | Electron | 200-400 MB | ~150 MB | GitHub 開發，已停止維護 |
| 11 | **Eclipse** | ✅ | Java | SWT (自製 Java UI) | 500 MB+ | ~350 MB | Java 老牌 IDE |
| 12 | **NetBeans** | ✅ | Java | Java Swing | 400-600 MB | ~400 MB | Apache 維護 |
| 13 | **PyCharm** | 部分 | Java/Kotlin | Java Swing | 500 MB+ | ~600 MB | Python 專用 IDE |
| 14 | **WebStorm** | ❌ | Java/Kotlin | Java Swing | 500 MB+ | ~500 MB | 前端專用 IDE |
| 15 | **CLion** | ❌ | Java/Kotlin | Java Swing | 500 MB+ | ~700 MB | C/C++ 專用 IDE |
| 16 | **Android Studio** | ✅ | Java/Kotlin | Java Swing | 1 GB+ | 1+ GB | 基於 IntelliJ |
| 17 | **Xcode** | ❌ | Objective-C/Swift | 原生 AppKit | 500 MB+ | 12+ GB | Apple 專用 |
| 18 | **Qt Creator** | ✅ | C++ | Qt (自家框架) | 100-200 MB | ~200 MB | Qt 開發專用 |
| 19 | **Notepad++** | ✅ | C++ | 原生 Win32 | 10-20 MB | ~5 MB | Windows 專用輕量編輯器 |
| 20 | **Brackets** (已停) | ✅ | JavaScript | CEF (Chromium) | 150-250 MB | ~100 MB | Adobe 開發，已停止維護 |

---

### 🔍 技術棧分類總結

#### 1️⃣ Electron 系（Web 技術）
```
VS Code, Atom(停), Brackets(停)
├── 優點：開發快速、插件生態豐富
└── 缺點：肥大、記憶體高、啟動慢
```

#### 2️⃣ Java/Swing 系（JVM）
```
IntelliJ, Eclipse, NetBeans, Android Studio, PyCharm, WebStorm, CLion
├── 優點：跨平台、功能強大
└── 缺點：記憶體佔用高、需要 JVM
```

#### 3️⃣ Rust 原生系 ⭐ 新趨勢
```
Zed, Helix, Lapce
├── 優點：極速、輕量、記憶體安全
└── 缺點：生態較新、需要學習 Rust
```

#### 4️⃣ C++ 原生系
```
Sublime Text, Notepad++, Qt Creator, Visual Studio
├── 優點：效能最佳、系統級整合
└── 缺點：開發複雜度高
```

#### 5️⃣ 終端機 TUI 系
```
Vim, Neovim, Helix
├── 優點：極輕量、SSH 友善
└── 缺點：學習曲線陡峭
```

---

### 💡 關鍵趨勢觀察

1. **Rust 正在成為新一代編輯器首選語言**
   - Zed (2024) 使用自製 GPUI，達到 120 FPS
   - Lapce 使用 Floem GPU UI 框架
   - Helix 純終端機界面

2. **Electron 逐漸被 Tauri 挑戰**
   - 同樣使用 Web 技術但更輕量
   - 記憶體佔用僅 Electron 的 1/3

3. **GPU 加速渲染成為新標準**
   - Zed 的 GPUI
   - Lapce 的 Floem
   - 追求遊戲級流暢度

---

## 🦀 Rust 編輯器深度分析（Zed vs Helix vs Lapce）

### 三大 Rust 編輯器對比

| 特性 | Zed ⭐ | Helix | Lapce |
|------|--------|-------|-------|
| **UI 類型** | GUI (GPU 渲染) | 終端機 TUI | GUI (GPU 渲染) |
| **編輯模式** | 傳統 + Vim | Modal (類 Kakoune) | Modal (類 Vim) |
| **AI 整合** | ✅ 原生支援 | ❌ 無 | ❌ 無 |
| **即時協作** | ✅ 核心功能 | ❌ 無 | ❌ 無 |
| **遠端開發** | ✅ 支援 | ❌ 無 | ✅ 核心功能 |
| **插件系統** | ✅ 豐富 | ⚠️ 開發中 | ⚠️ WASI 基礎 |
| **內建偵錯器** | ⚠️ 基礎 | ❌ 無 | ⚠️ 基礎 |
| **平台支援** | Win/Mac/Linux | Win/Mac/Linux | Win/Mac/Linux |
| **開源協議** | AGPL-3.0 | MPL-2.0 | Apache-2.0 |

---

### 🏆 Zed - 最完整的新世代編輯器

**市場評價極佳的功能：**

1. **極速效能** ⭐⭐⭐
   - 瞬間啟動（< 0.5 秒）
   - GPU 加速渲染，120 FPS 流暢度
   - 大型專案也不卡頓

2. **原生 AI 整合** ⭐⭐⭐
   - 內建 GitHub Copilot、Claude、GPT 支援
   - Agentic Editing（AI 代理編輯）
   - 即時程式碼預測

3. **即時協作** ⭐⭐⭐
   - 類似 Figma 的多人協作
   - 共享游標、語音通話、螢幕分享
   - 深度整合而非外掛

4. **簡潔設計** ⭐⭐
   - 極簡 UI，減少干擾
   - 開箱即用的良好體驗

**缺點與不足：**
- 插件生態仍在成長中
- 進階偵錯功能較弱
- 設定需透過 JSON 檔案

---

### ⌨️ Helix - 終端機愛好者首選

**市場評價極佳的功能：**

1. **開箱即用** ⭐⭐⭐
   - 零配置即可使用 LSP、語法高亮
   - 不需要像 Neovim 花大量時間配置
   - 內建 Tree-sitter 語法分析

2. **Selection-First 編輯模式** ⭐⭐
   - 先選擇再操作（vs Vim 的先操作再選擇）
   - 多數人認為更直觀易學
   - 即時視覺回饋

3. **按鍵提示系統** ⭐⭐
   - 內建 which-key 功能
   - 幫助記憶快捷鍵
   - 降低學習曲線

4. **極輕量** ⭐⭐⭐
   - 記憶體僅 15-30 MB
   - 適合 SSH 遠端開發

**缺點與不足：**
- ⚠️ **無插件系統**（最大問題，開發中但很慢）
- 無內建檔案管理進階操作（刪除、移動）
- 無程式碼折疊
- 無整合終端機

---

### 🚀 Lapce - 類 VS Code 的 Rust 替代品

**市場評價極佳的功能：**

1. **遠端開發** ⭐⭐⭐
   - 本地 UI + 遠端執行
   - 網路延遲優化
   - 類似 VS Code Remote

2. **原生效能** ⭐⭐
   - Rust + GPU 渲染
   - 比 VS Code 輕量 3-5 倍

3. **WASI 插件系統** ⭐
   - WebAssembly 基礎
   - 可用多種語言開發插件

**缺點與不足：**
- UI 有時感覺不夠精緻
- 插件數量遠少於 VS Code
- 偶有穩定性問題
- 開發進度較慢

---

## ❌ VS Code 有但 Rust 編輯器缺少的常用功能

### 關鍵缺失功能對比

| 功能 | VS Code | Zed | Helix | Lapce |
|------|---------|-----|-------|-------|
| **海量插件生態** | ✅ 40,000+ | ⚠️ 數百 | ❌ 無 | ⚠️ 數十 |
| **進階偵錯器** | ✅ 完整 | ⚠️ 基礎 | ❌ 無 | ⚠️ 基礎 |
| **豐富主題** | ✅ 數千款 | ⚠️ 較少 | ⚠️ 較少 | ⚠️ 較少 |
| **圖形化設定** | ✅ 完整 | ❌ JSON | ⚠️ TOML | ⚠️ 基礎 |
| **Notebook 支援** | ✅ Jupyter | ❌ 無 | ❌ 無 | ❌ 無 |
| **Docker 整合** | ✅ 完整 | ❌ 無 | ❌ 無 | ❌ 無 |
| **資料庫工具** | ✅ 插件 | ❌ 無 | ❌ 無 | ❌ 無 |
| **REST Client** | ✅ 插件 | ❌ 無 | ❌ 無 | ❌ 無 |
| **GitLens 級 Git** | ✅ 插件 | ⚠️ 基礎 | ⚠️ 基礎 | ⚠️ 基礎 |
| **程式碼片段** | ✅ 完整 | ✅ LSP | ✅ LSP | ✅ LSP |

### 🔴 對一般開發者最痛的缺失

1. **偵錯器 (Debugger)** - 無法設定斷點、檢視變數
2. **Docker/容器支援** - 無法在容器中開發
3. **資料庫瀏覽器** - 需要另開工具
4. **進階 Git 功能** - 無 blame、history 視覺化
5. **專案範本/Snippets** - 需手動輸入重複程式碼
6. **多根工作區** - 部分編輯器不支援

### 🟢 Rust 編輯器做得更好的地方

1. **啟動速度** - 瞬間開啟 vs VS Code 需要 2-5 秒
2. **記憶體佔用** - 30-80 MB vs 150-400 MB
3. **大檔案處理** - 不會卡頓
4. **原生效能感** - 沒有 Electron 的延遲感
5. **AI 整合（Zed）** - 比 VS Code + Copilot 更流暢
6. **協作功能（Zed）** - 比 Live Share 更深度整合

---

### 💡 選擇建議

| 使用場景 | 推薦選擇 |
|----------|---------|
| 追求極速 + AI + 協作 | **Zed** |
| 終端機愛好者、極簡主義 | **Helix** |
| 需要遠端開發、類 VS Code 體驗 | **Lapce** |
| 需要豐富插件生態、進階偵錯 | 還是用 **VS Code** |
| 想學習做 Rust 編輯器 | 參考 **Zed 或 Lapce** 架構 |

---

> 📅 最後更新：2026-01-13
