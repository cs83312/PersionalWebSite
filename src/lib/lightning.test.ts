import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLightningColors } from './lightning';

function styleWith(vars: Record<string, string>) {
  return { getPropertyValue: (name: string) => vars[name] ?? '' };
}

test('readLightningColors reads the core and glow colors from the theme variables', () => {
  const colors = readLightningColors(styleWith({ '--lightning-core': ' #002340', '--lightning-glow': ' rgba(0, 35, 64, 0.55) ' }));
  assert.deepEqual(colors, { core: '#002340', glow: 'rgba(0, 35, 64, 0.55)' });
});

test('readLightningColors falls back to the dark-theme colors when the variables are missing', () => {
  assert.deepEqual(readLightningColors(styleWith({})), { core: '#fff7ee', glow: '#f6a965' });
});
