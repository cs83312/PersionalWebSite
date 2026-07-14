# KFxNet Personal Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy the KFxNet static personal website (Next.js, static export) with Home / My Story / Project / Blog pages, Project and Blog content sourced from Google Sheets at build time, and manual GitHub Actions deployment to GitHub Pages.

**Architecture:** Next.js 14 App Router with `output: 'export'`. Build-time data layer fetches two Google Sheet tabs (Projects, Blog Posts) as CSV via the `gviz/tq` endpoint, parses/validates rows, and feeds `generateStaticParams` + page components to produce fully static HTML. A small React Context provides client-side zh/en dictionary switching for Home and My Story only. Deployment is a manually-triggered GitHub Actions workflow publishing to GitHub Pages.

**Tech Stack:** Next.js ^14.2.0 (App Router, TypeScript), React ^18.3.0, papaparse (CSV parsing), marked (Markdown rendering), tsx + Node's built-in `node:test` for lib unit tests, GitHub Actions (`actions/upload-pages-artifact`, `actions/deploy-pages`), plain CSS Modules (no CSS framework).

## Global Constraints

- Node.js >= 20.11 LTS; package manager: npm
- Next.js config: `output: 'export'`; production `basePath`/`assetPrefix` = `/PersionalWebSite` (GitHub Pages project site at `https://cs83312.github.io/PersionalWebSite/`); `images.unoptimized: true`
- Google Sheet ID `1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4`; tabs are named exactly `Projects` and `Blog Posts`; fetched via `https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4/gviz/tq?tqx=out:csv&sheet=<TabName>`
- Required Projects columns: `slug, title, summary, description, tech_stack, image_url, link_url, order` (`slug`/`title` required, rest optional)
- Required Blog Posts columns: `slug, title, date, summary, content, order` (`slug`/`title` required, rest optional)
- No automated UI/page test suite (per spec section 9): pages are verified via `npm run build` success + manual browser QA. Only pure functions in `src/lib/` get automated tests, run via Node's built-in test runner (`node:test`) through `tsx`
- Deployment trigger is manual only (`workflow_dispatch`) — no scheduled rebuilds
- Visual theme: dark background `#0d1117`, text `#e6edf3`, border `#30363d`, accent `#f0883e`, monospace touches on brand/headings
- Bilingual (zh/en) scope: Home + My Story pages and nav labels only, via client-side dictionary switch (no URL change). Project/Blog content stays Chinese-only.

---

## File Structure

```
package.json
next.config.js
tsconfig.json
next-env.d.ts
.gitignore                              (extend existing)
.github/workflows/deploy.yml
README.md

src/
  app/
    layout.tsx                          — root layout, wraps LanguageProvider + NavBar
    globals.css                         — CSS variables, base resets, dark theme
    page.tsx / page.module.css          — Home ("/")
    story/page.tsx / page.module.css    — My Story ("/story")
    project/page.tsx / page.module.css  — Project list ("/project")
    project/[slug]/page.tsx / page.module.css — Project detail
    blog/page.tsx / page.module.css     — Blog list ("/blog")
    blog/[slug]/page.tsx / page.module.css — Blog post detail
    not-found.tsx / not-found.module.css — global 404

  components/
    NavBar.tsx / NavBar.module.css      — top nav: logo left, links centered, lang switch right
    LanguageSwitcher.tsx / LanguageSwitcher.module.css
    Card.tsx / Card.module.css          — shared card used by Project & Blog lists

  context/
    LanguageContext.tsx                 — zh/en state + localStorage persistence

  lib/
    types.ts                            — Project, BlogPost interfaces
    sheets.ts / sheets.test.ts          — CSV fetch + parse (pure parse is tested)
    projects.ts / projects.test.ts      — Projects data access + validation/sort
    blogPosts.ts / blogPosts.test.ts    — Blog Posts data access + validation/sort
    markdown.ts / markdown.test.ts      — Markdown → HTML rendering
    dictionary.ts                       — zh/en text dictionary
```

Each `lib/` module is a pure-function boundary consumed by exactly one App Router route; `components/` and `context/` are shared UI/state consumed across routes.

---

### Task 1: Project scaffold & static export config

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.js`
- Create: `.gitignore` (modify existing to add Next.js entries)
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`
- Create: `src/app/page.tsx`

**Interfaces:**
- Produces: working `npm run build` producing a static `out/` directory; `npm run typecheck` command; CSS variables `--color-bg`, `--color-text`, `--color-border`, `--color-accent` available globally via `globals.css`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "kfxnet-personal-website",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^14.2.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "papaparse": "^5.4.1",
    "marked": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@types/papaparse": "^5.3.14",
    "tsx": "^4.7.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 4: Create `next.config.js`**

```js
/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';
const repoBasePath = '/PersionalWebSite';

const nextConfig = {
  output: 'export',
  basePath: isProd ? repoBasePath : '',
  assetPrefix: isProd ? `${repoBasePath}/` : '',
  images: {
    unoptimized: true,
  },
};

module.exports = nextConfig;
```

