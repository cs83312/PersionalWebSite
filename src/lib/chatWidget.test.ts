import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isImeKey, toggleAction } from './chatWidget';

test('an open panel always closes, even when the backend went offline', () => {
  assert.equal(toggleAction(true, 'offline'), 'close');
  assert.equal(toggleAction(true, 'online'), 'close');
  assert.equal(toggleAction(true, 'checking'), 'close');
});

test('a closed panel opens unless the backend is offline', () => {
  assert.equal(toggleAction(false, 'online'), 'open');
  assert.equal(toggleAction(false, 'checking'), 'open');
  assert.equal(toggleAction(false, 'offline'), 'offline-bubble');
});

test('keys pressed while an IME is composing are recognised', () => {
  assert.equal(isImeKey({ isComposing: true, keyCode: 27 }), true);
  assert.equal(isImeKey({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isImeKey({ isComposing: false, keyCode: 27 }), false);
});
