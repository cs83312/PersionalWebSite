# Project CMS Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Project data from a build-time Google Sheet fetch to Markdown files in `content/projects/`, editable from the existing Sveltia CMS `/admin`, with Markdown descriptions and an uploadable cover image shown on the list card and the detail page.

**Architecture:** Mirror the Blog pipeline. The frontmatter validation that `blogPosts.ts` already does is extracted into a shared `frontmatter.ts`, which both `blogPosts.ts` and a rewritten `projects.ts` use. `markdown.ts` exports a `withBasePath` helper for the cover `src`. `Card` gains an optional `imageSrc`. A `projects` collection in `public/admin/config.yml` writes the same files the loader reads, and `cmsConfig.test.ts` checks the two stay in sync. The Google Sheet code and `papaparse` are removed, and the Sheet itself is trashed only after the new version is live.

**Tech Stack:** Next.js 14 App Router (`output: 'export'`), TypeScript, gray-matter, marked, Sveltia CMS, node:test via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-project-cms-migration-design.md`

## Global Constraints

- Slug rule: `^[a-z0-9-]+$`. The filename is the slug, files are first-level only, and the rule is shared with Blog through `SLUG_PATTERN`.
- `date` must be `YYYY-MM-DD`. The list is sorted newest first, with same-date ties broken by slug ascending.
- Frontmatter field names: `title`, `date`, `summary`, `tech_stack`, `cover`, `link_url`; the body is Markdown.
- Images live under `public/project/<slug>/` and are referenced as `/project/<slug>/xxx`. basePath is added by code and never written into content.
- Any bad project file fails the build with the filename and field in the message. Nothing is silently skipped.
- An empty or missing `content/projects/` gives an empty list and a successful build.
- Blog behaviour and Blog error messages must not change. All existing `blogPosts.test.ts` tests must keep passing unmodified.
- `Card` without `imageSrc` must render exactly the same HTML as today, because the home, Blog and Story pages use it.
- Colors come from the theme variables in `globals.css` (`--border`, `--surface`, …). Do not hardcode color values.
- Page URLs `/project` and `/project/<slug>` are unchanged.
- The Google Sheet `1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4` is moved to the Drive trash only, never permanently deleted. This happens only after the live `/project` and `/project/hui-hui` are verified.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **A file saved by the CMS with every optional field set to `''` and an empty body** must parse, and the detail page must render without an empty content block or a "查看專案" link. Pinned in Task 3 (`a project saved by the CMS with empty optional fields and no body parses`).
2. **A cover path copied from the live site that already starts with `/PersionalWebSite/`** must not be double-prefixed. Pinned in Task 2 (`withBasePath leaves a path that already carries basePath untouched`).
3. **An uppercase `.MD` filename in `content/projects/`** must fail the build loudly rather than vanish. Pinned in Task 3 (`readProjectsFromDir fails on an uppercase .MD filename`).
4. **Project error messages must say "Project", not "Blog post"**, so the author knows which collection is broken. Pinned in Task 3 (`project errors name the project file, not a blog post`).
5. **Existing cards without an image must keep their exact look.** Pinned in Task 4 (build-output check that `out/blog.html` contains no `<img` inside cards, plus a screenshot comparison).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/frontmatter.ts` (create) | Shared Markdown-file validation: slug from filename, YAML parse, required/optional string fields, date normalisation, sort, read a directory |
| `src/lib/blogPosts.ts` (modify) | Blog loader, now a thin layer over `frontmatter.ts` |
| `src/lib/markdown.ts` (modify) | Adds an exported `withBasePath` |
| `src/lib/projects.ts` (rewrite) | Project loader over `frontmatter.ts` |
| `src/lib/types.ts` (modify) | New `Project` shape |
| `content/projects/hui-hui.md` (create) | The migrated project |
| `src/app/article.module.css` (create) | Shared Markdown body styles, used by the Blog and Project detail pages |
| `src/app/blog/[slug]/page.tsx`, `page.module.css` (modify) | Use the shared article styles |
| `src/app/project/[slug]/page.tsx`, `page.module.css` (modify) | Markdown body, cover with basePath |
| `src/components/Card.tsx`, `Card.module.css` (modify) | Optional `imageSrc` |
| `src/app/project/page.tsx` (modify) | Passes the cover to `Card` |
| `public/admin/config.yml`, `public/admin/index.html` (modify) | `projects` collection, admin title |
| `src/lib/cmsConfig.test.ts` (modify) | Checks the project collection against the loader |
| `src/lib/sheets.ts`, `src/lib/sheets.test.ts` (delete) | Google Sheet code |
| `package.json`, `package-lock.json`, `README.md` (modify) | Drop papaparse, update docs |

---

### Task 1: Extract shared frontmatter helpers from the Blog loader

Pure refactor. The Blog tests are the regression guard and must pass without edits.

**Files:**
- Create: `src/lib/frontmatter.ts`
- Modify: `src/lib/blogPosts.ts` (whole file)
- Test: `src/lib/blogPosts.test.ts` (unchanged, run only)

