# 深色／淺色主題切換 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 KFxNet 網站加入跟隨系統、可手動切換並記住選擇、載入不閃爍的深色／淺色主題。

**Architecture:** 顏色全部改為 CSS 變數，`:root` 為淺色、`:root[data-theme='dark']` 為深色。`<head>` 內嵌腳本在首次繪製前決定並設定 `<html data-theme>`；NavBar 上的 `ThemeToggle` 圖示按鈕負責切換與寫入 localStorage。決定主題的規則集中在 `src/lib/theme.ts`，腳本與元件共用。

**Tech Stack:** Next.js 14 App Router（`output: 'export'`）、React 18、CSS Modules、TypeScript、`tsx --test`（node:test）。

**Spec:** `docs/superpowers/specs/2026-10-02-theme-toggle-design.md`

## Global Constraints

- 不新增任何 npm 套件。
- localStorage key 固定為 `kfxnet-theme`，值只會是 `'light'` 或 `'dark'`。
- 色值必須與 spec「色彩變數」表完全一致（另加本計畫的 `--on-secondary`，見下）。
- 元件 CSS 中不可出現寫死的色碼；除了 `globals.css`，`src/` 下的 `.css` 不得含 `#xxxxxx` 或 `--color-*`。
- 深色主題中，橘色與綠色作為文字一律使用 300 階；`--secondary` 填色上的文字維持 Navy `#002340`。
- 主題按鈕每一頁都顯示；語言切換維持只在 `/`、`/story` 顯示。
- **與 spec 的唯一差異：** 新增第 14 個變數 `--on-secondary: #002340`（兩主題相同），供橘色填色上的文字使用。原因：深色主題的 `--primary` 是淺色 `#EEF3F8`，沒有變數能提供 Navy。

## Review Focus

1. **localStorage 被封鎖（無痕模式、隱私設定）**：讀取會丟例外，使用者預期頁面仍依系統設定顯示主題而不是壞掉或卡在淺色。→ Task 1 的 `themeInitScript` vm 測試 `storageThrows`。
2. **內嵌腳本與 `resolveInitialTheme` 規則不一致**：兩份邏輯分開寫，日後改一邊忘了另一邊，會造成首次繪製與按鈕狀態不同。→ Task 1 以同一組輸入矩陣比對兩者輸出。
3. **localStorage 存了舊版或亂掉的值**：使用者預期視同沒選過、跟隨系統。→ Task 1 的 `'bogus'`、`''` 案例。
4. **遺漏的舊色碼**：某個元件在淺色主題下還是深灰底，看起來像壞掉。→ Task 2 的 grep 檢查步驟。
5. **淺色主題下橘色 hover 按鈕的文字對比**：若沿用舊寫法用 `--bg`（白）當文字，白字配橘底只有 2.4:1。→ Task 2 用 `--on-secondary`，Task 5 手動檢查。

---

## Task 0: 前置條件 — 確認使用者未 commit 的修改

`src/lib/dictionary.ts` 與 `package.json` 目前有使用者尚未 commit 的修改，本計畫的 Task 1、Task 4 也要改這兩個檔案。整檔 `git add` 會把使用者的修改一起 commit 進去。

- [ ] **Step 1: 檢查**

Run: `git status --short src/lib/dictionary.ts package.json`

- [ ] **Step 2: 判斷**

輸出為空 → 繼續 Task 1。
輸出不為空 → **停下來問使用者**要先自行 commit、stash，或同意一起 commit。不要自行 stash 或 commit 使用者的修改。

---

## Task 1: 主題決定邏輯 `src/lib/theme.ts`

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/lib/theme.test.ts`
- Modify: `package.json`（`scripts.test`）

**Interfaces:**
- Consumes: 無
- Produces:
  - `export type Theme = 'light' | 'dark'`
  - `export const THEME_STORAGE_KEY = 'kfxnet-theme'`
  - `export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme`
  - `export const themeInitScript: string`（會讀 `window.localStorage`、`window.matchMedia`，寫入 `document.documentElement.dataset.theme`）

- [ ] **Step 1: 寫失敗的測試**

Create `src/lib/theme.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { THEME_STORAGE_KEY, resolveInitialTheme, themeInitScript } from './theme';

