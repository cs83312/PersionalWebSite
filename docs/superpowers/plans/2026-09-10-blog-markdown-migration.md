# Blog 內容遷移至 Markdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Blog 文章來源從 Google Sheet 的單一儲存格改為 repo 內的 `content/blog/*.md`，並讓文章內的圖片在 GitHub Pages 的 basePath 下正確運作。

**Architecture:** `getAllBlogPosts()` / `getBlogPostBySlug()` 的簽名維持不變，只抽換 `src/lib/blogPosts.ts` 的內部實作：建置時以 `fs` 讀取 `content/blog/*.md`，用 `gray-matter` 拆出 frontmatter，slug 取自檔名，依 `date` 由新到舊排序。文章內以 `/blog/<slug>/x.png` 形式引用的圖片，在渲染時透過 marked 的 `walkTokens` 掛鉤補上 basePath 前綴。Projects 不動，仍走 Google Sheet。

**Tech Stack:** Next.js 14（App Router，`output: 'export'`）、TypeScript、marked 12.0.2、gray-matter（本次新增）、`node:test` + tsx。

**Spec:** `docs/superpowers/specs/2026-09-10-blog-markdown-migration-design.md`

## Global Constraints

- 檔案配置固定為 `content/blog/<slug>.md` 與 `public/blog/<slug>/<image>`。
- slug 取自檔名，必須符合 `^[a-z0-9-]+$`。
- frontmatter：`title`（必填字串）、`date`（必填，`YYYY-MM-DD`）、`summary`（選填字串）。
- 排序：`date` 由新到舊；同一天以 slug 字典序（升冪）決勝。
- `BlogPost` 型別**不再有 `order` 欄位**。
- 資料錯誤一律拋錯讓 build 失敗，錯誤訊息必須包含檔名。`content/blog/` 不存在或無 `.md` 時回傳空陣列，不拋錯。
- 正式環境 basePath 為 `/PersionalWebSite`，且這個字串在整個 repo 只能定義一次（`src/lib/basePath.js`）。
- 只有以 `/` 開頭的 href 會被補前綴；`http://`、`https://`、`#` 錨點、相對路徑一律不動。
- **不得修改** `src/lib/sheets.ts`、`src/lib/projects.ts`、`src/app/project/**`、`.github/workflows/deploy.yml`。
- marked 版本為 12.0.2，使用 `new Marked({ walkTokens })`（v13+ 的 token-object renderer API 在此不適用）。
- 每個 Task 結束前必須 `npm test` 全綠才能 commit。

---

### Task 1: basePath 單一真實來源

目前 `/PersionalWebSite` 這個字串只寫在 `next.config.js`。`src/lib` 之後也需要它（Task 2 渲染 Markdown 時要補前綴），不能各寫一份。因為 `next.config.js` 是 CommonJS 且無法 `import` TypeScript，所以這個共用模組寫成 `.js`（CJS），兩邊都取得同一份值。

**Files:**
- Create: `src/lib/basePath.js`
- Create: `src/lib/basePath.test.ts`
- Modify: `next.config.js`（整檔重寫，見 Step 4）
- Modify: `package.json`（`scripts.test` 加入新測試檔）

**Interfaces:**
- Consumes: 無（本計畫的第一個 Task）
- Produces:
  - `REPO_BASE_PATH: string` — 常數 `'/PersionalWebSite'`
  - `resolveBasePath(nodeEnv: string | undefined): string` — `'production'` 時回傳 `REPO_BASE_PATH`，否則回傳 `''`
  - `basePath: string` — `resolveBasePath(process.env.NODE_ENV)` 的結果，供 app 端直接使用

- [ ] **Step 1: 寫失敗的測試**

建立 `src/lib/basePath.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REPO_BASE_PATH, resolveBasePath } from './basePath';

test('REPO_BASE_PATH is the GitHub Pages repo path', () => {
  assert.equal(REPO_BASE_PATH, '/PersionalWebSite');
});

test('resolveBasePath returns the repo base path in production', () => {
  assert.equal(resolveBasePath('production'), '/PersionalWebSite');
});

test('resolveBasePath returns an empty string outside production', () => {
  assert.equal(resolveBasePath('development'), '');
  assert.equal(resolveBasePath('test'), '');
  assert.equal(resolveBasePath(undefined), '');
});
```

