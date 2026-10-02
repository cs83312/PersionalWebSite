import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeGetItem, safeSetItem } from './safeStorage';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => (key in data ? data[key] : null),
    setItem: (key: string, value: string) => {
      data[key] = value;
    },
  } as unknown as Storage & { data: Record<string, string> };
}

const blocked = (): Storage => {
  throw new Error('SecurityError: access to localStorage is denied');
};

test('safeGetItem returns the stored value', () => {
  assert.equal(safeGetItem('k', () => memoryStorage({ k: 'v' })), 'v');
  assert.equal(safeGetItem('missing', () => memoryStorage()), null);
});

test('safeGetItem returns null when accessing storage throws', () => {
  assert.equal(safeGetItem('k', blocked), null);
});

test('safeGetItem returns null when getItem throws', () => {
  const storage = { getItem: () => { throw new Error('boom'); } } as unknown as Storage;
  assert.equal(safeGetItem('k', () => storage), null);
});

test('safeSetItem writes the value', () => {
  const storage = memoryStorage();
  safeSetItem('k', 'v', () => storage);
  assert.equal(storage.data.k, 'v');
});

test('safeSetItem does not throw when storage is blocked or full', () => {
  assert.doesNotThrow(() => safeSetItem('k', 'v', blocked));
  const full = { setItem: () => { throw new Error('QuotaExceededError'); } } as unknown as Storage;
  assert.doesNotThrow(() => safeSetItem('k', 'v', () => full));
});