test('THEME_STORAGE_KEY is kfxnet-theme', () => {
  assert.equal(THEME_STORAGE_KEY, 'kfxnet-theme');
});

test('resolveInitialTheme uses a stored light or dark choice regardless of the system', () => {
  assert.equal(resolveInitialTheme('light', true), 'light');
  assert.equal(resolveInitialTheme('light', false), 'light');
  assert.equal(resolveInitialTheme('dark', true), 'dark');
  assert.equal(resolveInitialTheme('dark', false), 'dark');
});

test('resolveInitialTheme follows the system when nothing is stored', () => {
  assert.equal(resolveInitialTheme(null, true), 'dark');
  assert.equal(resolveInitialTheme(null, false), 'light');
});

test('resolveInitialTheme treats an invalid stored value as no choice', () => {
  assert.equal(resolveInitialTheme('bogus', true), 'dark');
  assert.equal(resolveInitialTheme('bogus', false), 'light');
  assert.equal(resolveInitialTheme('', true), 'dark');
  assert.equal(resolveInitialTheme('Dark', false), 'light');
});

interface ScriptEnv {
  stored: string | null;
  prefersDark: boolean;
  storageThrows?: boolean;
}

function runInitScript({ stored, prefersDark, storageThrows = false }: ScriptEnv): string | undefined {
  const documentElement = { dataset: {} as Record<string, string> };
  const context = {
    window: {
      localStorage: {
        getItem(key: string) {
          if (storageThrows) throw new Error('storage blocked');
          return key === THEME_STORAGE_KEY ? stored : null;
        },
      },
      matchMedia(query: string) {
        return { matches: query === '(prefers-color-scheme: dark)' && prefersDark };
      },
    },
    document: { documentElement },
  };
  vm.runInNewContext(themeInitScript, context);
  return documentElement.dataset.theme;
}

test('themeInitScript sets the same theme as resolveInitialTheme for every input', () => {
  for (const stored of ['light', 'dark', 'bogus', '', null]) {
    for (const prefersDark of [true, false]) {
      assert.equal(
        runInitScript({ stored, prefersDark }),
        resolveInitialTheme(stored, prefersDark),
        `stored=${String(stored)} prefersDark=${prefersDark}`,
      );
    }
  }
});

test('themeInitScript follows the system when localStorage throws', () => {
  assert.equal(runInitScript({ stored: 'light', prefersDark: true, storageThrows: true }), 'dark');
  assert.equal(runInitScript({ stored: 'dark', prefersDark: false, storageThrows: true }), 'light');
});
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npx tsx --test src/lib/theme.test.ts`
Expected: FAIL，錯誤為找不到模組 `./theme`。

- [ ] **Step 3: 實作**

Create `src/lib/theme.ts`:

```ts
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'kfxnet-theme';

export function resolveInitialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return prefersDark ? 'dark' : 'light';
}

// 內嵌於 <head>，在首次繪製前執行；規則必須與 resolveInitialTheme 相同（theme.test.ts 會比對）。
export const themeInitScript = `(function () {
  var stored = null;
  try {
    stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  } catch (e) {}
  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme =
    stored === 'light' || stored === 'dark' ? stored : prefersDark ? 'dark' : 'light';
})();`;
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npx tsx --test src/lib/theme.test.ts`
Expected: PASS，6 個測試全過。

- [ ] **Step 5: 把測試檔加進 `npm test`**

Modify `package.json` 的 `scripts.test`，在字串最後加上 ` src/lib/theme.test.ts`。修改後應為：

```json
"test": "tsx --test src/lib/sheets.test.ts src/lib/projects.test.ts src/lib/blogPosts.test.ts src/lib/markdown.test.ts src/lib/basePath.test.ts src/lib/cmsConfig.test.ts src/lib/theme.test.ts"
```

Run: `npm test`
Expected: 全部 PASS。

- [ ] **Step 6: Commit**

```bash
git add src/lib/theme.ts src/lib/theme.test.ts package.json
git commit -m "feat: add theme resolution logic and head init script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: 主題變數與所有元件 CSS 遷移