**Interfaces:**
- Produces (used by Task 3):
  - `SLUG_PATTERN: RegExp`, `DATE_PATTERN: RegExp`
  - `normalizeDate(value: unknown): string`
  - `parseMarkdownFile(kind: string, fileName: string, raw: string): { slug: string; data: Record<string, any>; content: string }`. `kind` is `'Blog post'` or `'Project'`, and `content` is trimmed.
  - `readRequiredString(data: Record<string, any>, field: string, owner: string): string`
  - `readOptionalString(data: Record<string, any>, field: string, owner: string): string`
  - `readDate(data: Record<string, any>, owner: string): string`
  - `sortByDateThenSlug<T extends { date: string; slug: string }>(items: T[]): T[]`
  - `readMarkdownDir<T>(dir: string, parse: (fileName: string, raw: string) => T): T[]`, which returns the items unsorted
  - `owner` is always `` `${kind} "${fileName}"` ``, e.g. `Blog post "a.md"`.

- [ ] **Step 1: Run the Blog tests to record the baseline**

Run: `npx tsx --test src/lib/blogPosts.test.ts src/lib/cmsConfig.test.ts`
Expected: all pass (20 in blogPosts plus the cmsConfig tests).

- [ ] **Step 2: Create `src/lib/frontmatter.ts`**

```ts
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

// Shared rules for content files (content/blog, content/projects): the
// filename is the URL slug, frontmatter is YAML, and anything malformed
// throws so the build fails instead of silently dropping the file.
export const SLUG_PATTERN = /^[a-z0-9-]+$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// YAML parses an unquoted 2026-09-07 into a Date at UTC midnight, while a
// quoted "2026-09-07" stays a string. Normalise both back to YYYY-MM-DD.
// A Date carrying a time-of-day or UTC offset (e.g. "2026-01-01 08:00:00
// +09:00") is NOT a genuine date-only value: converting it to UTC can shift
// the calendar day, silently corrupting the sort key. Only a Date whose UTC
// time components are all zero is trusted; anything else is handed back as
// its full ISO string so it falls through to DATE_PATTERN and fails loudly.
export function normalizeDate(value: unknown): string {
  if (value instanceof Date) {
    const isDateOnly =
      value.getUTCHours() === 0 &&
      value.getUTCMinutes() === 0 &&
      value.getUTCSeconds() === 0 &&
      value.getUTCMilliseconds() === 0;
    return isDateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  return typeof value === 'string' ? value.trim() : '';
}

export interface ParsedMarkdownFile {
  slug: string;
  data: Record<string, any>;
  content: string;
}

// `kind` names the collection in error messages, e.g. 'Blog post' or 'Project'.
export function parseMarkdownFile(kind: string, fileName: string, raw: string): ParsedMarkdownFile {
  const slug = fileName.replace(/\.md$/, '');
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `Invalid ${kind.toLowerCase()} filename "${fileName}": the slug must be lowercase letters, digits and hyphens only`,
    );
  }

  try {
    const parsed = matter(raw);
    return { slug, data: parsed.data, content: parsed.content.trim() };
  } catch (error) {
    throw new Error(`${kind} "${fileName}" has invalid YAML frontmatter: ${(error as Error).message}`);
  }
}

function assertStringOrAbsent(value: unknown, field: string, owner: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(`${owner} has an invalid frontmatter "${field}": expected a string, got ${typeof value}`);
  }
}

export function readRequiredString(data: Record<string, any>, field: string, owner: string): string {
  const value = data[field];
  assertStringOrAbsent(value, field, owner);
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) {
    throw new Error(`${owner} is missing the required frontmatter field "${field}"`);
  }
  return text;
}

export function readOptionalString(data: Record<string, any>, field: string, owner: string): string {
  const value = data[field];
  assertStringOrAbsent(value, field, owner);
  return typeof value === 'string' ? value.trim() : '';
}

export function readDate(data: Record<string, any>, owner: string): string {
  const date = normalizeDate(data.date);
  if (!DATE_PATTERN.test(date)) {
    throw new Error(`${owner} has an invalid frontmatter "date": expected YYYY-MM-DD, got "${date || '(missing)'}"`);
  }
  return date;
}

export function sortByDateThenSlug<T extends { date: string; slug: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    if (a.slug === b.slug) {
      return 0;
    }
    return a.slug < b.slug ? -1 : 1;
  });
}

// Only first-level files are read. The extension match is case-insensitive
// so an UPPER.MD file is picked up and then rejected by the slug rule,
// rather than silently ignored.
export function readMarkdownDir<T>(dir: string, parse: (fileName: string, raw: string) => T): T[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((fileName) => /\.md$/i.test(fileName))
    .map((fileName) => parse(fileName, fs.readFileSync(path.join(dir, fileName), 'utf8')));
}
```

- [ ] **Step 3: Replace `src/lib/blogPosts.ts` with the thin version**

