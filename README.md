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

### Projects（仍在 Google Sheet）

Project 內容仍在這張 Google Sheet 編輯：
https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4

- `Projects` 分頁欄位：slug, title, summary, description, tech_stack, image_url, link_url, order
- 該 Sheet 的 `Blog Posts` 分頁已停用，Blog 內容改由上述 Markdown 檔提供。

Sheet 內容在**建置時**抓取，不是即時的。改完 Sheet 後需重新部署才會生效。

## Deploying

**First-time setup:** Before the first deploy, go to your GitHub repo's **Settings** → **Pages** → **Build and deployment** → **Source** and select **GitHub Actions** (one-time configuration required for the workflow to deploy).

1. Push your changes to the `main`/`master` branch on GitHub.
2. Go to the repo's **Actions** tab.
3. Select **Deploy to GitHub Pages** and click **Run workflow**.
4. Site is published at https://cs83312.github.io/PersionalWebSite/

## Tests

npm test        # runs lib/ unit tests (CSV parsing, data validation, Markdown rendering)
npm run typecheck
npm run build   # also serves as the primary verification for pages/UI (no automated UI tests)