所有 CSS 一起改，因為舊變數 `--color-*` 一移除，沒遷移的檔案就會失去顏色。

**Files:**
- Modify: `src/app/globals.css`（整檔改寫）
- Modify: `src/app/page.module.css:13,30-41`
- Modify: `src/app/not-found.module.css:7`
- Modify: `src/app/blog/[slug]/page.module.css:8,19`
- Modify: `src/app/project/[slug]/page.module.css:8,22`
- Modify: `src/components/Card.module.css:3,7,8,13,24,30`
- Modify: `src/components/StoryCard.module.css:6,8,27,57-59,70-71,86,91-92,116,119-121`
- Modify: `src/components/NavBar.module.css:8,9,15,29,34`
- Modify: `src/components/LanguageSwitcher.module.css:10,16,20-21`

**Interfaces:**
- Consumes: 無
- Produces: CSS 變數 `--bg --surface --border --text --text-muted --text-subtle --primary --primary-soft --secondary --secondary-ink --secondary-soft --tertiary --tertiary-soft --on-secondary`；`:root[data-theme='dark']` 選擇器（Task 3 的腳本會設定這個屬性）。

- [ ] **Step 1: 改寫 `src/app/globals.css`**

整檔替換為：

```css
:root {
  color-scheme: light;
  --bg: #ffffff;
  --surface: #f2f4f7;
  --border: #d8dee6;
  --text: #002340;
  --text-muted: #5b6675;
  --text-subtle: #a3adba;
  --primary: #002340;
  --primary-soft: #eef3f8;
  --secondary: #f28c38;
  --secondary-ink: #9c4a0d;
  --secondary-soft: #fef4eb;
  --tertiary: #177236;
  --tertiary-soft: #eaf7ee;
  --on-secondary: #002340;
}

/* 深色值寫兩次：data-theme 由 <head> 腳本設定；media query 是 JS 停用時的後備。兩段必須保持一致。 */
:root[data-theme='dark'] {
  color-scheme: dark;
  --bg: #001020;
  --surface: #001a30;
  --border: #0f3a61;
  --text: #eef3f8;
  --text-muted: #7c9fc0;
  --text-subtle: #4a769e;
  --primary: #eef3f8;
  --primary-soft: #0f3a61;
  --secondary: #f28c38;
  --secondary-ink: #f6a965;
  --secondary-soft: #4d2508;
  --tertiary: #62c27f;
  --tertiary-soft: #082b15;
  --on-secondary: #002340;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme]) {
    color-scheme: dark;
    --bg: #001020;
    --surface: #001a30;
    --border: #0f3a61;
    --text: #eef3f8;
    --text-muted: #7c9fc0;
    --text-subtle: #4a769e;
    --primary: #eef3f8;
    --primary-soft: #0f3a61;
    --secondary: #f28c38;
    --secondary-ink: #f6a965;
    --secondary-soft: #4d2508;
    --tertiary: #62c27f;
    --tertiary-soft: #082b15;
    --on-secondary: #002340;
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background-color: var(--bg);
  color: var(--text);
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

- [ ] **Step 2: `src/app/page.module.css`**

第 13 行 `color: #8b949e;` 改為 `color: var(--text-muted);`。
第 30–41 行改為：

```css
.links a {
  border: 1px solid var(--secondary-ink);
  color: var(--secondary-ink);
  padding: 10px 20px;
  border-radius: 6px;
  text-decoration: none;
}

.links a:hover {
  border-color: var(--secondary);
  background-color: var(--secondary);
  color: var(--on-secondary);
}
```

