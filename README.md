# KFxNet Personal Website

Static personal website for 許展發 (KLIF), built with Next.js (static export) and deployed to GitHub Pages.

## Development

npm install
npm run dev
# open http://localhost:3000

## Content updates

內容有兩套來源，請注意區分。

### Blog（Markdown 檔，就在這個 repo 裡）

文章放在 `content/blog/<slug>.md`，圖片放在 `public/blog/<slug>/`：

    content/blog/my-post.md
    public/blog/my-post/cover.png

檔案格式：

```markdown
---
title: 文章標題
date: 2026-09-07
summary: 列表頁顯示的一句話摘要（選填）
---

內文從這裡開始，圖片這樣引用：

![說明文字](/blog/my-post/cover.png)
```

規則：

- `content/blog/` 是**平面目錄**，不會遞迴掃描子資料夾——放進子資料夾的檔案（例如 `content/blog/2026/my-post.md`）不會被讀取，也不會有任何警告。
- **網址 slug 取自檔名**（`my-post.md` → `/blog/my-post`），檔名只能用小寫英文、數字與連字號。
- `title` 與 `date` 必填，`date` 必須是 `YYYY-MM-DD`。缺欄位或格式錯誤會讓建置**直接失敗**，錯誤訊息會指出是哪個檔案。
- `summary` 選填，留空則列表頁不顯示描述。
- **內文不要再寫 `# 一級標題`**，詳情頁已經用 `title` 產生 `<h1>`。
- 排序為日期新到舊，同一天則依檔名排序。
- 圖片用 `/blog/<slug>/xxx.png` 這種根路徑寫法即可，正式站的 `/PersionalWebSite` 前綴會在建置時自動補上——但這只適用於 Markdown 的圖片與連結語法（`![]()` / `[]()`）。若在內文中直接寫 HTML 標籤（例如 `<img src="/blog/a/c.png">`），不會被補上前綴，所以請勿在原生 HTML 標籤裡使用根路徑寫法。

本機預覽：`npm run dev` 後開 http://localhost:3000/blog

#### 網頁後台（/admin）

也可以不碰 Git，直接在網頁上新增、編輯、刪除文章：https://cs83312.github.io/PersionalWebSite/admin/

- 後台是 [Sveltia CMS](https://sveltiacms.app/)，設定在 `public/admin/config.yml`。每次儲存都會直接 commit 到 `main`，觸發部署，約 1–2 分鐘後正式站更新。
- 登入：選「使用存取權杖登入」，貼上 GitHub fine-grained personal access token（Repository access 只勾這個 repo，權限 **Contents: Read and write**）。token 只存在該瀏覽器，換裝置需重新貼上。
- 新文章的「網址名稱」（slug）要手動輸入，規則同上（小寫英文、數字、連字號），建立後不可更改。
- 上傳的圖片會存到 `public/blog/<slug>/`，JPEG/PNG 會自動轉成 WebP 並縮到 1600px 以內。
- `config.yml` 的資料夾、slug 規則與欄位由 `src/lib/cmsConfig.test.ts` 檢查是否與 `src/lib/blogPosts.ts` 一致；改其中一邊時記得同步。
- 本機開發時開 http://localhost:3000/admin/index.html，可以選「使用本機倉庫」直接編輯本機檔案（需 Chrome / Edge），不會產生 commit。

### Projects（Markdown 檔，和 Blog 相同做法）

每個專案是 `content/projects/` 底下的一個 `.md` 檔，**檔名就是網址**：`content/projects/hui-hui.md` → `/project/hui-hui`。最方便的編輯方式是網頁後台 `/admin` 的「Project 專案」分類（登入方式同上）。

```markdown
---
title: 恢恢巡路系統
date: 2026-10-06
summary: 道路巡護
tech_stack: Next.js · Spring Boot
cover: /project/hui-hui/cover.webp
link_url: https://example.com
---

這裡是 Markdown 內文……
```

- 檔名、`title`、`date` 規則與 Blog 相同；缺欄位或格式錯誤會讓建置直接失敗，並指出是哪個檔案。
- `summary`、`tech_stack`、`cover`、`link_url` 皆選填。
- 列表依 `date` 新到舊排序，同一天依檔名排序。
- 封面與內文圖片存放在 `public/project/<slug>/`，用 `/project/<slug>/xxx` 寫法；後台上傳時會自動處理。有封面的專案，列表卡片與內頁都會顯示封面。
- `config.yml` 的 projects 設定由 `src/lib/cmsConfig.test.ts` 檢查是否與 `src/lib/projects.ts` 一致。

## Deploying

**First-time setup:** Before the first deploy, go to your GitHub repo's **Settings** → **Pages** → **Build and deployment** → **Source** and select **GitHub Actions** (one-time configuration required for the workflow to deploy).

1. Push your changes to the `main` branch on GitHub (the /admin editor does this on every save). The **Deploy to GitHub Pages** workflow runs automatically.
2. To redeploy without a push, go to the **Actions** tab, select **Deploy to GitHub Pages** and click **Run workflow**.
3. Site is published at https://cs83312.github.io/PersionalWebSite/

## Tests

npm test        # runs lib/ unit tests (content validation, Markdown rendering, CMS config sync)
npm run typecheck
npm run build   # also serves as the primary verification for pages/UI (no automated UI tests)