- [ ] **Step 5: Update `.gitignore`**

```
.superpowers/
node_modules/
.next/
out/
*.tsbuildinfo
next-env.d.ts
```

- [ ] **Step 6: Create `src/app/globals.css`**

```css
:root {
  --color-bg: #0d1117;
  --color-text: #e6edf3;
  --color-border: #30363d;
  --color-accent: #f0883e;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--color-bg);
  color: var(--color-text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

main {
  max-width: 960px;
  margin: 0 auto;
  padding: 32px 24px;
}

a {
  color: inherit;
}
```

- [ ] **Step 7: Create `src/app/layout.tsx`** (minimal placeholder — NavBar/LanguageProvider added in Task 6)

```tsx
import './globals.css';

export const metadata = {
  title: 'KFxNet',
  description: '許展發（KLIF）的個人技術網站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 8: Create `src/app/page.tsx`** (minimal placeholder — real Home content added in Task 7)

```tsx
export default function HomePage() {
  return <p>KFxNet — coming soon</p>;
}
```

- [ ] **Step 9: Install dependencies**

Run: `npm install`
Expected: installs succeed, `node_modules/` and `package-lock.json` created

- [ ] **Step 10: Verify build**

Run: `npm run build`
Expected: build succeeds, `out/index.html` exists

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json next-env.d.ts next.config.js .gitignore src/app/layout.tsx src/app/globals.css src/app/page.tsx
git commit -m "chore: scaffold Next.js static-export project"
```

---

### Task 2: CSV fetch/parse utility

**Files:**
- Create: `src/lib/sheets.ts`
- Create: `src/lib/sheets.test.ts`
- Modify: `package.json` (add `test` script)

**Interfaces:**
- Consumes: nothing (first lib module)
- Produces: `parseCsvRows(csvText: string): Record<string, string>[]` and `fetchCsvRows(url: string): Promise<Record<string, string>[]>` — used by Tasks 3 and 4

- [ ] **Step 1: Write the failing tests**

Create `src/lib/sheets.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvRows } from './sheets';

test('parseCsvRows trims header and value whitespace', () => {
  const csv = 'slug ,title\n hui-hui , 恢恢巡路系統 \n';
  const rows = parseCsvRows(csv);
  assert.deepEqual(rows, [{ slug: 'hui-hui', title: '恢恢巡路系統' }]);
});

test('parseCsvRows preserves multi-line quoted fields', () => {
  const csv = 'slug,description\nhui-hui,"line one\nline two"\n';
  const rows = parseCsvRows(csv);
  assert.equal(rows[0].description, 'line one\nline two');
});

test('parseCsvRows skips empty lines', () => {
  const csv = 'slug,title\nhui-hui,Test\n\n';
  const rows = parseCsvRows(csv);
  assert.equal(rows.length, 1);
});
```

- [ ] **Step 2: Add the `test` script and run to verify it fails**

Update `package.json` `"scripts"` block (note: no `start` script — Task 1 removed it because `next start` is incompatible with `output: 'export'`; do not reintroduce it):

```json
{
  "dev": "next dev",
  "build": "next build",
  "typecheck": "tsc --noEmit",
  "test": "tsx --test src/lib/sheets.test.ts"
}
```

Run: `npm test`
Expected: FAIL — `src/lib/sheets.ts` does not exist / `parseCsvRows` not defined

- [ ] **Step 3: Implement `src/lib/sheets.ts`**

```ts
import Papa from 'papaparse';

export function parseCsvRows(csvText: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data.map((row) => {
    const trimmedRow: Record<string, string> = {};
    for (const [key, value] of Object.entries(row)) {
      trimmedRow[key.trim()] = typeof value === 'string' ? value.trim() : value;
    }
    return trimmedRow;
  });
}

export async function fetchCsvRows(url: string): Promise<Record<string, string>[]> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet data from ${url}: ${response.status} ${response.statusText}`);
  }
  const csvText = await response.text();
  return parseCsvRows(csvText);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: 3 tests pass

- [ ] **Step 5: Commit**

```bash
git add package.json src/lib/sheets.ts src/lib/sheets.test.ts
git commit -m "feat: add CSV fetch/parse utility for Google Sheets data"
```

---

### Task 3: Project data layer

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/projects.ts`
- Create: `src/lib/projects.test.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `fetchCsvRows(url: string): Promise<Record<string, string>[]>` from Task 2
- Produces: `Project` type; `parseProjectRows(rows: Record<string, string>[]): Project[]`; `getAllProjects(): Promise<Project[]>`; `getProjectBySlug(slug: string): Promise<Project | undefined>` — used by Tasks 9 and 10

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
export interface Project {
  slug: string;
  title: string;
  summary: string;
  description: string;
  techStack: string;
  imageUrl: string;
  linkUrl: string;
  order: number;
}

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  summary: string;
  content: string;
  order: number;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/lib/projects.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProjectRows } from './projects';