- [ ] **Step 3: 連結類的小檔案**

- `src/app/not-found.module.css` 第 7 行：`color: var(--color-accent);` → `color: var(--secondary-ink);`
- `src/app/blog/[slug]/page.module.css` 第 8 行：`color: #8b949e;` → `color: var(--text-muted);`；第 19 行：`color: var(--color-accent);` → `color: var(--secondary-ink);`
- `src/app/project/[slug]/page.module.css` 第 8 行與第 22 行：`color: var(--color-accent);` → `color: var(--secondary-ink);`

- [ ] **Step 4: `src/components/Card.module.css`**

| 行 | 原本 | 改為 |
|---|---|---|
| 3 | `border: 1px solid var(--color-border);` | `border: 1px solid var(--border);` |
| 7 | `color: var(--color-text);` | `color: var(--text);` |
| 8 | `background-color: #161b22;` | `background-color: var(--surface);` |
| 13 | `border-color: var(--color-accent);` | `border-color: var(--secondary-ink);` |
| 24 | `color: var(--color-accent);` | `color: var(--secondary-ink);` |
| 30 | `color: #8b949e;` | `color: var(--text-muted);` |

- [ ] **Step 5: `src/components/StoryCard.module.css`**

| 行 | 原本 | 改為 |
|---|---|---|
| 6 | `border: 1px solid var(--color-border);` | `border: 1px solid var(--border);` |
| 8 | `background-color: #161b22;` | `background-color: var(--surface);` |
| 27 | `background-color: var(--color-bg);` | `background-color: var(--bg);` |
| 57 | `border: 1px solid var(--color-border);` | `border: 1px solid var(--border);` |
| 58 | `background-color: var(--color-bg);` | `background-color: var(--bg);` |
| 59 | `color: #8b949e;` | `color: var(--text-muted);` |
| 70 | `border-color: var(--color-accent);` | `border-color: var(--secondary-ink);` |
| 71 | `color: var(--color-accent);` | `color: var(--secondary-ink);` |
| 86 | `border: 1px solid var(--color-border);` | `border: 1px solid var(--border);` |
| 91 | `border-color: var(--color-accent);` | `border-color: var(--secondary-ink);` |
| 92 | `background-color: var(--color-accent);` | `background-color: var(--secondary-ink);` |
| 116 | `color: #484f58;` | `color: var(--text-subtle);` |
| 119 | `.groupA { color: var(--color-accent); }` | `.groupA { color: var(--secondary-ink); }` |
| 120 | `.groupB { color: var(--color-text); }` | `.groupB { color: var(--text); }` |
| 121 | `.groupC { color: #3fb950; }` | `.groupC { color: var(--tertiary); }` |

- [ ] **Step 6: `src/components/NavBar.module.css`**

| 行 | 原本 | 改為 |
|---|---|---|
| 8 | `border-bottom: 1px solid var(--color-border);` | `border-bottom: 1px solid var(--border);` |
| 9 | `background-color: var(--color-bg);` | `background-color: var(--bg);` |
| 15 | `color: var(--color-text);` | `color: var(--text);` |
| 29 | `color: var(--color-text);` | `color: var(--text);` |
| 34 | `color: var(--color-accent);` | `color: var(--secondary-ink);` |

- [ ] **Step 7: `src/components/LanguageSwitcher.module.css`**

| 行 | 原本 | 改為 |
|---|---|---|
| 10 | `border: 1px solid var(--color-border);` | `border: 1px solid var(--border);` |
| 16 | `color: #8b949e;` | `color: var(--text-muted);` |
| 20 | `color: var(--color-accent);` | `color: var(--secondary-ink);` |
| 21 | `border-color: var(--color-accent);` | `border-color: var(--secondary-ink);` |

- [ ] **Step 8: 確認沒有遺漏的舊色**

