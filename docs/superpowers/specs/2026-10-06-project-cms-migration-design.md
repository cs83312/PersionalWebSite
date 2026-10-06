# Project 改用 Markdown + CMS 後台 — 設計文件

日期：2026-10-06

## 目標

Project 資料目前在建置時從 Google Sheet 抓取：沒有後台，改完 Sheet 還要手動重新部署，說明欄位也只能寫純文字。這次比照 Blog 的做法，把 Project 改成 repo 內的 Markdown 檔，並在現有的 Sveltia CMS 後台（`/admin`）加入 Project 分類。

## 成功標準

- 在 `/admin` 可以新增、編輯、刪除 Project；存檔即 commit，push 到 `main` 後自動部署。
- 網站建置時不再連線 Google Sheet。
- Project 說明支援 Markdown（小標題、清單、連結、內文圖片）。
- 可在後台上傳封面圖，列表卡片與內頁都會顯示。
- `/project`、`/project/<slug>` 網址不變。

## 資料格式

每個專案一個檔案：`content/projects/<slug>.md`。檔名即 slug，規則與 Blog 相同（`^[a-z0-9-]+$`），不允許子資料夾。

```markdown
---
title: 恢恢巡路系統
date: 2026-10-06
summary: 道路巡護
tech_stack: ''
cover: /project/hui-hui/cover.webp
link_url: https://cs83312.github.io/SmartRoadPortralPublic
---
拍照、定位、補充說明

流程體驗：……
```

| frontmatter 欄位 | 型別 | 必填 | 說明 |
|---|---|---|---|
| `title` | string | ✅ | 標題 |
| `date` | `YYYY-MM-DD` | ✅ | 排序用，新的在前 |
| `summary` | string | | 列表卡片的摘要 |
| `tech_stack` | string | | 使用技術，自由文字 |
| `cover` | string | | 封面圖路徑，root-relative（`/project/<slug>/xxx`） |
| `link_url` | string | | 外部專案連結 |
| 內文 | Markdown | | 專案說明 |

原本 Sheet 的 `order` 欄位移除，改以日期排序。

圖片存放於 `public/project/<slug>/`，以 `/project/<slug>/xxx` 引用，由程式加上 basePath。這與 Blog 相同：實測 GitHub Pages 上 `/blog/blog-test`（頁面）與 `public/blog/blog-test/`（圖片資料夾）同名並不衝突。

## CMS 設定（`public/admin/config.yml`）

新增 `projects` collection，與 `blog` 並列：

- `label: Project 專案`、`label_singular: 專案`
- `folder: /content/projects`、`extension: md`、`format: frontmatter`、`create: true`、`delete: true`
- slug：建立時手動輸入，`editable: [create]`，pattern 與 `SLUG_PATTERN` 相同
- `media_folder: /public/project/{{filename}}`、`public_folder: /project/{{filename}}`
- `sortable_fields: [date, title]`、`summary: '{{date}} · {{title}}'`
- fields：
  - `title`（string）
  - `date`（datetime，`type: date`，預設 `{{now}}`）
  - `summary`（text，選填）
  - `tech_stack`（string，選填，hint：例如 `Next.js · Spring Boot`）
  - `cover`（image，選填）
  - `link_url`（string，選填）
  - `body`（markdown，hint 同 Blog）

圖片轉 WebP 的設定沿用全域 `media_libraries`。`public/admin/index.html` 的 `<title>` 改為「KFxNet 後台」；`config.yml` 開頭的註解更新為同時涵蓋 Blog 與 Project。

## 架構

### 共用的 frontmatter 工具（從 `blogPosts.ts` 抽出）

`normalizeDate`、`SLUG_PATTERN`、`DATE_PATTERN`，以及「選填字串欄位的型別檢查」移到 `src/lib/frontmatter.ts`，由 `blogPosts.ts` 與 `projects.ts` 共用。`blogPosts.ts` 繼續 re-export `SLUG_PATTERN`，既有 import 不需修改。這是純搬移，Blog 的行為與錯誤訊息不變，既有 Blog 測試必須全數通過。

### `src/lib/projects.ts`（改寫）

- `parseProjectFile(fileName, raw): Project`：驗證並解析單一檔案，規則同 `parseBlogPostFile`：
  - 檔名不合 slug 規則 → throw
  - YAML 解析失敗 → throw，訊息附檔名
  - `title` 缺少或空白 → throw；非字串 → throw
  - `date` 不是有效的 `YYYY-MM-DD` → throw
  - `summary`、`tech_stack`、`cover`、`link_url` 存在但非字串 → throw；缺少則為 `''`