function row(overrides: Partial<Record<string, string>> = {}) {
  return {
    slug: '',
    title: '',
    summary: '',
    description: '',
    tech_stack: '',
    image_url: '',
    link_url: '',
    order: '',
    ...overrides,
  };
}

test('parseProjectRows filters rows missing slug or title', () => {
  const rows = [
    row({ slug: 'a', title: 'A', order: '2' }),
    row({ slug: '', title: 'No slug', order: '1' }),
    row({ slug: 'b', title: '', order: '0' }),
  ];
  const projects = parseProjectRows(rows);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].slug, 'a');
});

test('parseProjectRows sorts by numeric order ascending', () => {
  const rows = [
    row({ slug: 'second', title: 'Second', order: '2' }),
    row({ slug: 'first', title: 'First', order: '1' }),
  ];
  const projects = parseProjectRows(rows);
  assert.deepEqual(projects.map((p) => p.slug), ['first', 'second']);
});

test('parseProjectRows falls back to row index order when order is missing', () => {
  const rows = [row({ slug: 'a', title: 'A' }), row({ slug: 'b', title: 'B' })];
  const projects = parseProjectRows(rows);
  assert.deepEqual(projects.map((p) => p.slug), ['a', 'b']);
});
```

- [ ] **Step 3: Update `package.json` test script and run to verify failure**

```json
"test": "tsx --test src/lib/sheets.test.ts src/lib/projects.test.ts"
```

Run: `npm test`
Expected: FAIL — `src/lib/projects.ts` does not exist

- [ ] **Step 4: Implement `src/lib/projects.ts`**

```ts
import { fetchCsvRows } from './sheets';
import type { Project } from './types';

const PROJECTS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4/gviz/tq?tqx=out:csv&sheet=Projects';

export function parseProjectRows(rows: Record<string, string>[]): Project[] {
  const projects: Project[] = [];

  rows.forEach((row, index) => {
    if (!row.slug || !row.title) {
      console.warn(`Skipping project row ${index + 2}: missing required "slug" or "title"`);
      return;
    }

    projects.push({
      slug: row.slug,
      title: row.title,
      summary: row.summary ?? '',
      description: row.description ?? '',
      techStack: row.tech_stack ?? '',
      imageUrl: row.image_url ?? '',
      linkUrl: row.link_url ?? '',
      order: row.order && !Number.isNaN(Number(row.order)) ? Number(row.order) : index,
    });
  });

  return projects.sort((a, b) => a.order - b.order);
}

export async function getAllProjects(): Promise<Project[]> {
  const rows = await fetchCsvRows(PROJECTS_CSV_URL);
  return parseProjectRows(rows);
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  const projects = await getAllProjects();
  return projects.find((project) => project.slug === slug);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: 6 tests pass (3 from Task 2 + 3 new)

- [ ] **Step 6: Commit**

```bash
git add package.json src/lib/types.ts src/lib/projects.ts src/lib/projects.test.ts
git commit -m "feat: add Projects data layer with validation and sorting"
```

---

### Task 4: Blog data layer + Markdown renderer

**Files:**
- Modify: `src/lib/types.ts` (already has `BlogPost` from Task 3, no change needed)
- Create: `src/lib/blogPosts.ts`
- Create: `src/lib/blogPosts.test.ts`
- Create: `src/lib/markdown.ts`
- Create: `src/lib/markdown.test.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Consumes: `fetchCsvRows` from Task 2; `BlogPost` type from Task 3
- Produces: `parseBlogPostRows(rows: Record<string, string>[]): BlogPost[]`; `getAllBlogPosts(): Promise<BlogPost[]>`; `getBlogPostBySlug(slug: string): Promise<BlogPost | undefined>`; `renderMarkdown(content: string): string` — used by Task 11

- [ ] **Step 1: Write the failing tests for blog posts**

Create `src/lib/blogPosts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlogPostRows } from './blogPosts';

function row(overrides: Partial<Record<string, string>> = {}) {
  return { slug: '', title: '', date: '', summary: '', content: '', order: '', ...overrides };
}

test('parseBlogPostRows filters rows missing slug or title', () => {
  const rows = [row({ slug: 'a', title: 'A', date: '2026-01-01' }), row({ slug: '', title: 'No slug' })];
  const posts = parseBlogPostRows(rows);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].slug, 'a');
});

test('parseBlogPostRows sorts newest date first', () => {
  const rows = [
    row({ slug: 'old', title: 'Old', date: '2026-01-01' }),
    row({ slug: 'new', title: 'New', date: '2026-06-01' }),
  ];
  const posts = parseBlogPostRows(rows);
  assert.deepEqual(posts.map((p) => p.slug), ['new', 'old']);
});

test('parseBlogPostRows uses order as tiebreaker for same date', () => {
  const rows = [
    row({ slug: 'second', title: 'Second', date: '2026-01-01', order: '2' }),
    row({ slug: 'first', title: 'First', date: '2026-01-01', order: '1' }),
  ];
  const posts = parseBlogPostRows(rows);
  assert.deepEqual(posts.map((p) => p.slug), ['first', 'second']);
});
```

- [ ] **Step 2: Write the failing tests for markdown rendering**

Create `src/lib/markdown.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from './markdown';