```ts
import path from 'node:path';
import {
  SLUG_PATTERN,
  parseMarkdownFile,
  readDate,
  readMarkdownDir,
  readOptionalString,
  readRequiredString,
  sortByDateThenSlug,
} from './frontmatter';
import type { BlogPost } from './types';

// Re-exported so existing imports (cmsConfig.test.ts) keep working.
export { SLUG_PATTERN };

const BLOG_DIR = path.join(process.cwd(), 'content', 'blog');

export function parseBlogPostFile(fileName: string, raw: string): BlogPost {
  const { slug, data, content } = parseMarkdownFile('Blog post', fileName, raw);
  const owner = `Blog post "${fileName}"`;

  return {
    slug,
    title: readRequiredString(data, 'title', owner),
    date: readDate(data, owner),
    summary: readOptionalString(data, 'summary', owner),
    content,
  };
}

export function sortBlogPosts(posts: BlogPost[]): BlogPost[] {
  return sortByDateThenSlug(posts);
}

export function readBlogPostsFromDir(dir: string): BlogPost[] {
  return sortBlogPosts(readMarkdownDir(dir, parseBlogPostFile));
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  return readBlogPostsFromDir(BLOG_DIR);
}

export async function getBlogPostBySlug(slug: string): Promise<BlogPost | undefined> {
  const posts = await getAllBlogPosts();
  return posts.find((post) => post.slug === slug);
}
```

- [ ] **Step 4: Run the Blog and CMS tests and typecheck**

Run: `npx tsx --test src/lib/blogPosts.test.ts src/lib/cmsConfig.test.ts && npm run typecheck`
Expected: the same pass count as Step 1, 0 failures, and no type errors. If a Blog test fails, fix `frontmatter.ts`. Do not edit the test.

- [ ] **Step 5: Commit**

```bash
git add src/lib/frontmatter.ts src/lib/blogPosts.ts
git commit -m "refactor: extract shared frontmatter helpers from the blog loader

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Export `withBasePath` from the Markdown module

**Files:**
- Modify: `src/lib/markdown.ts:1-22`
- Test: `src/lib/markdown.test.ts` (append)

**Interfaces:**
- Produces: `withBasePath(href: string, basePath: string): string`. It adds `basePath` only when `href` starts with `/`, does not start with `//`, and does not already start with `${basePath}/`. Otherwise it returns `href` unchanged.

- [ ] **Step 1: Write the failing tests** (append to `src/lib/markdown.test.ts` and change the import line to `import { renderMarkdown, withBasePath } from './markdown';`)

```ts
test('withBasePath prefixes a root-relative path', () => {
  assert.equal(withBasePath('/project/a/cover.webp', '/PersionalWebSite'), '/PersionalWebSite/project/a/cover.webp');
});

test('withBasePath leaves external and protocol-relative URLs untouched', () => {
  assert.equal(withBasePath('https://example.com/a.png', '/PersionalWebSite'), 'https://example.com/a.png');
  assert.equal(withBasePath('//cdn.example.com/a.png', '/PersionalWebSite'), '//cdn.example.com/a.png');
  assert.equal(withBasePath('relative/a.png', '/PersionalWebSite'), 'relative/a.png');
});

test('withBasePath leaves a path that already carries basePath untouched', () => {
  assert.equal(
    withBasePath('/PersionalWebSite/project/a/cover.webp', '/PersionalWebSite'),
    '/PersionalWebSite/project/a/cover.webp',
  );
});

test('withBasePath returns the path unchanged when basePath is empty', () => {
  assert.equal(withBasePath('/project/a/cover.webp', ''), '/project/a/cover.webp');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test src/lib/markdown.test.ts`
Expected: FAIL, because `withBasePath` is not exported (SyntaxError or "is not a function").

- [ ] **Step 3: Implement.** Replace lines 1–22 of `src/lib/markdown.ts` (the import, the comment and `prefixInternalHrefs`) with:

```ts
import { Marked, type Token } from 'marked';

// Content authors write root-relative paths like /blog/<slug>/cover.png.
// On GitHub Pages the site lives under a basePath, so those paths need the
// prefix. External URLs (including protocol-relative //cdn.example.com),
// anchors, and relative paths must stay untouched. A path that already
// starts with the basePath (e.g. copied from the live site) must also be
// left alone, or it ends up prefixed twice.
export function withBasePath(href: string, basePath: string): string {
  if (!href.startsWith('/') || href.startsWith('//')) {
    return href;
  }
  if (basePath && href.startsWith(`${basePath}/`)) {
    return href;
  }
  return `${basePath}${href}`;
}

function prefixInternalHrefs(basePath: string) {
  return (token: Token): void => {
    if (token.type !== 'image' && token.type !== 'link') {
      return;
    }
    token.href = withBasePath(token.href, basePath);
  };
}
```

