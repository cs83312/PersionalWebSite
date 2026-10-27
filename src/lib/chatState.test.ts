import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatReducer, initialChatState, type ChatAction, type ChatState } from './chatState';

const run = (...actions: ChatAction[]): ChatState => actions.reduce(chatReducer, initialChatState);

test('send appends the user message and an empty bot message, and sets pending', () => {
  const s = chatReducer(initialChatState, { type: 'send', text: '你是誰？' });
  assert.deepEqual(s.messages.map((m) => [m.role, m.text]), [['user', '你是誰？'], ['bot', '']]);
  assert.equal(s.pending, true);
  assert.notEqual(s.messages[0].id, s.messages[1].id);
});

test('send is ignored while pending', () => {
  const s = run({ type: 'send', text: 'a' });
  assert.equal(chatReducer(s, { type: 'send', text: 'b' }), s);
});

test('tokens append to the last bot message', () => {
  const s = run({ type: 'send', text: 'a' }, { type: 'token', text: '你' }, { type: 'token', text: '好' });
  assert.equal(s.messages.at(-1)!.text, '你好');
});

test('sources are de-duplicated by filename and page', () => {
  const src = (filename: string, page: number | null, doc_id = 'd') => ({ doc_id, filename, page });
  const s = run(
    { type: 'send', text: 'a' },
    { type: 'sources', sources: [src('a.pdf', 1), src('a.pdf', 1, 'd2'), src('a.pdf', 2), src('b.md', null), src('b.md', null)] },
  );
  assert.deepEqual(
    s.messages.at(-1)!.sources.map((x) => [x.filename, x.page]),
    [['a.pdf', 1], ['a.pdf', 2], ['b.md', null]],
  );
});

test('finish clears pending', () => {
  assert.equal(run({ type: 'send', text: 'a' }, { type: 'finish' }).pending, false);
});

test('fail with no text turns the empty bot message into the failure', () => {
  const s = run({ type: 'send', text: 'a' }, { type: 'fail', reason: 'busy' });
  assert.equal(s.messages.length, 2);
  const last = s.messages.at(-1)!;
  assert.deepEqual([last.role, last.text, last.failure], ['bot', '', 'busy']);
  assert.equal(s.pending, false);
});

test('fail after partial text keeps it and appends a failure message', () => {
  const s = run({ type: 'send', text: 'a' }, { type: 'token', text: '部分' }, { type: 'fail', reason: 'unavailable' });
  assert.deepEqual(
    s.messages.map((m) => [m.role, m.text, m.failure]),
    [['user', 'a', undefined], ['bot', '部分', undefined], ['bot', '', 'unavailable']],
  );
  assert.equal(new Set(s.messages.map((m) => m.id)).size, 3);
  assert.equal(s.pending, false);
});

test('token and sources are ignored when the last message is not from the bot', () => {
  assert.equal(chatReducer(initialChatState, { type: 'token', text: 'x' }), initialChatState);
  assert.equal(chatReducer(initialChatState, { type: 'sources', sources: [] }), initialChatState);
});