- [ ] **Step 2: 把新測試檔加進 test script**

修改 `package.json` 的 `scripts.test`，在最後追加 `src/lib/basePath.test.ts`：

```json
"test": "tsx --test src/lib/sheets.test.ts src/lib/projects.test.ts src/lib/blogPosts.test.ts src/lib/markdown.test.ts src/lib/basePath.test.ts"
```

- [ ] **Step 3: 執行測試，確認失敗**

Run: `npx tsx --test src/lib/basePath.test.ts`
Expected: FAIL，錯誤訊息類似 `Cannot find module './basePath'`

- [ ] **Step 4: 寫最小實作**

建立 `src/lib/basePath.js`：

```js
// Single source of truth for the GitHub Pages base path.
// next.config.js is CommonJS and cannot import TypeScript, so this shared
// module stays CommonJS and is consumed by both the Next config and src/lib.
const REPO_BASE_PATH = '/PersionalWebSite';

function resolveBasePath(nodeEnv) {
  return nodeEnv === 'production' ? REPO_BASE_PATH : '';
}

module.exports = {
  REPO_BASE_PATH,
  resolveBasePath,
  basePath: resolveBasePath(process.env.NODE_ENV),
};
```

- [ ] **Step 5: 讓 next.config.js 改用共用模組**

把 `next.config.js` 整檔換成以下內容（不再自己宣告 `repoBasePath`）：

```js
const { resolveBasePath } = require('./src/lib/basePath');

const basePath = resolveBasePath(process.env.NODE_ENV);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath ? `${basePath}/` : '',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
```

- [ ] **Step 6: 執行測試與型別檢查，確認通過**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS，typecheck 無輸出

- [ ] **Step 7: 確認 Next 仍讀得到設定**

Run: `npm run build`
Expected: build 成功並產生 `out/`（此時 Blog 仍走 Google Sheet，屬正常）

- [ ] **Step 8: Commit**

```bash
git add src/lib/basePath.js src/lib/basePath.test.ts next.config.js package.json
git commit -m "refactor: extract basePath into a single shared module

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: renderMarkdown 補上 basePath 前綴

Markdown 內文會寫 `![封面](/blog/blog-test/cover.png)`，但正式站的真實路徑是 `/PersionalWebSite/blog/blog-test/cover.png`。不補前綴，上線後圖片與站內連結全破。

作法是 marked 的 `walkTokens` 掛鉤：在 token 樹走訪時改寫 `image` / `link` token 的 `href`，讓 marked 用預設邏輯產生 HTML。**不要**改寫 renderer 方法——那需要自己拼 HTML，容易漏掉 title、alt 的跳脫處理。

**Files:**
- Modify: `src/lib/markdown.ts`（整檔重寫，見 Step 3）
- Modify: `src/lib/markdown.test.ts`（追加三個測試，見 Step 1）
- Modify: `src/app/blog/[slug]/page.tsx`（新增 import 並傳入 basePath，見 Step 5）

**Interfaces:**
- Consumes: `basePath: string`（Task 1 的 `src/lib/basePath.js`）
- Produces: `renderMarkdown(content: string, basePath?: string): string` — 第二個參數預設 `''`，因此既有呼叫端不加參數也能編譯

- [ ] **Step 1: 寫失敗的測試**

在 `src/lib/markdown.test.ts` **既有測試之後**追加以下三個測試（保留原本的 `renderMarkdown converts heading, bold, list, and link`，不要刪）：

```ts
test('renderMarkdown prefixes root-relative image and link paths with basePath', () => {
  const html = renderMarkdown('![封面](/blog/blog-test/cover.png)\n\n[內頁](/blog/other)', '/PersionalWebSite');
  assert.match(html, /<img src="\/PersionalWebSite\/blog\/blog-test\/cover\.png"/);
  assert.match(html, /<a href="\/PersionalWebSite\/blog\/other">內頁<\/a>/);
});

test('renderMarkdown leaves external links and anchors untouched', () => {
  const html = renderMarkdown('[外連](https://example.com) [錨點](#section)', '/PersionalWebSite');
  assert.match(html, /<a href="https:\/\/example\.com">外連<\/a>/);
  assert.match(html, /<a href="#section">錨點<\/a>/);
});