`renderMarkdown` below stays as it is.

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test src/lib/markdown.test.ts`
Expected: PASS for all, including the existing renderMarkdown tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/markdown.ts src/lib/markdown.test.ts
git commit -m "refactor: export withBasePath for non-Markdown asset paths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Read Projects from `content/projects/*.md`

The loader, type, migrated content and both project pages change together, because the `Project` type change breaks the pages until they are updated.

**Files:**
- Rewrite: `src/lib/projects.ts`
- Rewrite: `src/lib/projects.test.ts`
- Modify: `src/lib/types.ts:1-10`
- Create: `content/projects/hui-hui.md`
- Create: `src/app/article.module.css`
- Modify: `src/app/blog/[slug]/page.tsx`, `src/app/blog/[slug]/page.module.css`
- Modify: `src/app/project/[slug]/page.tsx`, `src/app/project/[slug]/page.module.css`

**Interfaces:**
- Consumes: Task 1's `parseMarkdownFile`, `readRequiredString`, `readOptionalString`, `readDate`, `readMarkdownDir` and `sortByDateThenSlug`; Task 2's `withBasePath`.
- Produces:
  - `interface Project { slug; title; date; summary; techStack; cover; linkUrl; content }`, all `string`
  - `parseProjectFile(fileName: string, raw: string): Project`
  - `readProjectsFromDir(dir: string): Project[]`
  - `getAllProjects(): Promise<Project[]>`, `getProjectBySlug(slug: string): Promise<Project | undefined>`
  - `src/app/article.module.css` exporting class `content`

- [ ] **Step 1: Write the failing tests.** Replace `src/lib/projects.test.ts` entirely:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseProjectFile, readProjectsFromDir } from './projects';

const VALID = [
  '---',
  'title: 恢恢巡路系統',
  'date: 2026-10-06',
  'summary: 道路巡護',
  'tech_stack: Next.js · Spring Boot',
  'cover: /project/hui-hui/cover.webp',
  'link_url: https://example.com/app',
  '---',
  '',
  '## 功能',
  '',
  '拍照、定位',
  '',
].join('\n');

function project(frontmatter: string[], body = '內文'): string {
  return ['---', ...frontmatter, '---', '', body, ''].join('\n');
}

function withTempDir(files: Record<string, string>, fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), content);
    }
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('parseProjectFile reads every frontmatter field and the Markdown body', () => {
  assert.deepEqual(parseProjectFile('hui-hui.md', VALID), {
    slug: 'hui-hui',
    title: '恢恢巡路系統',
    date: '2026-10-06',
    summary: '道路巡護',
    techStack: 'Next.js · Spring Boot',
    cover: '/project/hui-hui/cover.webp',
    linkUrl: 'https://example.com/app',
    content: '## 功能\n\n拍照、定位',
  });
});

test('parseProjectFile defaults missing optional fields to empty strings', () => {
  const parsed = parseProjectFile('a.md', project(['title: A', 'date: 2026-01-01']));
  assert.equal(parsed.summary, '');
  assert.equal(parsed.techStack, '');
  assert.equal(parsed.cover, '');
  assert.equal(parsed.linkUrl, '');
});

test('a project saved by the CMS with empty optional fields and no body parses', () => {
  const raw = [
    '---',
    'title: 後台建立的專案',
    'date: 2026-10-06',
    "summary: ''",
    "tech_stack: ''",
    "cover: ''",
    "link_url: ''",
    '---',
    '',
  ].join('\n');
  const parsed = parseProjectFile('from-cms.md', raw);
  assert.equal(parsed.title, '後台建立的專案');
  assert.equal(parsed.cover, '');
  assert.equal(parsed.linkUrl, '');
  assert.equal(parsed.content, '');
});

test('parseProjectFile throws when title is missing', () => {
  assert.throws(() => parseProjectFile('hui-hui.md', project(['date: 2026-01-01'])), /hui-hui\.md[\s\S]*title/);
});

test('parseProjectFile throws a wrong-type (not missing) error when title is not a string', () => {
  const raw = project(['title: 123', 'date: 2026-01-01']);
  assert.throws(() => parseProjectFile('hui-hui.md', raw), /hui-hui\.md[\s\S]*title[\s\S]*expected a string/);
  assert.throws(() => parseProjectFile('hui-hui.md', raw), (error: Error) => !/missing/.test(error.message));
});

test('parseProjectFile throws when date is missing or not YYYY-MM-DD', () => {
  assert.throws(() => parseProjectFile('hui-hui.md', project(['title: A'])), /hui-hui\.md[\s\S]*date/);
  assert.throws(() => parseProjectFile('hui-hui.md', project(['title: A', 'date: 2026/01/01'])), /hui-hui\.md[\s\S]*date/);
});

test('parseProjectFile throws when date carries a time and UTC offset', () => {
  const raw = project(['title: A', 'date: 2026-01-01 08:00:00 +09:00']);
  assert.throws(() => parseProjectFile('hui-hui.md', raw), /hui-hui\.md[\s\S]*date/);
});

test('parseProjectFile throws when an optional field is present but not a string', () => {
  assert.throws(
    () => parseProjectFile('hui-hui.md', project(['title: A', 'date: 2026-01-01', 'tech_stack: 123'])),
    /hui-hui\.md[\s\S]*tech_stack[\s\S]*expected a string/,
  );
  assert.throws(
    () => parseProjectFile('hui-hui.md', project(['title: A', 'date: 2026-01-01', 'link_url: [a, b]'])),
    /hui-hui\.md[\s\S]*link_url[\s\S]*expected a string/,
  );
});

test('parseProjectFile throws when the filename is not a valid slug', () => {
  assert.throws(() => parseProjectFile('恢恢.md', VALID), /恢恢\.md/);
  assert.throws(() => parseProjectFile('Hui_Hui.md', VALID), /Hui_Hui\.md/);
});

test('parseProjectFile throws with the filename when the YAML frontmatter is malformed', () => {
  assert.throws(() => parseProjectFile('hui-hui.md', project(['title: [unclosed', 'date: 2026-01-01'])), /hui-hui\.md/);
});

test('project errors name the project file, not a blog post', () => {
  assert.throws(() => parseProjectFile('hui-hui.md', project(['date: 2026-01-01'])), /^Error: Project "hui-hui\.md"/);
  assert.throws(() => parseProjectFile('Bad.md', VALID), /project filename/);
});

test('readProjectsFromDir sorts newest first and breaks same-date ties by slug', () => {
  withTempDir(
    {
      'old.md': project(['title: Old', 'date: 2025-01-01']),
      'b-new.md': project(['title: B', 'date: 2026-05-01']),
      'a-new.md': project(['title: A', 'date: 2026-05-01']),
      'notes.txt': 'not a project',
    },
    (dir) => {
      assert.deepEqual(
        readProjectsFromDir(dir).map((p) => p.slug),
        ['a-new', 'b-new', 'old'],
      );
    },
  );
});

test('readProjectsFromDir returns an empty list for a missing or empty directory', () => {
  assert.deepEqual(readProjectsFromDir(path.join(os.tmpdir(), 'projects-does-not-exist-xyz')), []);
  withTempDir({}, (dir) => assert.deepEqual(readProjectsFromDir(dir), []));
});

test('readProjectsFromDir fails the build on a bad file instead of skipping it', () => {
  withTempDir({ 'broken.md': project(['date: 2026-01-01']) }, (dir) => {
    assert.throws(() => readProjectsFromDir(dir), /broken\.md[\s\S]*title/);
  });
});

test('readProjectsFromDir fails on an uppercase .MD filename', () => {
  withTempDir({ 'UPPER.MD': VALID }, (dir) => {
    assert.throws(() => readProjectsFromDir(dir), /UPPER\.MD/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test src/lib/projects.test.ts`
Expected: FAIL, because `parseProjectFile` and `readProjectsFromDir` are not exported by the current `projects.ts`.

- [ ] **Step 3: Update the `Project` type.** In `src/lib/types.ts` replace the `Project` interface (lines 1–10) with:

```ts
export interface Project {
  slug: string;
  title: string;
  date: string;
  summary: string;
  techStack: string;
  // Root-relative (e.g. /project/<slug>/cover.webp) without basePath; '' when unset.
  cover: string;
  linkUrl: string;
  // Raw Markdown body.
  content: string;
}
```

- [ ] **Step 4: Rewrite `src/lib/projects.ts`**

```ts
import path from 'node:path';
import {
  parseMarkdownFile,
  readDate,
  readMarkdownDir,
  readOptionalString,
  readRequiredString,
  sortByDateThenSlug,
} from './frontmatter';
import type { Project } from './types';

const PROJECTS_DIR = path.join(process.cwd(), 'content', 'projects');

export function parseProjectFile(fileName: string, raw: string): Project {
  const { slug, data, content } = parseMarkdownFile('Project', fileName, raw);
  const owner = `Project "${fileName}"`;

  return {
    slug,
    title: readRequiredString(data, 'title', owner),
    date: readDate(data, owner),
    summary: readOptionalString(data, 'summary', owner),
    techStack: readOptionalString(data, 'tech_stack', owner),
    cover: readOptionalString(data, 'cover', owner),
    linkUrl: readOptionalString(data, 'link_url', owner),
    content,
  };
}

export function readProjectsFromDir(dir: string): Project[] {
  return sortByDateThenSlug(readMarkdownDir(dir, parseProjectFile));
}

export async function getAllProjects(): Promise<Project[]> {
  return readProjectsFromDir(PROJECTS_DIR);
}

export async function getProjectBySlug(slug: string): Promise<Project | undefined> {
  const projects = await getAllProjects();
  return projects.find((project) => project.slug === slug);
}
```

- [ ] **Step 5: Run the project tests**

Run: `npx tsx --test src/lib/projects.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 6: Create `content/projects/hui-hui.md`.** The content comes from the Sheet's single row; the two description lines become two paragraphs.

```markdown
---
title: 恢恢巡路系統
date: 2026-10-06
summary: 道路巡護
tech_stack: ''
cover: ''
link_url: https://cs83312.github.io/SmartRoadPortralPublic
---

拍照、定位、補充說明

流程體驗：目前此區不會傳送或保存資料，不會形成正式紀錄，也不是政府通報管道。正式回報管道將依 NVD 後續作業流程逐步開放。
```

- [ ] **Step 7: Move the shared Markdown body styles.** Create `src/app/article.module.css` with the `.content` rules cut from `src/app/blog/[slug]/page.module.css`. Then delete those rules from the blog file, keeping only `.article` and `.date`.

```css
/* Markdown body styles shared by the Blog and Project detail pages. */
.content :global(h1),
.content :global(h2) {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.content :global(a) {
  color: var(--secondary-ink);
}

.content :global(img) {
  max-width: 100%;
  height: auto;
}
```

In `src/app/blog/[slug]/page.tsx`, add `import articleStyles from '@/app/article.module.css';` after the `styles` import, and change `className={styles.content}` to `className={articleStyles.content}`.

- [ ] **Step 8: Rewrite the project detail page `src/app/project/[slug]/page.tsx`.** Keep `generateMetadata` and `generateStaticParams` as they are. Update the imports and the component:

```tsx
import type { Metadata } from 'next';
import { getAllProjects, getProjectBySlug } from '@/lib/projects';
import { renderMarkdown, withBasePath } from '@/lib/markdown';
import { basePath } from '@/lib/basePath';
import articleStyles from '@/app/article.module.css';
import styles from './page.module.css';
```

```tsx
export default async function ProjectDetailPage({ params }: { params: { slug: string } }) {
  const project = await getProjectBySlug(params.slug);

  if (!project) {
    throw new Error(`Project not found for slug: ${params.slug} (generateStaticParams/getProjectBySlug mismatch)`);
  }

  const html = renderMarkdown(project.content, basePath);

  return (
    <article className={styles.article}>
      <h1>{project.title}</h1>
      {project.techStack && <p className={styles.techStack}>{project.techStack}</p>}
      {project.cover && (
        <img src={withBasePath(project.cover, basePath)} alt={project.title} className={styles.image} />
      )}
      {html && <div className={articleStyles.content} dangerouslySetInnerHTML={{ __html: html }} />}
      {project.linkUrl && (
        <a href={project.linkUrl} target="_blank" rel="noreferrer" className={styles.link}>
          查看專案 →
        </a>
      )}
    </article>
  );
}
```

In `src/app/project/[slug]/page.module.css`, change `.image` so the cover is a block above the body:

```css
.image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin-bottom: 16px;
}
```

- [ ] **Step 9: Typecheck, test and build**

Run: `npm run typecheck && npm test && npm run build`
Expected: no type errors and all tests pass. The build lists `/project/hui-hui` as SSG. `out/project/hui-hui.html` contains `拍照、定位、補充說明` in a `<p>`, plus `查看專案`. Check with:
`grep -c "拍照、定位、補充說明" out/project/hui-hui.html` (expected ≥ 1).
`npm test` still lists `sheets.test.ts`, which is fine until Task 6.

- [ ] **Step 10: Commit**

```bash
git add src/lib/projects.ts src/lib/projects.test.ts src/lib/types.ts content/projects/hui-hui.md src/app/article.module.css "src/app/blog/[slug]/page.tsx" "src/app/blog/[slug]/page.module.css" "src/app/project/[slug]/page.tsx" "src/app/project/[slug]/page.module.css"
git commit -m "feat: read projects from content/projects markdown files

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Show the cover image on project list cards

