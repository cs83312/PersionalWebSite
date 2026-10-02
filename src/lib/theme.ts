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