- `getAllProjects()`：讀 `content/projects/*.md`（只讀第一層，忽略非 `.md`），依 `date` 由新到舊排序，同日期再依 slug 排序。資料夾不存在或為空時回傳 `[]`。
- `getProjectBySlug(slug)`：同現有介面。

### `src/lib/types.ts`

```ts
export interface Project {
  slug: string;
  title: string;
  date: string;
  summary: string;
  techStack: string;
  cover: string;    // root-relative，尚未加 basePath
  linkUrl: string;
  content: string;  // Markdown 原文
}
```

移除 `description`、`imageUrl`、`order`。

### basePath

- 封面：把 `markdown.ts` 中 `prefixInternalHrefs` 的判斷抽成 export 的 `withBasePath(href, basePath): string`（`/` 開頭且非 `//` 開頭、且尚未以 `${basePath}/` 開頭時才加前綴，其餘原樣回傳）。`prefixInternalHrefs` 改為呼叫它，頁面組封面 `src` 時也用它。
- 內文：用 `renderMarkdown(project.content, basePath)`，與 Blog 相同。

### `src/components/Card.tsx`

新增選填 prop `imageSrc?: string`。有值時在卡片頂端顯示圖片（固定比例 16:9、`object-fit: cover`、`alt=""`，因為標題就在旁邊）。沒有值時輸出的 HTML 與現在完全相同，首頁與 Blog 的卡片不受影響。

### `src/app/project/page.tsx`

依 `getAllProjects()` 的順序渲染；有封面時傳入加好 basePath 的 `imageSrc`。

### `src/app/project/[slug]/page.tsx`

由上到下：標題 → 使用技術 → 封面圖 → Markdown 內文 → 「查看專案 →」連結（有 `link_url` 才顯示）。內文容器套用與 Blog 文章頁相同的內容樣式（標題字型、連結色、圖片寬度限制）。做法：把 `blog/[slug]/page.module.css` 中的 `.content` 規則移到共用的 `src/app/article.module.css`，兩頁都引用。

## 資料搬移

- 新增 `content/projects/hui-hui.md`：`title`、`summary`、`link_url` 取自 Sheet；`date: 2026-10-06`；`tech_stack`、`cover` 空白；Sheet 的 description 兩行轉成兩個 Markdown 段落。

## 移除

- `src/lib/sheets.ts`、`src/lib/sheets.test.ts`
- `package.json`：`papaparse`、`@types/papaparse`，以及 `test` 指令中的 `sheets.test.ts`
- README：「Projects（仍在 Google Sheet）」一節改寫為 `/admin` 編輯 Project 的說明，並刪除「改完 Sheet 要手動 Run workflow」那一行

## 刪除 Google Sheet（最後一步）

使用者要求刪除原本的 Google Sheet（`1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4`）。必須等新版已 push 到 `main`、部署成功，並確認正式網站的 `/project` 與 `/project/hui-hui` 正常顯示後才執行，因為在那之前，任何一次舊版 build 都還需要讀取它。刪除方式是透過 Google Drive 移到垃圾桶（30 天內可還原），不做永久刪除。

## 錯誤處理

- 任何一個 Project 檔不合規則，build 就失敗，錯誤訊息指出檔名與欄位，不會跳過（與舊 Sheet 版「略過缺欄位的列」不同）。部署失敗時 GitHub Pages 維持上一個成功的版本。
- `content/projects/` 不存在或為空：列表頁顯示空清單，build 成功。

## 不在範圍內

- 英文版 Project 內容
- 標籤、分類、篩選
- 草稿／未發布狀態

## 測試

- `src/lib/projects.test.ts`（改寫）：正常檔案、缺 title、title 非字串、日期格式錯誤、日期帶時區偏移、選填欄位型別錯誤、檔名不合規則、YAML 錯誤、依日期排序（含同日期）、空資料夾。
- 共用工具不另開測試檔：`blogPosts.test.ts` 既有的日期、slug 測試（20 項）在搬移後必須照常通過，作為抽出共用工具時的回歸保護；Project 端的同類情況由 `projects.test.ts` 涵蓋。
- `src/lib/cmsConfig.test.ts`：新增 project collection 檢查，包括 folder、extension、沒有 `path`、slug pattern 等於 `SLUG_PATTERN`、media/public folder，以及 fields 名稱與必填設定和 `parseProjectFile` 一致。
- `markdown.test.ts` 新增 `withBasePath` 測試：`/x` 會加前綴、`//x` 與 `https://x` 不加、已帶 basePath 的不重複加、basePath 為空字串時原樣回傳。
- `npm run typecheck`、`npm test`、`npm run build` 皆須通過。
- 瀏覽器檢查：`/project` 列表（有封面與無封面的卡片）與 `/project/hui-hui` 內頁，淺色與深色各一次；首頁與 Blog 列表的卡片外觀不變。