**Files:**
- Modify: `src/components/Card.tsx`
- Modify: `src/components/Card.module.css`
- Modify: `src/app/project/page.tsx`

**Interfaces:**
- Consumes: `Project.cover` (Task 3) and `withBasePath` (Task 2).
- Produces: `CardProps.imageSrc?: string`. The value is a ready-to-use `src` that already has basePath.

- [ ] **Step 1: Record the current card HTML** (before changing `Card`)

Run: `npm run build && grep -o '<a[^>]*class="[^"]*card[^"]*"[^>]*>.\{0,200\}' out/blog.html > "$TMPDIR/cards-before.txt"; wc -l "$TMPDIR/cards-before.txt"`
Expected: one line per blog card. Use the session scratchpad directory if `$TMPDIR` is unset.

- [ ] **Step 2: Add `imageSrc` to `src/components/Card.tsx`**

```tsx
import Link from 'next/link';
import styles from './Card.module.css';

export interface CardProps {
  href: string;
  title: string;
  description?: string;
  meta?: string;
  // Ready-to-use src (basePath already applied). Omit for a text-only card.
  imageSrc?: string;
}

export function Card({ href, title, description, meta, imageSrc }: CardProps) {
  return (
    <Link href={href} className={styles.card}>
      {imageSrc && <img src={imageSrc} alt="" className={styles.image} />}
      <h3 className={styles.title}>{title}</h3>
      {meta && <p className={styles.meta}>{meta}</p>}
      {description && <p className={styles.description}>{description}</p>}
    </Link>
  );
}
```

