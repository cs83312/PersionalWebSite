import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser } from './sse';

test('parses one event', () => {
  const push = createSseParser();
  assert.deepEqual(push('event: meta\r\ndata: {"session_id":"a"}\r\n\r\n'), [{ event: 'meta', data: '{"session_id":"a"}' }]);
});

test('event split across chunks is emitted once complete', () => {
  const push = createSseParser();
  assert.deepEqual(push('event: tok'), []);
  assert.deepEqual(push('en\r\ndata: {"text":"嗨"}\r'), []);
  assert.deepEqual(push('\n\r\n'), [{ event: 'token', data: '{"text":"嗨"}' }]);
});

test('\r\n split across chunks yields one event', () => {
  const push = createSseParser();
  assert.deepEqual(push('event: done\r\ndata: {}\r'), []);
  assert.deepEqual(push('\n\r'), []);
  assert.deepEqual(push('\n'), [{ event: 'done', data: '{}' }]);
});

test('several events in one chunk, LF-only endings', () => {
  const push = createSseParser();
  assert.deepEqual(push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n'), [
    { event: 'a', data: '1' },
    { event: 'b', data: '2' },
  ]);
});

test('multiple data lines are joined with \\n; missing event defaults to message', () => {
  assert.deepEqual(createSseParser()('data: x\r\ndata: y\r\n\r\n'), [{ event: 'message', data: 'x\ny' }]);
});

test('comment lines are ignored', () => {
  const push = createSseParser();
  assert.deepEqual(push(': ping - 2026-10-27 00:00:00\r\n\r\n'), []);
  assert.deepEqual(push('event: done\r\ndata: {}\r\n\r\n'), [{ event: 'done', data: '{}' }]);
});

test('only one leading space after the colon is stripped', () => {
  assert.deepEqual(createSseParser()('data:  x\n\n'), [{ event: 'message', data: ' x' }]);
});
