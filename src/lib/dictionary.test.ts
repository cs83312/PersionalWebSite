import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dictionary } from './dictionary';

test('zh nav labels are Chinese, not copies of the English labels', () => {
  for (const [key, label] of Object.entries(dictionary.zh.nav)) {
    assert.notEqual(label, dictionary.en.nav[key as keyof typeof dictionary.en.nav], `zh nav.${key} is still English`);
    assert.match(label, /\p{Script=Han}/u, `zh nav.${key} should contain Chinese characters`);
  }
});