- [ ] **Step 3: Add the image styles to `src/components/Card.module.css`.** Add `overflow: hidden;` to the existing `.card` rule; this does not change a text-only card. Then append:

```css
/* Bleeds to the card edges by cancelling the card's 20px padding. */
.image {
  display: block;
  width: calc(100% + 40px);
  max-width: none;
  margin: -20px -20px 16px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-bottom: 1px solid var(--border);
}
```

- [ ] **Step 4: Pass the cover in `src/app/project/page.tsx`**

```tsx
import { getAllProjects } from '@/lib/projects';
import { withBasePath } from '@/lib/markdown';
import { basePath } from '@/lib/basePath';
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
            imageSrc={project.cover ? withBasePath(project.cover, basePath) : undefined}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Verify that text-only cards are unchanged**

Run: `npm run typecheck && npm run build && grep -o '<a[^>]*class="[^"]*card[^"]*"[^>]*>.\{0,200\}' out/blog.html > "$TMPDIR/cards-after.txt" && diff "$TMPDIR/cards-before.txt" "$TMPDIR/cards-after.txt" && echo SAME`
Expected: `SAME`. The CSS-module hash in the class name does not change, because only rules were added.

- [ ] **Step 6: Verify a card with a cover, using a temporary local cover that is not committed**

```bash
mkdir -p public/project/hui-hui && cp public/images/logo/deer.png public/project/hui-hui/cover.png
sed -i "s|^cover: ''|cover: /project/hui-hui/cover.png|" content/projects/hui-hui.md
npm run build
grep -o '<img[^>]*cover.png[^>]*>' out/project.html out/project/hui-hui.html
```

Expected: one `<img>` in each file, both with `src="/PersionalWebSite/project/hui-hui/cover.png"`. Serve `out/` under `/PersionalWebSite/` and screenshot `/project` and `/project/hui-hui` in light and dark mode. Use headless Chrome; its minimum viewport is 500px wide. Check that the cover fills the top of the card edge to edge, the rounded corners clip it, and the border colour follows the theme.

Then revert the temporary cover:

```bash
git checkout content/projects/hui-hui.md && rm -rf public/project
```

- [ ] **Step 7: Commit**

```bash
git add src/components/Card.tsx src/components/Card.module.css src/app/project/page.tsx
git commit -m "feat: show project cover images on list cards

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Add the Projects collection to the CMS