test('renderMarkdown converts heading, bold, list, and link', () => {
  const html = renderMarkdown('# Title\n\n**bold** text\n\n- item one\n- item two\n\n[link](https://example.com)');
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<li>item one<\/li>/);
  assert.match(html, /<a href="https:\/\/example.com">link<\/a>/);
});
```

- [ ] **Step 3: Update `package.json` test script and run to verify failure**

```json
"test": "tsx --test src/lib/sheets.test.ts src/lib/projects.test.ts src/lib/blogPosts.test.ts src/lib/markdown.test.ts"
```

Run: `npm test`
Expected: FAIL — `src/lib/blogPosts.ts` and `src/lib/markdown.ts` do not exist

- [ ] **Step 4: Implement `src/lib/blogPosts.ts`**

```ts
import { fetchCsvRows } from './sheets';
import type { BlogPost } from './types';

const BLOG_POSTS_CSV_URL =
  'https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4/gviz/tq?tqx=out:csv&sheet=Blog%20Posts';

export function parseBlogPostRows(rows: Record<string, string>[]): BlogPost[] {
  const posts: BlogPost[] = [];

  rows.forEach((row, index) => {
    if (!row.slug || !row.title) {
      console.warn(`Skipping blog post row ${index + 2}: missing required "slug" or "title"`);
      return;
    }

    posts.push({
      slug: row.slug,
      title: row.title,
      date: row.date ?? '',
      summary: row.summary ?? '',
      content: row.content ?? '',
      order: row.order && !Number.isNaN(Number(row.order)) ? Number(row.order) : index,
    });
  });

  return posts.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    return a.order - b.order;
  });
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  const rows = await fetchCsvRows(BLOG_POSTS_CSV_URL);
  return parseBlogPostRows(rows);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getAllBlogPosts();
  return posts.find((post) => post.slug === slug);
}
```

- [ ] **Step 5: Implement `src/lib/markdown.ts`**

```ts
import { marked } from 'marked';

export function renderMarkdown(content: string): string {
  return marked.parse(content, { async: false }) as string;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test`
Expected: 10 tests pass (6 from Tasks 2–3 + 4 new)

- [ ] **Step 7: Commit**

```bash
git add package.json src/lib/blogPosts.ts src/lib/blogPosts.test.ts src/lib/markdown.ts src/lib/markdown.test.ts
git commit -m "feat: add Blog Posts data layer and Markdown renderer"
```

---

### Task 5: i18n dictionary & language context

**Files:**
- Create: `src/lib/dictionary.ts`
- Create: `src/context/LanguageContext.tsx`

**Interfaces:**
- Consumes: nothing
- Produces: `type Language = 'zh' | 'en'`; `dictionary: { zh: {...}, en: {...} }`; `LanguageProvider` component; `useLanguage(): { language: Language; setLanguage: (l: Language) => void; t: typeof dictionary.zh }` — used by Tasks 6, 7, 8

- [ ] **Step 1: Create `src/lib/dictionary.ts`**

```ts
export type Language = 'zh' | 'en';

export const dictionary = {
  zh: {
    nav: { home: 'Home', story: 'My Story', project: 'Project', blog: 'Blog' },
    home: {
      brand: 'KFxNet',
      tagline: '許展發（KLIF）的個人技術網站',
      intro: '我是許展發（KLIF），開發過 Android、Spring Boot、Spring AI for RAG。',
      cta: { story: '看看我的故事', project: '查看專案作品', blog: '閱讀部落格' },
    },
    story: {
      title: 'My Story',
      intro: '我是許展發（KLIF），開發過 Android、Spring Boot、Spring AI for RAG。',
      body: '從 2023 年開始踏入 AI 領域，這段旅程的完整故事，我正在慢慢寫下來，敬請期待更新。',
    },
  },
  en: {
    nav: { home: 'Home', story: 'My Story', project: 'Project', blog: 'Blog' },
    home: {
      brand: 'KFxNet',
      tagline: 'Personal tech site of Chang-Fa Hsu (KLIF)',
      intro:
        "I'm Chang-Fa Hsu (KLIF), a developer with experience in Android, Spring Boot, and Spring AI for RAG.",
      cta: { story: 'Read my story', project: 'View projects', blog: 'Read the blog' },
    },
    story: {
      title: 'My Story',
      intro:
        "I'm Chang-Fa Hsu (KLIF), a developer with experience in Android, Spring Boot, and Spring AI for RAG.",
      body: 'I started my journey into AI in 2023. The full story is still being written — more to come soon.',
    },
  },
} as const;
```

- [ ] **Step 2: Create `src/context/LanguageContext.tsx`**

```tsx
'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { dictionary, type Language } from '@/lib/dictionary';

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: typeof dictionary.zh;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

const STORAGE_KEY = 'kfxnet-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('zh');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') {
      setLanguageState(stored);
    }
  }, []);

  function setLanguage(next: Language) {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t: dictionary[language] }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
