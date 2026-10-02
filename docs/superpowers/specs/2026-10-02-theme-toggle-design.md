# 深色／淺色主題切換 — 設計文件

日期：2026-10-02

## 目標

為 KFxNet 個人網站加入深色／淺色主題切換。目前網站只有一套 GitHub-dark 風格的深色配色；本次導入新的品牌淺色配色（Navy／Orange／Green），並從同一組品牌色階推導出深色配色，讓兩個主題屬於同一品牌。

## 成功標準

- 首次造訪（localStorage 無紀錄）時，主題跟隨作業系統 `prefers-color-scheme`。
- 使用者手動切換後，選擇存進 localStorage，之後造訪沿用。
- 載入頁面時不會先閃一下錯誤主題（含靜態匯出 `output: 'export'` 環境）。
- 所有顏色都來自主題變數，元件 CSS 中不再有寫死的色碼。
- 每一頁的 NavBar 都有切換按鈕。

## 色彩變數

變數名稱採用新的命名，取代原本的 `--color-*`。

| 變數 | 淺色 | 深色 |
|---|---|---|
| `--bg` | `#FFFFFF` | `#001020`（Navy 900） |
| `--surface` | `#F2F4F7` | `#001A30`（Navy 800） |
| `--border` | `#D8DEE6` | `#0F3A61`（Navy 600） |
| `--text` | `#002340` | `#EEF3F8`（Navy 50） |
| `--text-muted` | `#5B6675` | `#7C9FC0`（Navy 300） |
| `--text-subtle` | `#A3ADBA` | `#4A769E`（Navy 400） |
| `--primary` | `#002340` | `#EEF3F8` |
| `--primary-soft` | `#EEF3F8` | `#0F3A61`（Navy 600） |
| `--secondary` | `#F28C38` | `#F28C38` |
| `--secondary-ink` | `#9C4A0D` | `#F6A965`（Orange 300） |
| `--secondary-soft` | `#FEF4EB` | `#4D2508`（Orange 900） |
| `--tertiary` | `#177236` | `#62C27F`（Green 300） |
| `--tertiary-soft` | `#EAF7EE` | `#082B15`（Green 900） |

規則：深色主題中，橘色與綠色作為文字時一律使用 300 階；`--secondary`（填色）兩個主題相同，按鈕上的文字維持 Navy。

### 舊色碼替換對照

| 舊值 | 新變數 |
|---|---|
| `--color-bg` / `#0d1117` | `--bg` |
| `#161b22` | `--surface` |
| `--color-border` / `#30363d` | `--border` |
| `--color-text` / `#e6edf3` | `--text` |
| `#8b949e` | `--text-muted` |
| `#484f58` | `--text-subtle` |
| `--color-accent` / `#f0883e`（文字、hover、選中外框） | `--secondary-ink` |
| `#3fb950` | `--tertiary` |

受影響檔案：`globals.css`、`page.module.css`、`not-found.module.css`、`blog/[slug]/page.module.css`、`project/[slug]/page.module.css`、`Card.module.css`、`StoryCard.module.css`、`NavBar.module.css`、`LanguageSwitcher.module.css`。實作時若遇到上表未涵蓋的色碼或 `rgba()`，依語意對應到最接近的變數。

## 架構

### `src/lib/theme.ts`（新增，純邏輯）

- `export type Theme = 'light' | 'dark'`
- `export const THEME_STORAGE_KEY = 'kfxnet-theme'`
- `export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme`：`stored` 為 `'light'` 或 `'dark'` 時回傳它；其他情況依 `prefersDark` 回傳。
- `export const themeInitScript: string`：內嵌於 `<head>` 的腳本。讀取 localStorage（包在 try/catch 中）與 `matchMedia('(prefers-color-scheme: dark)')`，套用與 `resolveInitialTheme` 相同的規則，設定 `document.documentElement.dataset.theme`。使用同一個 `THEME_STORAGE_KEY` 常數組成字串。

### `src/app/layout.tsx`（修改）

- `<html>` 加上 `suppressHydrationWarning`。
- 加入 `<head>`，內含 `<script dangerouslySetInnerHTML={{ __html: themeInitScript }} />`，確保在首次繪製前執行。

### `src/app/globals.css`（修改）

- `:root`：淺色變數 + `color-scheme: light`。
- `:root[data-theme='dark']`：深色變數 + `color-scheme: dark`。
- `@media (prefers-color-scheme: dark) { :root:not([data-theme]) { … } }`：JS 關閉時的後備，內容同深色。
- `body` 改用 `--bg`、`--text`。

### `src/components/ThemeToggle.tsx` + `ThemeToggle.module.css`（新增）

- Client component。狀態初始為 `null`；`useEffect` 中讀取 `document.documentElement.dataset.theme` 設為目前主題。
- 狀態為 `null` 時渲染相同尺寸的按鈕、不顯示圖示（避免 hydration 不一致與版面跳動）。
- 點擊：切換主題 → 設定 `dataset.theme` → 寫入 localStorage（try/catch；失敗時本次切換仍生效，只是不保存）。
- 圖示：內嵌 SVG。淺色主題顯示月亮（點擊後變深色），深色主題顯示太陽。
- 外觀：方形圖示按鈕，邊框、圓角、高度與 `LanguageSwitcher` 按鈕一致；`:focus-visible` 有明顯外框。
- `aria-label` 描述動作，文字來自 dictionary：
  - zh：`切換為深色模式` / `切換為淺色模式`
  - en：`Switch to dark mode` / `Switch to light mode`

### `src/lib/dictionary.ts`（修改）

- 在 zh / en 兩邊新增上述 aria-label 字串。

### `src/components/NavBar.tsx` + `NavBar.module.css`（修改）

- `actions` 區塊每頁都渲染 `<ThemeToggle />`，位於 `LanguageSwitcher` 左側（語言切換仍只在 `/`、`/story` 顯示）。
- `.actions` 改為 `display: flex; gap: 8px; align-items: center`。

## 錯誤處理

- localStorage 讀寫丟出例外（無痕模式、被封鎖）：init 腳本與按鈕都包 try/catch，讀不到時跟隨系統，寫不進去時不保存。
- JS 停用：沒有 `data-theme`，由 CSS media query 跟隨系統；按鈕無作用。
- localStorage 存了無效值：視為沒有紀錄。

## 不在範圍內

- 沒選過主題的使用者，在瀏覽途中變更系統設定時不會即時套用（重新整理後套用）。
- 不做 ThemeContext（目前只有按鈕需要讀主題）。
- 不做全頁色彩切換動畫。
- 不做「跟隨系統」第三種狀態。

## 測試

- 新增 `src/lib/theme.test.ts`，測試 `resolveInitialTheme`：已存 light、已存 dark、存了無效值、沒有存值，各搭配系統淺色／深色。加入 `package.json` 的 `test` 指令。
- `npm run typecheck`、`npm test`、`npm run build` 皆須通過。
- 瀏覽器手動驗證：兩個主題下首頁、story、project、blog 列表與文章頁、404 頁；重新整理不閃爍；選擇會被記住；清除 localStorage 後跟隨系統。