**Files:**
- Modify: `public/admin/config.yml`
- Modify: `public/admin/index.html:7`
- Test: `src/lib/cmsConfig.test.ts`

**Interfaces:**
- Consumes: `SLUG_PATTERN` from `./frontmatter` and `parseProjectFile` from `./projects`.

- [ ] **Step 1: Write the failing tests.** In `src/lib/cmsConfig.test.ts`, add to the imports:

```ts
import { SLUG_PATTERN as SHARED_SLUG_PATTERN } from './frontmatter';
import { parseProjectFile } from './projects';
```

Append:

```ts
function projectsCollection(): Record<string, any> {
  const collection = readCmsConfig().collections.find((c: { name: string }) => c.name === 'projects');
  assert.ok(collection, 'config.yml must define a "projects" collection');
  return collection;
}

test('CMS projects collection writes into content/projects, the directory the loader reads', () => {
  const collection = projectsCollection();
  assert.equal(collection.folder, '/content/projects');
  assert.equal(collection.extension, 'md');
  assert.equal(collection.format, 'frontmatter');
  assert.equal(collection.path, undefined, 'a path template would create subfolders, which the loader ignores');
});

test('CMS projects slug pattern matches the loader slug rule', () => {
  const [pattern] = projectsCollection().slug.pattern;
  assert.equal(pattern, SHARED_SLUG_PATTERN.source);
  assert.deepEqual(projectsCollection().slug.editable, ['create']);
});

test('CMS stores project images under public/project/<slug>/ and links them as /project/<slug>/', () => {
  const collection = projectsCollection();
  assert.equal(collection.media_folder, '/public/project/{{filename}}');
  assert.equal(collection.public_folder, '/project/{{filename}}');
});

test('CMS project fields match what parseProjectFile expects', () => {
  const fields = projectsCollection().fields as { name: string; widget: string; required?: boolean; type?: string }[];
  const byName = Object.fromEntries(fields.map((field) => [field.name, field]));
  assert.deepEqual(Object.keys(byName).sort(), ['body', 'cover', 'date', 'link_url', 'summary', 'tech_stack', 'title']);
  assert.equal(byName.date.type, 'date', 'date must be date-only so it serialises as YYYY-MM-DD');
  assert.equal(byName.cover.widget, 'image');
  assert.equal(byName.body.widget, 'markdown');
  for (const optional of ['summary', 'tech_stack', 'cover', 'link_url']) {
    assert.equal(byName[optional].required, false, `${optional} must be optional`);
  }
  assert.notEqual(byName.title.required, false, 'title must be required');
});

test('a project saved by the CMS with an uploaded cover and inline image parses', () => {
  const raw = [
    '---',
    'title: 後台建立的專案',
    'date: 2026-10-06',
    "summary: ''",
    "tech_stack: ''",
    'cover: /project/from-cms/cover.webp',
    "link_url: ''",
    '---',
    '',
    '![截圖](/project/from-cms/shot.webp)',
    '',
  ].join('\n');
  const parsed = parseProjectFile('from-cms.md', raw);
  assert.equal(parsed.cover, '/project/from-cms/cover.webp');
  assert.equal(parsed.content, '![截圖](/project/from-cms/shot.webp)');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx tsx --test src/lib/cmsConfig.test.ts`
Expected: the new tests FAIL with `config.yml must define a "projects" collection`. The last test passes already, which is fine because it pins the format.

- [ ] **Step 3: Add the collection.** In `public/admin/config.yml`, replace the header comment (lines 1–5) with:

```yaml
# Sveltia CMS config for the /admin editor (Blog posts and Projects).
# Every save is a commit to the repo; the push to main triggers the deploy
# workflow, so the live site updates once GitHub Actions finishes.
# Sign in with a fine-grained personal access token (Contents: read and write).
# The rules below mirror src/lib/blogPosts.ts and src/lib/projects.ts
# (shared rules in src/lib/frontmatter.ts) — keep them in sync.
```

Append after the blog collection's last field, at the same indentation as `- name: blog`:

```yaml
  - name: projects
    label: Project 專案
    label_singular: 專案
    folder: /content/projects
    extension: md
    format: frontmatter
    create: true
    delete: true
    # Same slug rule as the blog: filename = URL slug, typed by hand.
    slug:
      editable: [create]
      hint: 網址名稱，只能用小寫英文、數字與連字號，例如 hui-hui（建立後不可更改）
      pattern: ['^[a-z0-9-]+$', '只能用小寫英文、數字與連字號']
    # Images go to public/project/<slug>/ and are referenced as
    # /project/<slug>/xxx; the build adds the /PersionalWebSite basePath prefix.
    media_folder: /public/project/{{filename}}
    public_folder: /project/{{filename}}
    sortable_fields: [date, title]
    summary: '{{date}} · {{title}}'
    fields:
      - { name: title, label: 標題, widget: string }
      - { name: date, label: 日期（列表依日期排序，新的在前）, widget: datetime, type: date, default: '{{now}}' }
      - { name: summary, label: 摘要（列表卡片顯示，選填）, widget: text, required: false }
      - { name: tech_stack, label: 使用技術（選填）, widget: string, required: false, hint: '例如 Next.js · Spring Boot' }
      - { name: cover, label: 封面圖（選填）, widget: image, required: false }
      - { name: link_url, label: 專案連結（選填）, widget: string, required: false, hint: '完整網址，例如 https://example.com' }
      - name: body
        label: 內文
        widget: markdown
        required: false
        hint: 不要寫「# 一級標題」，頁面會用上面的標題產生。圖片請用上傳或 Markdown 語法，不要寫 <img> 標籤。
```

In `public/admin/index.html`, change `<title>Blog 後台</title>` to `<title>KFxNet 後台</title>`.

- [ ] **Step 4: Run the tests**

Run: `npx tsx --test src/lib/cmsConfig.test.ts && npm test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add public/admin/config.yml public/admin/index.html src/lib/cmsConfig.test.ts
git commit -m "feat: add Projects collection to the CMS admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Remove the Google Sheet code and update the README

**Files:**
- Delete: `src/lib/sheets.ts`, `src/lib/sheets.test.ts`
- Modify: `package.json` (`test` script and dependencies), `package-lock.json`
- Modify: `README.md` (Projects section, Deploying step 2, Tests line)

- [ ] **Step 1: Confirm nothing else imports the Sheet code**

Run: `grep -rn "sheets'\|papaparse\|fetchCsvRows" src`
Expected: matches only in `src/lib/sheets.ts` and `src/lib/sheets.test.ts`.

- [ ] **Step 2: Delete the files and the dependencies**

```bash
git rm src/lib/sheets.ts src/lib/sheets.test.ts
npm uninstall papaparse @types/papaparse
```

In `package.json`, remove `src/lib/sheets.test.ts ` from the `test` script, leaving:

```json
"test": "tsx --test src/lib/projects.test.ts src/lib/blogPosts.test.ts src/lib/markdown.test.ts src/lib/basePath.test.ts src/lib/cmsConfig.test.ts src/lib/theme.test.ts src/lib/safeStorage.test.ts"
```

- [ ] **Step 3: Rewrite the README Projects section.** Replace everything from `### Projects（仍在 Google Sheet）` up to (not including) `## Deploying` with:

~~~markdown
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
~~~

In the `## Deploying` list, change step 2 to:

```markdown
2. To redeploy without a push, go to the **Actions** tab, select **Deploy to GitHub Pages** and click **Run workflow**.
```

Change the Tests code line to:

```
npm test        # runs lib/ unit tests (content validation, Markdown rendering, CMS config sync)
```

- [ ] **Step 4: Verify that the Sheet is fully gone from the build**

Run: `grep -rn "docs.google.com\|papaparse" src package.json README.md; npm run typecheck && npm test && npm run build`
Expected: the grep prints nothing. Typecheck, tests and build all pass.

- [ ] **Step 5: Commit**

```bash
git add -A src/lib package.json package-lock.json README.md
git commit -m "chore: remove Google Sheet project source and papaparse

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Ship, verify live, then trash the Google Sheet

**Files:** none (release and cleanup)

- [ ] **Step 1: Final local verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: all pass. Screenshot `/`, `/blog`, `/blog/blog-test`, `/project` and `/project/hui-hui` from `out/`, served under `/PersionalWebSite/`, in light and dark mode. Check that:
- the home and Blog cards look as before
- the Blog article body is styled as before
- the Project detail page shows the two paragraphs and the "查看專案 →" link

- [ ] **Step 2: Merge to `main` and push.** If work was done on a branch, fast-forward `main` to it. Then push:

```bash
git push origin main
```

- [ ] **Step 3: Wait for the deploy and check the live site**

```bash
gh run list --limit 1
gh run watch <run-id> --exit-status
for u in project project/hui-hui admin/; do printf "%s -> " $u; curl -s -o /dev/null -w "%{http_code}\n" "https://cs83312.github.io/PersionalWebSite/$u"; done
curl -s https://cs83312.github.io/PersionalWebSite/project/hui-hui | grep -c "拍照、定位、補充說明"
```

Expected: the run concludes `success`, all three URLs return `200`, and the grep count is ≥ 1. If anything fails, stop here and do not trash the Sheet.

- [ ] **Step 4: Move the Google Sheet to the Drive trash.** Use the Google Drive connector's `trash_file` on file id `1Vk-e665IwaW2pf3Nng6lA7oqdcPsPFxc4JWhi0ZRRX4`, after confirming with `get_file_metadata` that it is the spreadsheet in question. Report that it can be restored from the Drive trash within 30 days. If the connector is unavailable or not authorised, tell the user and give them the Sheet URL to trash it themselves.
