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
