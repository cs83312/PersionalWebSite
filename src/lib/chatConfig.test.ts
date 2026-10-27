import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_PROD_API_URL, resolveChatApiUrl } from './chatConfig';

test('override wins in any environment and loses its trailing slash', () => {
  assert.equal(resolveChatApiUrl('production', 'https://x.ngrok-free.app/'), 'https://x.ngrok-free.app');
  assert.equal(resolveChatApiUrl('development', 'http://127.0.0.1:9000'), 'http://127.0.0.1:9000');
});

test('development defaults to localhost:8000', () => {
  assert.equal(resolveChatApiUrl('development', undefined), 'http://localhost:8000');
  assert.equal(resolveChatApiUrl(undefined, ''), 'http://localhost:8000');
});

test('production uses CHAT_PROD_API_URL', () => {
  assert.equal(resolveChatApiUrl('production', undefined), CHAT_PROD_API_URL.replace(/\/+$/, ''));
});
