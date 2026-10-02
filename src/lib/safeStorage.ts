// 封鎖網站資料或無痕模式下，連讀取 window.localStorage 屬性本身都可能丟 SecurityError，
// 所以用函式延遲取得 storage，讓存取也包在 try/catch 裡。
const browserStorage = (): Storage => window.localStorage;

export function safeGetItem(key: string, getStorage: () => Storage = browserStorage): string | null {
  try {
    return getStorage().getItem(key);
  } catch {
    return null;
  }
}

export function safeSetItem(key: string, value: string, getStorage: () => Storage = browserStorage): void {
  try {
    getStorage().setItem(key, value);
  } catch {
    // 寫不進去就不保存，本次操作照常生效
  }
}