Run: `grep -rnE "\-\-color-|#[0-9a-fA-F]{3,8}\b|rgba?\(" src --include=*.css | grep -v "src/app/globals.css"`
Expected: 沒有任何輸出。若有，依 spec 的「舊色碼替換對照」換成對應變數後重跑。

Run: `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" src --include=*.tsx`
Expected: 沒有任何輸出（inline style 的寫死顏色也算遺漏）。

- [ ] **Step 9: 型別檢查與建置**

Run: `npm run typecheck && npm run build`
Expected: 兩者皆成功。

- [ ] **Step 10: Commit**

```bash
git add src/app/globals.css src/app/page.module.css src/app/not-found.module.css "src/app/blog/[slug]/page.module.css" "src/app/project/[slug]/page.module.css" src/components/Card.module.css src/components/StoryCard.module.css src/components/NavBar.module.css src/components/LanguageSwitcher.module.css
git commit -m "feat: move all colors to light/dark theme variables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: 在 `<head>` 掛上防閃爍腳本

**Files:**
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: `themeInitScript` from `@/lib/theme`（Task 1）
- Produces: 頁面載入後 `<html>` 一定帶有 `data-theme="light"` 或 `data-theme="dark"`（JS 啟用時）。

- [ ] **Step 1: 修改 `src/app/layout.tsx`**

整檔替換為：

```tsx
import type { Metadata } from 'next';
import { LanguageProvider } from '@/context/LanguageContext';
import { NavBar } from '@/components/NavBar';
import { themeInitScript } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'KFxNet',
  description: '許展發（KLIF）的個人技術網站',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // data-theme 由下方腳本在 React 接手前設定，伺服器 HTML 沒有它，所以關閉此屬性的 hydration 警告
    <html lang="zh-Hant" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
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

- [ ] **Step 2: 建置並確認腳本進了靜態 HTML**

Run: `npm run build && grep -c "kfxnet-theme" out/index.html`
Expected: build 成功，grep 輸出 `1`（或更多）。

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: set data-theme before first paint via head script

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: `ThemeToggle` 按鈕與 NavBar 整合

**Files:**
- Create: `src/components/ThemeToggle.tsx`
- Create: `src/components/ThemeToggle.module.css`
- Modify: `src/lib/dictionary.ts`（zh 與 en 的 `nav` 之後各加一個 `theme` 區塊）
- Modify: `src/components/NavBar.tsx:6,27`
- Modify: `src/components/NavBar.module.css`（`.actions`）

**Interfaces:**
- Consumes: `THEME_STORAGE_KEY`, `resolveInitialTheme`, `type Theme` from `@/lib/theme`（Task 1）；`useLanguage()` from `@/context/LanguageContext`；CSS 變數（Task 2）
- Produces: `export function ThemeToggle(): JSX.Element`；dictionary 新鍵 `t.theme.toDark`、`t.theme.toLight`

- [ ] **Step 1: dictionary 加上按鈕文字**

在 `src/lib/dictionary.ts` 的 `zh` 物件中，`nav: {...},` 那一行之後插入：

```ts
    theme: { toDark: '切換為深色模式', toLight: '切換為淺色模式' },
```

在 `en` 物件中，`nav: {...},` 那一行之後插入：

```ts
    theme: { toDark: 'Switch to dark mode', toLight: 'Switch to light mode' },
```

只插入這兩行，不要動檔案其他內容。

- [ ] **Step 2: 建立 `src/components/ThemeToggle.module.css`**

```css
.toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 26px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
}

.toggle:hover {
  color: var(--secondary-ink);
  border-color: var(--secondary-ink);
}

.toggle:focus-visible {
  outline: 2px solid var(--secondary-ink);
  outline-offset: 2px;
}

.icon {
  width: 16px;
  height: 16px;
}
```