test('renderMarkdown leaves paths unchanged when basePath is empty', () => {
  const html = renderMarkdown('![封面](/blog/blog-test/cover.png)\n\n[內頁](/blog/other)');
  assert.match(html, /<img src="\/blog\/blog-test\/cover\.png"/);
  assert.match(html, /<a href="\/blog\/other">內頁<\/a>/);
});
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `npx tsx --test src/lib/markdown.test.ts`
Expected: 前兩個新測試 FAIL（`href` 沒有被補上前綴）；第三個新測試與原有測試 PASS

- [ ] **Step 3: 寫最小實作**

把 `src/lib/markdown.ts` 整檔換成：

```ts
import { Marked, type Token } from 'marked';

// Markdown authors write root-relative paths like /blog/<slug>/cover.png.
// On GitHub Pages the site lives under a basePath, so those hrefs need the
// prefix. External URLs and anchors must stay untouched.
function prefixInternalHrefs(basePath: string) {
  return (token: Token): void => {
    if (token.type !== 'image' && token.type !== 'link') {
      return;
    }
    if (!token.href.startsWith('/')) {
      return;
    }
    token.href = `${basePath}${token.href}`;
  };
}

export function renderMarkdown(content: string, basePath = ''): string {
  const marked = new Marked({
    async: false,
    walkTokens: prefixInternalHrefs(basePath),
  });
  return marked.parse(content) as string;
}
```

- [ ] **Step 4: 執行測試，確認通過**

