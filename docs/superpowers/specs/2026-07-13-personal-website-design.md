# KFxNet 個人網站 — 設計文件

日期：2026-07-13

## 1. 目標與背景

為許展發（KLIF）建立一個品牌名為 **KFxNet** 的個人靜態網站，展示自我介紹、AI 領域學習歷程、專案作品與部落格文章。網站需可透過 Google Sheet 編輯 Project / Blog 內容，不需改程式碼即可更新展示內容（但需要手動重新部署）。

## 2. 技術架構

- **框架**：Next.js（App Router），`output: 'export'` 靜態匯出（無伺服器執行環境）
- **託管**：GitHub Pages，使用既有 repo `cs83312/PersionalWebSite`
  - `next.config` 設定 `basePath: '/PersionalWebSite'`，`assetPrefix` 同步設定
  - 網址：`https://cs83312.github.io/PersionalWebSite/`
- **CI/CD**：GitHub Actions workflow，**手動觸發**（`workflow_dispatch`）
  - 流程：checkout → 安裝依賴 → `next build`（含建置時抓取 Google Sheet CSV 與 static export）→ 使用 GitHub 官方 `actions/upload-pages-artifact` + `actions/deploy-pages` 部署到 GitHub Pages（不使用額外的 `gh-pages` 分支）
  - 更新 Google Sheet 內容後，需手動到 GitHub Actions 頁面點擊執行一次此 workflow，網站才會反映最新內容
- **資料來源**：Google Sheets，兩個分頁（Projects、Blog Posts），透過「發布到網路 CSV」/ 直接 CSV 匯出連結取得資料
  - 抓取時機為**建置時（build-time）**，非瀏覽器端即時抓取；資料在建置階段轉為靜態 HTML，兼顧最佳效能與 SEO

## 3. 頁面與路由結構

```
/                     Home（Brand 首頁：KFxNet 品牌 + 導覽入口）
/story                My Story（自我介紹 + 2023 年進入 AI 領域的故事，中英切換）
/project              Project 列表（卡片呈現，資料來自 Google Sheet）
/project/[slug]       Project 詳情頁（建置時依 Sheet 資料生成，僅中文）
/blog                 Blog 列表（資料來自 Google Sheet）
/blog/[slug]          Blog 文章詳情頁（建置時依 Sheet 資料生成，僅中文）
```

- 導覽列固定於頁面頂部；導覽項目（Home / My Story / Project / Blog）水平置中於頁面中間，與左側 Logo（KFxNet）、右側語言切換按鈕（僅 Home / My Story 頁面顯示）分開排列
- Project 卡片點擊後導航至獨立網址的詳情頁（非彈窗），有利於分享連結與 SEO
- Blog 列表點擊文章後同樣導航至獨立網址的文章詳情頁
- `/project/[slug]`、`/blog/[slug]` 的所有路徑於建置時透過 `generateStaticParams` 依 Sheet 資料動態產生
- 訪問不存在的 `slug` 顯示 404 頁面

不含獨立 Introduce 頁面（自我介紹內容併入 My Story 頁面）。

## 4. Google Sheet 資料結構

試算表網址：`https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4`（已設定為連結可檢視，可直接以 CSV 匯出連結存取）

**Projects 分頁欄位：**

| 欄位 | 說明 | 必要性 |
|---|---|---|
| `slug` | 網址代稱，例如 `hui-hui` | 必要 |
| `title` | 專案名稱 | 必要 |
| `summary` | 卡片上顯示的一句話簡介 | 選填 |
| `description` | 詳情頁完整說明（可多段） | 選填 |
| `tech_stack` | 使用技術，例如「Android, Spring Boot」 | 選填 |
| `image_url` | 卡片縮圖網址 | 選填 |
| `link_url` | 專案外部連結（GitHub / Demo） | 選填 |
| `order` | 顯示順序（數字，小到大） | 選填 |

目前已有一筆真實資料（`hui-hui` / 恢恢巡路系統）。

**Blog Posts 分頁欄位：**

| 欄位 | 說明 | 必要性 |
|---|---|---|
| `slug` | 網址代稱 | 必要 |
| `title` | 文章標題 | 必要 |
| `date` | 發布日期，例如 `2026-07-13` | 選填 |
| `summary` | 列表頁摘要 | 選填 |
| `content` | 文章完整內容，支援基本 Markdown 語法：標題（`#`）、粗體（`**`）、清單（`-`）、連結（`[]()`）、段落換行 | 選填 |
| `order` | 同日期排序用 | 選填 |

- CSV 解析時對所有欄位值做前後空白 trim（避免欄名或內容中的多餘空格造成問題）
- `slug`、`title` 為必要欄位；缺漏的資料列在建置時跳過並於 log 印出警告，不中斷整體建置

## 5. 視覺設計

- **風格方向**：深色科技風（Dark Tech，類 GitHub Dark / Vercel）
  - 背景 `#0d1117`、主要文字 `#e6edf3`、邊框 `#30363d`
  - 品牌 Logo / 標題帶等寬字型（monospace）點綴，呼應工程師/開發者形象
- **強調色（Accent）**：活力橘 Amber `#f0883e`，用於按鈕、連結、標籤等互動元素
- **Project / Blog 列表**：卡片式排版（grid），卡片顯示標題與摘要，點擊進入詳情頁

## 6. 中英雙語（僅 Home / My Story 頁面）

- 採用**前端字典切換**方式：頁面內建中/英文字典（JSON/object），右上角提供語言切換按鈕，點擊後由 JavaScript 直接切換顯示文字，不改變網址
- 適用範圍：Home、My Story（含導覽列文字）
- Project、Blog 內容目前僅中文，不做雙語（未來如需要可再擴充）

## 7. 內容準備狀態

- **My Story 頁面**：目前僅有雛形文字（自我介紹 + 「從 2023 年進入 AI 領域」故事開頭），設計/實作階段先以 placeholder 文字定案版面結構，實際完整文字由使用者之後直接於程式碼中補上
- **Project / Blog 內容**：由使用者於 Google Sheet 中維護，Projects 分頁已有 `hui-hui`（恢恢巡路系統）一筆資料，`瓦斯訂單系統` 待補

## 8. 錯誤處理

- 建置時 Google Sheet CSV 抓取失敗（網路錯誤、Sheet 未公開等）→ 建置直接失敗並顯示明確錯誤訊息，避免部署出殘缺網站
- 資料列缺少必要欄位（`slug`/`title`）→ 該列跳過，並於建置 log 印出警告
- 選填欄位缺漏（如 `image_url`、`link_url`）→ 頁面正常顯示，僅不呈現對應區塊（如無圖時不顯示縮圖、無連結時不顯示外部連結按鈕）
- 訪問不存在的 `/project/[slug]` 或 `/blog/[slug]` → 顯示 404 頁面

## 9. 測試方式

作為靜態展示型個人網站，不建置完整自動化測試套件，改採：

- **建置驗證**：`next build`（含 static export）成功執行，確認所有已知 `slug` 路徑皆正確生成對應靜態頁面
- **手動 QA**：部署前於瀏覽器手動檢查：
  - 各頁面（Home / My Story / Project / Project 詳情 / Blog / Blog 詳情）正常顯示
  - Project / Blog 卡片點擊導航正確
  - Home / My Story 語言切換按鈕正常運作
  - 響應式版面（手機/桌面）顯示正常

## 10. 範圍外（Out of Scope）

- Introduce 獨立頁面（已併入 My Story）
- Project / Blog 內容雙語
- 自動化重新部署（採手動觸發，暫不設定排程）
- 留言、搜尋、RSS 等進階部落格功能
