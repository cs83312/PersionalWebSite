# Blog 內容遷移至 Markdown — 設計文件

日期：2026-09-10

## 1. 背景與問題

目前 Blog 文章存放在 Google Sheet 的 `Blog Posts` 分頁，整篇 Markdown 塞在單一儲存格的 `content` 欄位，建置時透過 CSV 端點抓取（`src/lib/blogPosts.ts`）。這個做法有四個實際限制：

1. **長文編輯體驗差**：整篇文章擠在一個儲存格，換行、程式碼區塊、標題結構都難編也難讀。
2. **圖片與附件無解**：Sheet 沒有地方放圖，只能外連圖床或 Drive 連結。
3. **沒有版本控管與預覽**：沒有 diff，也無法在本機先看文章排版。
4. **建置脆弱**：Google CSV 端點若不可用，整包 build 失敗。

Projects 資料同樣來自該 Sheet，但欄位型資料與表格較契合，**本次不遷移**。

## 2. 範圍界定

本文件是階段 1。使用者的長期目標是「登入後台自行增刪改 blog」，需要伺服器端執行環境、身分驗證與可寫入的儲存後端，與目前 `output: 'export'` + GitHub Pages 的靜態架構衝突，因此拆為獨立的階段 2，日後重新設計。

階段 1 的原則：**不為想像中的後台提前付出任何代價**。Markdown（frontmatter + 內文）本身是可攜格式，未來搬進任何儲存後端都搬得走，這就是階段 1 留給階段 2 的全部後路。

**本次要做**：Blog 內容來源從 Google Sheet 改為 repo 內的 Markdown 檔。

**本次明確不做**：後台 CRUD、身分驗證、Google Drive 讀寫、雙語文章、草稿機制、Projects 遷移、自動部署。

## 3. 檔案配置與格式

```
content/blog/<slug>.md              文章
public/blog/<slug>/<image>          該篇文章的圖片
```

文章範例：

```markdown
---
title: blog 測試資訊
date: 2026-09-07
summary: 這是一篇測試文章的一句話摘要
---

這裡開始寫內文，可以直接放圖：

![封面](/blog/blog-test/cover.png)
```

**規則：**

- **slug 取自檔名**（`blog-test.md` → `/blog/blog-test`）。檔名限定小寫英數與連字號 `^[a-z0-9-]+$`；中文檔名會產生 URL-encode 的網址，在 GitHub Pages 上易出問題。
- **`title` 必填、`date` 必填、`summary` 選填**。`summary` 是列表頁卡片的描述，留空則不顯示。
- **`date` 使用 ISO 格式 `YYYY-MM-DD`**（非 Sheet 舊有的 `2026/07/13`），可排序且可被 `Date` 正確解析。
- **內文不放 `# 一級標題`**：詳情頁已用 `title` 渲染 `<h1>`，內文再放會產生兩個 h1。
- **排序**：`date` 由新到舊；同一天以 slug 字典序決勝。舊有的 `order` 欄位取消——它存在只是因為 Sheet 缺乏可靠排序。

## 4. 模組與資料流

`getAllBlogPosts()` 與 `getBlogPostBySlug(slug)` 的**簽名維持不變**，因此 `src/app/blog/page.tsx` 與 `src/app/blog/[slug]/page.tsx` 幾乎不需修改。改動集中在 `src/lib/blogPosts.ts` 內部。

建置時資料流：

```
fs 讀取 content/blog/*.md
  → gray-matter 拆出 frontmatter 與內文
  → parseBlogPostFile(fileName, raw): BlogPost      純函式，可獨立測試
  → 依 date desc、slug asc 排序
  → renderMarkdown(content, basePath) 產生 HTML     詳情頁
```

### 4.1 型別調整

`BlogPost` 移除 `order` 欄位；其餘欄位（`slug`、`title`、`date`、`summary`、`content`）不變。`Project` 型別不動。

### 4.2 basePath 前綴改寫（必要）

正式環境的 `basePath` 為 `/PersionalWebSite`。Markdown 內寫的 `/blog/blog-test/cover.png` 上線後的真實路徑是 `/PersionalWebSite/blog/blog-test/cover.png`，不補前綴則圖片與站內連結全部失效。

`renderMarkdown(content, basePath)` 透過 marked 的 renderer，將**以 `/` 開頭的**圖片 `src` 與連結 `href` 補上 basePath；`https://`、`http://`、`#` 錨點、相對路徑一律不動。

basePath 的值不得在 `next.config.js` 與 lib 各寫一份。新增 `basePath.js`（CommonJS，置於專案根目錄），匯出 base path 常數與依 `NODE_ENV` 決定的實際值；`next.config.js` 以 `require` 取用，TypeScript 端以 `import` 取用（`tsconfig` 已開啟 `allowJs`）。

### 4.3 新增依賴

`gray-matter`（frontmatter 解析）。僅在建置時的 Node 環境使用，不進瀏覽器 bundle。

## 5. 錯誤處理

現行行為是「壞資料默默跳過」（`console.warn` 後 `return`）。本次改為 **build 直接失敗**：

- frontmatter 缺 `title` 或缺 `date`、或 `date` 不符 `YYYY-MM-DD` → 拋錯，訊息中包含檔名。
- 檔名不符 `^[a-z0-9-]+$` → 拋錯，訊息中包含檔名。
- `content/blog/` 不存在或其中沒有 `.md` 檔 → 回傳空陣列，不拋錯（列表頁顯示為空）。

理由：靜態站的資料錯誤，後果是文章上線後靜默消失且不易察覺。build 當場失敗是較安全的失效模式。

## 6. 測試

- **`src/lib/blogPosts.test.ts` 重寫**（純函式，餵字串，不碰檔案系統）：
  - frontmatter 正確解析為 `BlogPost`
  - slug 取自檔名
  - 缺 `title`、缺 `date`、`date` 格式錯誤、檔名不合法 → 各自拋錯
  - 排序：date 由新到舊；同日以 slug 字典序
- **`src/lib/markdown.test.ts` 補測**：
  - `/blog/x.png` 於 basePath 非空時補上前綴
  - `https://` 外部連結不被改寫
  - basePath 為空字串時輸出與原本一致
- `src/lib/sheets.test.ts`、`src/lib/projects.test.ts` 不動。
- `package.json` 的 `test` script 不需修改（測試檔名未變）。
- `npm run build` 仍是頁面/UI 的主要驗證方式（無自動化 UI 測試）。

## 7. 不變動的部分

- **Projects 完全不動**：繼續由 Google Sheet 建置時抓取，`src/lib/sheets.ts` 與 `src/lib/projects.ts` 保留原狀。
- **`.github/workflows/deploy.yml` 不動**：維持手動 `workflow_dispatch` 觸發。
- Sheet 上既有的 Blog 假資料列（`test,test1,...`）保留不刪，遷移後不再被讀取。

## 8. 種子資料與文件

- 將 Google Drive 上的 `blog_test.md`（內容僅一行 `# blog 測試資訊`）轉為 `content/blog/blog-test.md`，把該標題移入 frontmatter 的 `title`，作為第一篇種子文章。
- **README 更新**：Blog 章節改為說明編輯 `content/blog/*.md` 的流程與 frontmatter 欄位，並明確標示 **Projects 仍由 Google Sheet 提供**——兩套內容來源並存必須寫清楚。發佈流程（手動觸發 workflow）維持原有說明。
