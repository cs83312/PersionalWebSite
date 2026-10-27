import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dictionary } from './dictionary';
import type { ChatFailure } from './chatApi';

test('zh nav labels are Chinese, not copies of the English labels', () => {
  for (const [key, label] of Object.entries(dictionary.zh.nav)) {
    assert.notEqual(label, dictionary.en.nav[key as keyof typeof dictionary.en.nav], `zh nav.${key} is still English`);
    assert.match(label, /\p{Script=Han}/u, `zh nav.${key} should contain Chinese characters`);
  }
});

test('chat copy exists in both languages with four suggestions', () => {
  for (const lang of ['zh', 'en'] as const) assert.equal(dictionary[lang].chat.suggestions.length, 4);
  assert.deepEqual([...dictionary.zh.chat.suggestions], ['你是誰？', '你在做什麼？', '你是什麼個性？', '有哪些作品？']);
});

test('chat errors cover every ChatFailure in both languages', () => {
  const reasons: ChatFailure[] = ['invalid', 'rate_limited', 'busy', 'unavailable'];
  for (const lang of ['zh', 'en'] as const) for (const r of reasons) assert.ok(dictionary[lang].chat.errors[r]);
  assert.equal(dictionary.zh.chat.errors.unavailable, '我先休息一下，晚點再聊');
});

test('page template has a {page} placeholder', () => {
  for (const lang of ['zh', 'en'] as const) assert.match(dictionary[lang].chat.page, /\{page\}/);
});