```

- [ ] **Step 3: Type-check**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/dictionary.ts src/context/LanguageContext.tsx
git commit -m "feat: add zh/en dictionary and language context"
```

---

### Task 6: NavBar, LanguageSwitcher, and root layout wiring

**Files:**
- Create: `src/components/LanguageSwitcher.tsx`
- Create: `src/components/LanguageSwitcher.module.css`
- Create: `src/components/NavBar.tsx`
- Create: `src/components/NavBar.module.css`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `useLanguage` from Task 5
- Produces: `<NavBar />` component rendered globally — used by Task 1's layout (modified here)

- [ ] **Step 1: Create `src/components/LanguageSwitcher.module.css`**

```css
.switcher {
  display: flex;
  gap: 8px;
}

.switcher button {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 12px;
  cursor: pointer;
}

.inactive {
  color: #8b949e;
}

.active {
  color: var(--color-accent);
  border-color: var(--color-accent);
}
```

- [ ] **Step 2: Create `src/components/LanguageSwitcher.tsx`**

```tsx
'use client';

import { useLanguage } from '@/context/LanguageContext';
import styles from './LanguageSwitcher.module.css';

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className={styles.switcher}>
      <button
        type="button"
        className={language === 'zh' ? styles.active : styles.inactive}
        onClick={() => setLanguage('zh')}
      >
        中
      </button>
      <button
        type="button"
        className={language === 'en' ? styles.active : styles.inactive}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/NavBar.module.css`**

```css
.header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  grid-template-areas: 'logo nav actions';
  align-items: center;
  padding: 16px 24px;
  border-bottom: 1px solid var(--color-border);
  background-color: var(--color-bg);
}

.logo {
  grid-area: logo;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-weight: 700;
  color: var(--color-text);
  text-decoration: none;
  justify-self: start;
}

.nav {
  grid-area: nav;
  display: flex;
  gap: 24px;
  justify-self: center;
}

.nav a {
  color: var(--color-text);
  text-decoration: none;
  font-size: 14px;
}

.nav a:hover {
  color: var(--color-accent);
}

.actions {
  grid-area: actions;
  justify-self: end;
}

@media (max-width: 640px) {
  .header {
    grid-template-columns: 1fr 1fr;
    grid-template-areas:
      'logo actions'
      'nav nav';
    row-gap: 12px;
  }

  .nav {
    justify-content: center;
    flex-wrap: wrap;
  }
}
```

- [ ] **Step 4: Create `src/components/NavBar.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/context/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';
import styles from './NavBar.module.css';

export function NavBar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const showLanguageSwitcher = pathname === '/' || pathname === '/story';

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.logo}>
        KFxNet
      </Link>
      <nav className={styles.nav}>
        <Link href="/">{t.nav.home}</Link>
        <Link href="/story">{t.nav.story}</Link>
        <Link href="/project">{t.nav.project}</Link>
        <Link href="/blog">{t.nav.blog}</Link>
      </nav>
      <div className={styles.actions}>{showLanguageSwitcher && <LanguageSwitcher />}</div>
    </header>
  );
}
```

- [ ] **Step 5: Modify `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { LanguageProvider } from '@/context/LanguageContext';
import { NavBar } from '@/components/NavBar';
import './globals.css';

export const metadata: Metadata = {
  title: 'KFxNet',
  description: '許展發（KLIF）的個人技術網站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>
        <LanguageProvider>
          <NavBar />
          <main>{children}</main>
        </LanguageProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 7: Manual check**

Run: `npm run dev`, open `http://localhost:3000/`
Expected: nav bar shows logo left, Home/My Story/Project/Blog centered, language switcher visible top-right (page is `/`)

- [ ] **Step 8: Commit**

```bash
git add src/components/LanguageSwitcher.tsx src/components/LanguageSwitcher.module.css src/components/NavBar.tsx src/components/NavBar.module.css src/app/layout.tsx
git commit -m "feat: add NavBar with centered links and language switcher"
```

---

### Task 7: Home page

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/page.module.css`

**Interfaces:**
- Consumes: `useLanguage` from Task 5
- Produces: real Home page content

- [ ] **Step 1: Create `src/app/page.module.css`**

```css
.hero {
  text-align: center;
  padding: 80px 0;
}

.brand {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 48px;
  margin: 0 0 8px;
}

.tagline {
  color: #8b949e;
  margin: 0 0 24px;
}

.intro {
  max-width: 560px;
  margin: 0 auto 32px;
  line-height: 1.6;
}

.links {
  display: flex;
  gap: 16px;
  justify-content: center;
  flex-wrap: wrap;
}

.links a {
  border: 1px solid var(--color-accent);
  color: var(--color-accent);
  padding: 10px 20px;
  border-radius: 6px;
  text-decoration: none;
}

.links a:hover {
  background-color: var(--color-accent);
  color: var(--color-bg);
}
```

- [ ] **Step 2: Modify `src/app/page.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { useLanguage } from '@/context/LanguageContext';
import styles from './page.module.css';