Run: `npx tsx --test src/lib/markdown.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 讓文章詳情頁傳入 basePath**

修改 `src/app/blog/[slug]/page.tsx`。在既有 import 區塊追加一行：

```ts
import { basePath } from '@/lib/basePath';
```

並把 `const html = renderMarkdown(post.content);` 改成：

```ts
const html = renderMarkdown(post.content, basePath);
```

- [ ] **Step 6: 執行完整測試與型別檢查**

Run: `npm test && npm run typecheck`
Expected: 全部 PASS，typecheck 無輸出

- [ ] **Step 7: Commit**

```bash
git add src/lib/markdown.ts src/lib/markdown.test.ts "src/app/blog/[slug]/page.tsx"
git commit -m "feat: prefix root-relative markdown hrefs with basePath

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Blog 資料來源改為 content/blog/*.md

這一步把 `blogPosts.ts` 的內部實作整個換掉，同時移除 `BlogPost.order`。型別改動與實作抽換必須在同一個 commit 完成，否則中間狀態無法編譯。

**Files:**
- Create: `content/blog/blog-test.md`
- Create: `public/blog/blog-test/cover.png`
- Modify: `src/lib/types.ts`（`BlogPost` 移除 `order`，`Project` 不動）
- Modify: `src/lib/blogPosts.ts`（整檔重寫，見 Step 5）
- Modify: `src/lib/blogPosts.test.ts`（整檔重寫，見 Step 3）
- Modify: `package.json` / `package-lock.json`（新增 `gray-matter`，由 npm 寫入）

**Interfaces:**
- Consumes: 無（不依賴 Task 1、2 的產出）
- Produces:
  - `parseBlogPostFile(fileName: string, raw: string): BlogPost` — 純函式，吃檔名與檔案原始字串
  - `sortBlogPosts(posts: BlogPost[]): BlogPost[]` — 回傳新陣列，不改動輸入
  - `readBlogPostsFromDir(dir: string): BlogPost[]` — 讀指定目錄下的 `.md` 並排序；目錄不存在時回傳 `[]`。抽出目錄參數是為了讓「目錄不存在 / 空目錄」這兩條 spec 要求的路徑可以被測試
  - `getAllBlogPosts(): Promise<BlogPost[]>` — 簽名不變，內部呼叫 `readBlogPostsFromDir(BLOG_DIR)`
  - `getBlogPostBySlug(slug: string): Promise<BlogPost | undefined>` — 簽名不變
  - `BlogPost` = `{ slug: string; title: string; date: string; summary: string; content: string }`
- 移除：`parseBlogPostRows`、`BLOG_POSTS_CSV_URL`

- [ ] **Step 1: 安裝 gray-matter**

Run: `npm install gray-matter`
Expected: `package.json` 的 `dependencies` 出現 `gray-matter`

- [ ] **Step 2: 建立種子文章與 placeholder 圖片**

建立 `content/blog/blog-test.md`：

```markdown
---
title: blog 測試資訊
date: 2026-09-07
summary: 從 Google Sheet 遷移到 Markdown 的第一篇測試文章
---

這是從 Google Sheet 遷移過來的第一篇測試文章，用來驗證 Markdown 內容管線。

![測試圖片](/blog/blog-test/cover.png)
```

再建立 placeholder 圖片（1x1 透明 PNG，只是用來驗證圖片路徑管線，之後可換成真圖）：

```bash
mkdir -p public/blog/blog-test
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' | base64 -d > public/blog/blog-test/cover.png
```

驗證：`ls -l public/blog/blog-test/cover.png` 應顯示 70 bytes。

- [ ] **Step 3: 寫失敗的測試**

把 `src/lib/blogPosts.test.ts` 整檔換成以下內容（舊的 `parseBlogPostRows` 測試全部刪除）：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseBlogPostFile, readBlogPostsFromDir, sortBlogPosts } from './blogPosts';
import type { BlogPost } from './types';

const VALID = [
  '---',
  'title: 測試標題',
  'date: 2026-09-07',
  'summary: 一句話摘要',
  '---',
  '',
  '內文第一段。',
  '',
].join('\n');

test('parseBlogPostFile reads frontmatter and takes the slug from the filename', () => {
  const post = parseBlogPostFile('blog-test.md', VALID);
  assert.equal(post.slug, 'blog-test');
  assert.equal(post.title, '測試標題');
  assert.equal(post.date, '2026-09-07');
  assert.equal(post.summary, '一句話摘要');
  assert.equal(post.content, '內文第一段。');
});

test('parseBlogPostFile normalises an unquoted YAML date to YYYY-MM-DD', () => {
  // js-yaml parses an unquoted 2026-09-07 into a Date object, not a string.
  const post = parseBlogPostFile('blog-test.md', VALID);
  assert.equal(typeof post.date, 'string');
  assert.equal(post.date, '2026-09-07');
});

test('parseBlogPostFile accepts a quoted date string too', () => {
  const raw = ['---', 'title: 測試標題', 'date: "2026-09-07"', '---', '', '內文。', ''].join('\n');
  assert.equal(parseBlogPostFile('blog-test.md', raw).date, '2026-09-07');
});

test('parseBlogPostFile defaults a missing summary to an empty string', () => {
  const raw = ['---', 'title: 測試標題', 'date: 2026-09-07', '---', '', '內文。', ''].join('\n');
  assert.equal(parseBlogPostFile('blog-test.md', raw).summary, '');
});

test('parseBlogPostFile throws when title is missing', () => {
  const raw = ['---', 'date: 2026-09-07', '---', '', '內文。', ''].join('\n');
  assert.throws(() => parseBlogPostFile('blog-test.md', raw), /blog-test\.md[\s\S]*title/);
});

test('parseBlogPostFile throws when date is missing', () => {
  const raw = ['---', 'title: 測試標題', '---', '', '內文。', ''].join('\n');
  assert.throws(() => parseBlogPostFile('blog-test.md', raw), /blog-test\.md[\s\S]*date/);
});

test('parseBlogPostFile throws when date is not YYYY-MM-DD', () => {
  const raw = ['---', 'title: 測試標題', 'date: "2026/09/07"', '---', '', '內文。', ''].join('\n');
  assert.throws(() => parseBlogPostFile('blog-test.md', raw), /blog-test\.md[\s\S]*date/);
});

test('parseBlogPostFile throws when the filename is not a valid slug', () => {
  assert.throws(() => parseBlogPostFile('測試文章.md', VALID), /測試文章\.md/);
  assert.throws(() => parseBlogPostFile('My_Post.md', VALID), /My_Post\.md/);
});

function post(slug: string, date: string): BlogPost {
  return { slug, title: slug, date, summary: '', content: '' };
}

test('sortBlogPosts orders newest date first', () => {
  const sorted = sortBlogPosts([post('old', '2026-01-01'), post('new', '2026-06-01')]);
  assert.deepEqual(sorted.map((p) => p.slug), ['new', 'old']);
});

test('sortBlogPosts breaks same-date ties by slug ascending', () => {
  const sorted = sortBlogPosts([post('bravo', '2026-01-01'), post('alpha', '2026-01-01')]);
  assert.deepEqual(sorted.map((p) => p.slug), ['alpha', 'bravo']);
});

test('sortBlogPosts does not mutate its input', () => {
  const input = [post('old', '2026-01-01'), post('new', '2026-06-01')];
  sortBlogPosts(input);
  assert.deepEqual(input.map((p) => p.slug), ['old', 'new']);
});

test('readBlogPostsFromDir returns an empty array when the directory does not exist', () => {
  const missing = path.join(os.tmpdir(), 'blog-posts-does-not-exist-12345');
  assert.deepEqual(readBlogPostsFromDir(missing), []);
});

test('readBlogPostsFromDir returns an empty array when the directory holds no markdown', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-empty-'));
  try {
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a post');
    assert.deepEqual(readBlogPostsFromDir(dir), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readBlogPostsFromDir reads markdown files and returns them sorted', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-posts-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'older.md'),
      ['---', 'title: 舊文', 'date: 2026-01-01', '---', '', '舊內文。', ''].join('\n'),
    );
    fs.writeFileSync(
      path.join(dir, 'newer.md'),
      ['---', 'title: 新文', 'date: 2026-06-01', '---', '', '新內文。', ''].join('\n'),
    );
    assert.deepEqual(readBlogPostsFromDir(dir).map((p) => p.slug), ['newer', 'older']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('readBlogPostsFromDir propagates a parse error so the build fails', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-bad-'));
  try {
    fs.writeFileSync(path.join(dir, 'broken.md'), ['---', 'date: 2026-01-01', '---', '', '沒有標題。', ''].join('\n'));
    assert.throws(() => readBlogPostsFromDir(dir), /broken\.md[\s\S]*title/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 4: 執行測試，確認失敗**

Run: `npx tsx --test src/lib/blogPosts.test.ts`
Expected: FAIL，錯誤訊息顯示 `parseBlogPostFile` / `sortBlogPosts` / `readBlogPostsFromDir` 不存在

- [ ] **Step 5: 寫實作**

先修改 `src/lib/types.ts`，把 `BlogPost` 換成以下內容（`Project` 介面保持原樣不動）：

```ts
export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  summary: string;
  content: string;
}
```

再把 `src/lib/blogPosts.ts` 整檔換成：

```ts
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { BlogPost } from './types';

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');
const SLUG_PATTERN = /^[a-z0-9-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// YAML parses an unquoted 2026-09-07 into a Date at UTC midnight, while a
// quoted "2026-09-07" stays a string. Normalise both back to YYYY-MM-DD.
function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return typeof value === 'string' ? value.trim() : '';
}

export function parseBlogPostFile(fileName: string, raw: string): BlogPost {
  const slug = fileName.replace(/\.md$/, '');
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid blog post filename "${fileName}": the slug must be lowercase letters, digits and hyphens only`,
    );
  }

  const { data, content } = matter(raw);

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  if (!title) {
    throw new Error(`Blog post "${fileName}" is missing the required frontmatter field "title"`);
  }

  const date = normalizeDate(data.date);
  if (!DATE_PATTERN.test(date)) {
    throw new Error(
      `Blog post "${fileName}" has an invalid frontmatter "date": expected YYYY-MM-DD, got "${date || '(missing)'}"`,
    );
  }

  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';

  return { slug, title, date, summary, content: content.trim() };
}

export function sortBlogPosts(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    if (a.slug === b.slug) {
      return 0;
    }
    return a.slug < b.slug ? -1 : 1;
  });
}

export function readBlogPostsFromDir(dir: string): BlogPost[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const posts = fs
    .readdirSync(dir)
    .filter((fileName) => fileName.endsWith('.md'))
    .map((fileName) => parseBlogPostFile(fileName, fs.readFileSync(path.join(dir, fileName), 'utf8')));

  return sortBlogPosts(posts);
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  return readBlogPostsFromDir(BLOG_DIR);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getAllBlogPosts();
  return posts.find((post) => post.slug === slug);
}
```

- [ ] **Step 6: 執行測試，確認通過**

Run: `npm test`
Expected: 全部 PASS（含 Task 1、2 的測試與 Projects 的既有測試）

- [ ] **Step 7: 型別檢查與本機預覽**

Run: `npm run typecheck`
Expected: 無輸出

Run: `npm run dev`，開 `http://localhost:3000/blog`
Expected: 列表出現「blog 測試資訊」；點進去看得到內文，且瀏覽器 devtools 的 Network 頁籤中 `cover.png` 回應 200（1x1 透明 PNG 肉眼看不見是正常的）

確認後按 Ctrl+C 結束 dev server。

- [ ] **Step 8: Commit**

```bash
git add content/blog/blog-test.md public/blog/blog-test/cover.png src/lib/blogPosts.ts src/lib/blogPosts.test.ts src/lib/types.ts package.json package-lock.json
git commit -m "feat: read blog posts from content/blog markdown files

Replaces the Google Sheet CSV source for blog posts. Slugs come from
filenames, metadata from frontmatter, and bad data now fails the build
instead of being silently skipped. Projects still use the Sheet.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: 正式建置驗證與文件更新

前三個 Task 的單元測試都跑在 `NODE_ENV != production`，也就是 basePath 為空字串的情況。真正會壞掉的是正式建置——這個 Task 用真實的 `npm run build` 產物驗證圖片路徑，並把兩套內容來源並存的事實寫進 README。

**Files:**
- Modify: `README.md`（`## Content updates (Google Sheets)` 整段重寫，見 Step 3）

**Interfaces:**
- Consumes: Task 1 的 `resolveBasePath`、Task 2 的 basePath 改寫、Task 3 的 `content/blog/blog-test.md`
- Produces: 無程式介面

- [ ] **Step 1: 執行正式建置**

Run: `npm run build`
Expected: 成功，且 `out/blog/blog-test.html` 存在

- [ ] **Step 2: 驗證產物的圖片路徑真的帶了 basePath**

```bash
grep -o 'src="[^"]*cover.png"' out/blog/blog-test.html
ls -l out/blog/blog-test/cover.png
ls out/project
```

Expected:
- 第一行輸出 `src="/PersionalWebSite/blog/blog-test/cover.png"`。**若沒有 `/PersionalWebSite` 前綴，代表 Task 2 沒生效，必須回頭修，不可繼續。**
- 第二行顯示圖片已被複製進 `out/`，70 bytes
- 第三行顯示 Projects 仍正常產生頁面（至少有 `index.html`）

- [ ] **Step 3: 更新 README**

把 `README.md` 中 `## Content updates (Google Sheets)` 這一整個章節（從該標題到 `## Deploying` 之前）刪除，換成下列內容。注意內層的 Markdown 範例請照抄，包含它自己的三個反引號圍籬：

````markdown
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

- **網址 slug 取自檔名**（`my-post.md` → `/blog/my-post`），檔名只能用小寫英文、數字與連字號。
- `title` 與 `date` 必填，`date` 必須是 `YYYY-MM-DD`。缺欄位或格式錯誤會讓建置**直接失敗**，錯誤訊息會指出是哪個檔案。
- `summary` 選填，留空則列表頁不顯示描述。
- **內文不要再寫 `# 一級標題`**，詳情頁已經用 `title` 產生 `<h1>`。
- 排序為日期新到舊，同一天則依檔名排序。
- 圖片用 `/blog/<slug>/xxx.png` 這種根路徑寫法即可，正式站的 `/PersionalWebSite` 前綴會在建置時自動補上。

本機預覽：`npm run dev` 後開 http://localhost:3000/blog

### Projects（仍在 Google Sheet）

Project 內容仍在這張 Google Sheet 編輯：
https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4

- `Projects` 分頁欄位：slug, title, summary, description, tech_stack, image_url, link_url, order
- 該 Sheet 的 `Blog Posts` 分頁已停用，Blog 內容改由上述 Markdown 檔提供。

Sheet 內容在**建置時**抓取，不是即時的。改完 Sheet 後需重新部署才會生效。
````

- [ ] **Step 4: 最終驗證**

Run: `npm test && npm run typecheck && npm run build`
Expected: 三個指令全部成功

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document the markdown blog workflow in README

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## 完成後的狀態

- Blog 文章來自 `content/blog/*.md`：有版本控管、可本機預覽、圖片放得進 `public/blog/<slug>/`。
- Google CSV 端點掛掉不再影響 Blog（Projects 仍受影響）。
- 部署流程不變：push 之後仍需手動到 GitHub Actions 執行 **Deploy to GitHub Pages**。
- 階段 2（登入後台 CRUD）尚未開始，背景與限制見 spec 第 2 節。