- [ ] **Step 3: 建立 `src/components/ThemeToggle.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { THEME_STORAGE_KEY, resolveInitialTheme, type Theme } from '@/lib/theme';
import styles from './ThemeToggle.module.css';

function MoonIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

export function ThemeToggle() {
  const { t } = useLanguage();
  // null 代表尚未讀到 <head> 腳本設定的主題；此時不畫圖示，避免 hydration 不一致
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(resolveInitialTheme(document.documentElement.dataset.theme ?? null, prefersDark));
  }, []);

  function toggleTheme() {
    if (theme === null) return;
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 無痕模式等情況寫不進去：本次切換仍生效，只是不保存
    }
  }

  const label = theme === 'dark' ? t.theme.toLight : t.theme.toDark;

  return (
    <button type="button" className={styles.toggle} onClick={toggleTheme} aria-label={label} title={label}>
      {theme === 'dark' && <SunIcon />}
      {theme === 'light' && <MoonIcon />}
    </button>
  );
}
```

- [ ] **Step 4: NavBar 掛上按鈕**

`src/components/NavBar.tsx` 第 6 行（`import { LanguageSwitcher } ...`）之後加：

```tsx
import { ThemeToggle } from './ThemeToggle';
```

第 27 行改為：

```tsx
      <div className={styles.actions}>
        <ThemeToggle />
        {showLanguageSwitcher && <LanguageSwitcher />}
      </div>
```

`src/components/NavBar.module.css` 的 `.actions` 改為：

```css
.actions {
  grid-area: actions;
  justify-self: end;
  display: flex;
  align-items: center;
  gap: 8px;
}
```

- [ ] **Step 5: 型別檢查、測試、建置**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部成功。若 typecheck 報 `t.theme` 不存在，確認 Step 1 兩邊都加了。

- [ ] **Step 6: Commit**

只 stage 本任務的檔案；Task 0 已確保 `dictionary.ts` 沒有使用者的未 commit 修改。

```bash
git add src/components/ThemeToggle.tsx src/components/ThemeToggle.module.css src/lib/dictionary.ts src/components/NavBar.tsx src/components/NavBar.module.css
git commit -m "feat: add theme toggle button to the navbar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 5: 瀏覽器實測

**Files:** 無（只有發現問題時才修改對應檔案）

- [ ] **Step 1: 啟動 dev server**

Run（背景執行）: `npm run dev`
開啟 `http://localhost:3000`。

- [ ] **Step 2: 兩個主題逐頁檢查**

在淺色與深色主題下各看一次：`/`、`/story`、`/project`、任一 `/project/<slug>`、`/blog`、任一 `/blog/<slug>`、不存在的網址（404）。逐項確認：
- 沒有殘留的深灰 `#161b22` 卡片或灰字出現在淺色主題。
- 首頁三個連結按鈕 hover 時是橘底配 Navy 字（兩個主題都是）。
- StoryCard 三段文字：第一段橘、第二段主文字色、第三段綠，在兩個主題都清楚可讀。
- 按鈕在淺色顯示月亮、深色顯示太陽；hover 變橘；Tab 鍵聚焦時有外框。
- 手機寬度（DevTools 375px）下按鈕和語言切換並排、不擠出畫面。

- [ ] **Step 3: 行為檢查**

- 切成深色 → 重新整理：維持深色，且沒有先閃白。
- DevTools Application → Local Storage 刪除 `kfxnet-theme` → 重新整理：跟隨系統（用 DevTools Rendering 面板的 `prefers-color-scheme` 模擬切換驗證兩種情況）。
- Local Storage 手動把 `kfxnet-theme` 設成 `bogus` → 重新整理：跟隨系統。
- Console 沒有 hydration 警告。
- 切換語言到 EN，滑鼠停在按鈕上，tooltip 顯示英文。

- [ ] **Step 4: 修正與 commit（若有）**

發現問題就修正對應檔案，重跑 `npm run typecheck && npm test && npm run build`，並以 `fix:` 開頭 commit。沒有問題就不 commit。