export default function HomePage() {
  const { t } = useLanguage();

  return (
    <section className={styles.hero}>
      <h1 className={styles.brand}>{t.home.brand}</h1>
      <p className={styles.tagline}>{t.home.tagline}</p>
      <p className={styles.intro}>{t.home.intro}</p>
      <div className={styles.links}>
        <Link href="/story">{t.home.cta.story}</Link>
        <Link href="/project">{t.home.cta.project}</Link>
        <Link href="/blog">{t.home.cta.blog}</Link>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify build and manual check**

Run: `npm run build`
Expected: build succeeds

Run: `npm run dev`, open `http://localhost:3000/`
Expected: brand, tagline, intro text, and three CTA links render; clicking the language switcher changes all text

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/page.module.css
git commit -m "feat: implement Home page content"
```

---

### Task 8: My Story page

**Files:**
- Create: `src/app/story/page.tsx`
- Create: `src/app/story/page.module.css`

**Interfaces:**
- Consumes: `useLanguage` from Task 5

- [ ] **Step 1: Create `src/app/story/page.module.css`**

```css
.article {
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.7;
}

.article h1 {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  margin-bottom: 24px;
}
```

- [ ] **Step 2: Create `src/app/story/page.tsx`**

```tsx
'use client';

import { useLanguage } from '@/context/LanguageContext';
import styles from './page.module.css';

export default function StoryPage() {
  const { t } = useLanguage();

  return (
    <article className={styles.article}>
      <h1>{t.story.title}</h1>
      <p>{t.story.intro}</p>
      <p>{t.story.body}</p>
    </article>
  );
}
```

- [ ] **Step 3: Verify build and manual check**

Run: `npm run build`
Expected: build succeeds, `out/story/index.html` exists

Run: `npm run dev`, open `http://localhost:3000/story`
Expected: title, intro, and story body render; language switcher visible and toggles text

- [ ] **Step 4: Commit**

```bash
git add src/app/story/page.tsx src/app/story/page.module.css
git commit -m "feat: implement My Story page"
```

---

### Task 9: Card component & Project list page

**Files:**
- Create: `src/components/Card.tsx`
- Create: `src/components/Card.module.css`
- Create: `src/app/project/page.tsx`
- Create: `src/app/project/page.module.css`

**Interfaces:**
- Consumes: `getAllProjects` from Task 3
- Produces: `Card` component with props `{ href: string; title: string; description?: string; meta?: string }` — used by Tasks 10 (indirectly via list) and 11

- [ ] **Step 1: Create `src/components/Card.module.css`**

```css
.card {
  display: block;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 20px;
  text-decoration: none;
  color: var(--color-text);
  background-color: #161b22;
  transition: border-color 0.15s ease;
}

.card:hover {
  border-color: var(--color-accent);
}

.title {
  margin: 0 0 8px;
  font-size: 16px;
}

.meta {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--color-accent);
}

.description {
  margin: 0;
  font-size: 14px;
  color: #8b949e;
}
```

- [ ] **Step 2: Create `src/components/Card.tsx`**

```tsx
import Link from 'next/link';
import styles from './Card.module.css';

export interface CardProps {
  href: string;
  title: string;
  description?: string;
  meta?: string;
}

export function Card({ href, title, description, meta }: CardProps) {
  return (
    <Link href={href} className={styles.card}>
      <h3 className={styles.title}>{title}</h3>
      {meta && <p className={styles.meta}>{meta}</p>}
      {description && <p className={styles.description}>{description}</p>}
    </Link>
  );
}
```

- [ ] **Step 3: Create `src/app/project/page.module.css`**

```css
.title {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  margin-bottom: 24px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}
```

- [ ] **Step 4: Create `src/app/project/page.tsx`**

```tsx
import { getAllProjects } from '@/lib/projects';
import { Card } from '@/components/Card';
import styles from './page.module.css';

export default async function ProjectPage() {
  const projects = await getAllProjects();

  return (
    <section>
      <h1 className={styles.title}>Project</h1>
      <div className={styles.grid}>
        {projects.map((project) => (
          <Card
            key={project.slug}
            href={`/project/${project.slug}`}
            title={project.title}
            description={project.summary}
            meta={project.techStack}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Verify build and manual check**

Run: `npm run build`
Expected: build succeeds, `out/project/index.html` exists

Run: `npm run dev`, open `http://localhost:3000/project`
Expected: at least the `hui-hui` project card renders with title and summary

- [ ] **Step 6: Commit**

```bash
git add src/components/Card.tsx src/components/Card.module.css src/app/project/page.tsx src/app/project/page.module.css
git commit -m "feat: add Card component and Project list page"
```

---

### Task 10: Project detail page

**Files:**
- Create: `src/app/project/[slug]/page.tsx`
- Create: `src/app/project/[slug]/page.module.css`

**Interfaces:**
- Consumes: `getAllProjects`, `getProjectBySlug` from Task 3

- [ ] **Step 1: Create `src/app/project/[slug]/page.module.css`**

```css
.article {
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.7;
}

.techStack {
  color: var(--color-accent);
  font-size: 13px;
  margin-bottom: 16px;
}

.image {
  max-width: 100%;
  border-radius: 8px;
  margin-bottom: 16px;
}

.link {
  display: inline-block;
  margin-top: 16px;
  color: var(--color-accent);
}
```

- [ ] **Step 2: Create `src/app/project/[slug]/page.tsx`**

```tsx
import { getAllProjects, getProjectBySlug } from '@/lib/projects';
import styles from './page.module.css';

export async function generateStaticParams() {
  const projects = await getAllProjects();
  return projects.map((project) => ({ slug: project.slug }));
}

export default async function ProjectDetailPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug);

  if (!project) {
    throw new Error(`Project not found for slug: ${params.slug} (generateStaticParams/getProjectBySlug mismatch)`);
  }

  return (
    <article className={styles.article}>
      <h1>{project.title}</h1>
      {project.techStack && <p className={styles.techStack}>{project.techStack}</p>}
      {project.imageUrl && <img src={project.imageUrl} alt={project.title} className={styles.image} />}
      {project.description.split('\n').map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
      {project.linkUrl && (
        <a href={project.linkUrl} target="_blank" rel="noreferrer" className={styles.link}>
          查看專案 →
        </a>
      )}
    </article>
  );
}
```

Note: under `output: 'export'`, a slug not present in `generateStaticParams()` never reaches this component (Next.js itself rejects the request at build/dev time), so this isn't a user-facing 404 path — it only guards against a `generateStaticParams`/`getProjectBySlug` mismatch bug. The real 404 experience for unknown project URLs comes entirely from the site-wide static `404.html` (Task 12), served by the static host for any unmatched path.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds, `out/project/hui-hui.html` exists (Next's static export produces flat `<route>.html` files, not `<route>/index.html`, since `trailingSlash` is not enabled)

- [ ] **Step 4: Manual check**

Run: `npm run dev`, open `http://localhost:3000/project/hui-hui`
Expected: title, description paragraphs, and external link render; visiting `http://localhost:3000/project/does-not-exist` shows the 404 page (built in Task 12)

- [ ] **Step 5: Commit**

```bash
git add src/app/project/[slug]/page.tsx src/app/project/[slug]/page.module.css
git commit -m "feat: add Project detail page with static params"
```

---

### Task 11: Blog list page & Blog detail page

**Files:**
- Create: `src/app/blog/page.tsx`
- Create: `src/app/blog/page.module.css`
- Create: `src/app/blog/[slug]/page.tsx`
- Create: `src/app/blog/[slug]/page.module.css`

**Interfaces:**
- Consumes: `getAllBlogPosts`, `getBlogPostBySlug` from Task 4; `renderMarkdown` from Task 4; `Card` from Task 9

- [ ] **Step 1: Create `src/app/blog/page.module.css`**

```css
.title {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  margin-bottom: 24px;
}

.list {
  display: grid;
  gap: 16px;
}
```

- [ ] **Step 2: Create `src/app/blog/page.tsx`**

```tsx
import { getAllBlogPosts } from '@/lib/blogPosts';
import { Card } from '@/components/Card';
import styles from './page.module.css';

export default async function BlogPage() {
  const posts = await getAllBlogPosts();

  return (
    <section>
      <h1 className={styles.title}>Blog</h1>
      <div className={styles.list}>
        {posts.map((post) => (
          <Card key={post.slug} href={`/blog/${post.slug}`} title={post.title} description={post.summary} meta={post.date} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `src/app/blog/[slug]/page.module.css`**

```css
.article {
  max-width: 720px;
  margin: 0 auto;
  line-height: 1.7;
}

.date {
  color: #8b949e;
  font-size: 13px;
  margin-bottom: 24px;
}

.content :global(h1),
.content :global(h2) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.content :global(a) {
  color: var(--color-accent);
}
```

- [ ] **Step 4: Create `src/app/blog/[slug]/page.tsx`**

```tsx
import { getAllBlogPosts, getBlogPostBySlug } from '@/lib/blogPosts';
import { renderMarkdown } from '@/lib/markdown';
import styles from './page.module.css';

export async function generateStaticParams() {
  const posts = await getAllBlogPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function BlogDetailPage({ params }: { params: { slug: string } }) {
  const post = await getBlogPostBySlug(params.slug);

  if (!post) {
    throw new Error(`Blog post not found for slug: ${params.slug} (generateStaticParams/getBlogPostBySlug mismatch)`);
  }

  const html = renderMarkdown(post.content);

  return (
    <article className={styles.article}>
      <h1>{post.title}</h1>
      {post.date && <p className={styles.date}>{post.date}</p>}
      <div className={styles.content} dangerouslySetInnerHTML={{ __html: html }} />
    </article>
  );
}
```

Note: as with the Project detail page (Task 10), a slug not present in `generateStaticParams()` never reaches this component under `output: 'export'` — the thrown error only guards against a `generateStaticParams`/`getBlogPostBySlug` mismatch bug, not a user-facing 404. The real 404 experience for unknown blog URLs comes from the site-wide static `404.html` (Task 12).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build succeeds, `out/blog.html` and `out/blog/test.html` exist (from the sample `test` row in the Blog Posts sheet; Next's static export produces flat `<route>.html` files since `trailingSlash` is not enabled)

- [ ] **Step 6: Manual check**

Run: `npm run dev`, open `http://localhost:3000/blog` then click through to the `test` post
Expected: list renders card(s); detail page renders title, date, and rendered Markdown content

- [ ] **Step 7: Commit**

```bash
git add src/app/blog/page.tsx src/app/blog/page.module.css src/app/blog/[slug]/page.tsx src/app/blog/[slug]/page.module.css
git commit -m "feat: add Blog list and detail pages"
```

---

### Task 12: Global 404 page

**Files:**
- Create: `src/app/not-found.tsx`
- Create: `src/app/not-found.module.css`

**Interfaces:**
- Consumes: nothing

- [ ] **Step 1: Create `src/app/not-found.module.css`**

```css
.wrapper {
  text-align: center;
  padding: 80px 0;
}

.link {
  color: var(--color-accent);
}
```

- [ ] **Step 2: Create `src/app/not-found.tsx`**

```tsx
import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.wrapper}>
      <h1>404</h1>
      <p>找不到這個頁面。</p>
      <Link href="/" className={styles.link}>
        回到首頁
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Verify build and manual check**

Run: `npm run build`
Expected: build succeeds, `out/404.html` exists

Run: `npm run dev`, open `http://localhost:3000/project/does-not-exist`
Expected: 404 page renders with link back to Home

- [ ] **Step 4: Commit**

```bash
git add src/app/not-found.tsx src/app/not-found.module.css
git commit -m "feat: add global 404 page"
```

---

### Task 13: GitHub Actions deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `npm run build` producing `out/` (from Task 1 onward)

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages

on:
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./out

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add manual GitHub Pages deploy workflow"
```

- [ ] **Step 3: One-time manual repo setting (not a file change)**

In the GitHub repo (`cs83312/PersionalWebSite`), go to **Settings → Pages → Build and deployment → Source**, and select **GitHub Actions**. This must be done once before the workflow can deploy successfully.

- [ ] **Step 4: Push and run the workflow**

Push the branch to `origin`, then in the GitHub repo's **Actions** tab, select "Deploy to GitHub Pages" and click **Run workflow**.
Expected: both `build` and `deploy` jobs succeed; the deployed site is reachable at `https://cs83312.github.io/PersionalWebSite/`

---

### Task 14: README and final manual QA pass

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing — final documentation and end-to-end verification task

- [ ] **Step 1: Create `README.md`**

```markdown
# KFxNet Personal Website

Static personal website for 許展發 (KLIF), built with Next.js (static export) and deployed to GitHub Pages.

## Development

npm install
npm run dev
# open http://localhost:3000

## Content updates (Google Sheets)

Project and Blog content are edited in this Google Sheet:
https://docs.google.com/spreadsheets/d/1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4

- `Projects` tab columns: slug, title, summary, description, tech_stack, image_url, link_url, order
- `Blog Posts` tab columns: slug, title, date, summary, content, order

Content is fetched at **build time**, not live. After editing the sheet, trigger a redeploy
(see below) for changes to appear on the site.

## Deploying

1. Push your changes to the `main`/`master` branch on GitHub.
2. Go to the repo's **Actions** tab.
3. Select **Deploy to GitHub Pages** and click **Run workflow**.
4. Site is published at https://cs83312.github.io/PersionalWebSite/

## Tests

npm test        # runs lib/ unit tests (CSV parsing, data validation, Markdown rendering)
npm run typecheck
npm run build   # also serves as the primary verification for pages/UI (no automated UI tests)
```

- [ ] **Step 2: Full manual QA pass**

Run: `npm run build && npm run start` (or `npx serve out`), then in a browser check:

- [ ] Home (`/`) renders brand, tagline, intro, and CTA links; language switch toggles all text
- [ ] My Story (`/story`) renders title/intro/body; language switch toggles all text
- [ ] Project list (`/project`) shows the `hui-hui` card; clicking navigates to `/project/hui-hui`
- [ ] Project detail (`/project/hui-hui`) shows title, tech stack, description, and external link
- [ ] Blog list (`/blog`) shows the `test` card; clicking navigates to `/blog/test`
- [ ] Blog detail (`/blog/test`) shows title, date, and rendered content
- [ ] Visiting an unknown path (e.g. `/project/nope`) shows the 404 page
- [ ] Nav bar links stay centered and readable at both desktop (~1280px) and mobile (~375px) widths
- [ ] Language switcher only appears on Home and My Story, not on Project/Blog pages

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: add README with dev, content-update, and deploy instructions"
```
