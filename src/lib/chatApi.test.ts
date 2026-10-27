import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkHealth, streamChat, type ChatHandlers } from './chatApi';

const BASE = 'https://x.ngrok-free.app';

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

// 每個字串當作一個 chunk 送出，模擬網路分段
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

const ev = (event: string, data: unknown) => `event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;

function recorder() {
  const log: unknown[][] = [];
  const handlers: ChatHandlers = {
    onSession: (id) => log.push(['session', id]),
    onToken: (text) => log.push(['token', text]),
    onSources: (sources) => log.push(['sources', sources]),
  };
  return { log, handlers };
}

const headerOf = (init: RequestInit, name: string) => new Headers(init.headers).get(name);

test('checkHealth is true only for 200, and sends the ngrok header', async () => {
  const ok = fakeFetch(() => new Response('{}', { status: 200 }));
  assert.equal(await checkHealth(BASE, ok.fetchImpl), true);
  assert.equal(ok.calls[0].url, `${BASE}/health`);
  assert.equal(headerOf(ok.calls[0].init, 'ngrok-skip-browser-warning'), 'true');

  const down = fakeFetch(() => new Response('{}', { status: 503 }));
  assert.equal(await checkHealth(BASE, down.fetchImpl), false);
});

test('checkHealth is false on network error and never fetches with an empty base url', async () => {
  const broken = fakeFetch(() => {
    throw new TypeError('Failed to fetch');
  });
  assert.equal(await checkHealth(BASE, broken.fetchImpl), false);

  const unused = fakeFetch(() => new Response('{}', { status: 200 }));
  assert.equal(await checkHealth('', unused.fetchImpl), false);
  assert.equal(unused.calls.length, 0);
});

test('streamChat posts JSON with the header and omits session_id when null', async () => {
  const { calls, fetchImpl } = fakeFetch(() => sseResponse([ev('done', { fallback: false })]));
  await streamChat({ baseUrl: BASE, sessionId: null, message: '你是誰？' }, recorder().handlers, fetchImpl);
  assert.equal(calls[0].url, `${BASE}/chat/stream`);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(headerOf(calls[0].init, 'ngrok-skip-browser-warning'), 'true');
  assert.equal(headerOf(calls[0].init, 'content-type'), 'application/json');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { message: '你是誰？' });

  await streamChat({ baseUrl: BASE, sessionId: 's1', message: 'hi' }, recorder().handlers, fetchImpl);
  assert.deepEqual(JSON.parse(calls[1].init.body as string), { session_id: 's1', message: 'hi' });
});

test('streamChat reports meta, tokens and sources in order and returns done.fallback', async () => {
  const sources = [{ doc_id: 'd', filename: 'cv.pdf', page: 2 }];
  const all = [ev('meta', { session_id: 's1' }), ev('token', { text: '你' }), ev('token', { text: '好' }), ev('sources', sources), ev('done', { fallback: true })].join('');
  // 切成 7 個字一段，讓事件與中文字都被切開
  const chunks = all.match(/[\s\S]{1,7}/g)!;
  const { fetchImpl } = fakeFetch(() => sseResponse(chunks));
  const { log, handlers } = recorder();
  const outcome = await streamChat({ baseUrl: BASE, sessionId: null, message: 'hi' }, handlers, fetchImpl);
  assert.deepEqual(log, [['session', 's1'], ['token', '你'], ['token', '好'], ['sources', sources]]);
  assert.deepEqual(outcome, { ok: true, fallback: true });
});

test('a multi-byte character split across byte chunks is decoded intact', async () => {
  const bytes = new TextEncoder().encode(ev('token', { text: '嗨' }) + ev('done', { fallback: false }));
  const cut = bytes.indexOf(0xe5) + 1; // 嗨 = e5 97 a8，從中間切開
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, cut));
      controller.enqueue(bytes.slice(cut));
      controller.close();
    },
  });
  const { fetchImpl } = fakeFetch(() => new Response(body, { status: 200 }));
  const { log, handlers } = recorder();
  await streamChat({ baseUrl: BASE, sessionId: null, message: 'hi' }, handlers, fetchImpl);
  assert.deepEqual(log, [['token', '嗨']]);
});

test('HTTP errors map to failures before any SSE parsing', async () => {
  const cases: [number, unknown, string][] = [
    [422, { detail: 'invalid_message' }, 'invalid'],
    [429, { detail: 'rate_limited' }, 'rate_limited'],
    [503, { detail: 'busy' }, 'busy'],
    [503, { detail: 'unavailable' }, 'unavailable'],
    [500, 'Internal Server Error', 'unavailable'],
  ];
  for (const [status, body, reason] of cases) {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const { fetchImpl } = fakeFetch(() => new Response(text, { status }));
    const { log, handlers } = recorder();
    const outcome = await streamChat({ baseUrl: BASE, sessionId: null, message: 'hi' }, handlers, fetchImpl);
    assert.deepEqual(outcome, { ok: false, reason }, `status ${status}`);
    assert.deepEqual(log, []);
  }
});

test('network error is unavailable', async () => {
  const { fetchImpl } = fakeFetch(() => {
    throw new TypeError('Failed to fetch');
  });
  const outcome = await streamChat({ baseUrl: BASE, sessionId: null, message: 'hi' }, recorder().handlers, fetchImpl);
  assert.deepEqual(outcome, { ok: false, reason: 'unavailable' });
});

test('error event mid-stream is unavailable and keeps tokens already sent', async () => {
  const { fetchImpl } = fakeFetch(() => sseResponse([ev('meta', { session_id: 's1' }), ev('token', { text: '部分' }), ev('error', { detail: 'unavailable' })]));
  const { log, handlers } = recorder();
  const outcome = await streamChat({ baseUrl: BASE, sessionId: null, message: 'hi' }, handlers, fetchImpl);
  assert.deepEqual(log, [['session', 's1'], ['token', '部分']]);
  assert.deepEqual(outcome, { ok: false, reason: 'unavailable' });
});

test('stream that ends without done is unavailable', async () => {
  const { fetchImpl } = fakeFetch(() => sseResponse([ev('meta', { session_id: 's1' }), ev('token', { text: '你' })]));
  const outcome = await streamChat({ baseUrl: BASE, sessionId: null, message: 'hi' }, recorder().handlers, fetchImpl);
  assert.deepEqual(outcome, { ok: false, reason: 'unavailable' });
});

test('a stream that goes silent is cut off as unavailable', async () => {
  // 電腦睡眠或 ngrok 半關閉時，連線不會結束，只是不再有資料
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(ev('token', { text: '你' })));
    },
  });
  const { fetchImpl } = fakeFetch(() => new Response(body, { status: 200 }));
  const { log, handlers } = recorder();
  const outcome = await streamChat({ baseUrl: BASE, sessionId: null, message: 'hi' }, handlers, fetchImpl, 50);
  assert.deepEqual(log, [['token', '你']]);
  assert.deepEqual(outcome, { ok: false, reason: 'unavailable' });
});

test('a stream that breaks while reading is unavailable', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(ev('token', { text: '你' })));
      controller.error(new TypeError('network error'));
    },
  });
  const { fetchImpl } = fakeFetch(() => new Response(body, { status: 200 }));
  const outcome = await streamChat({ baseUrl: BASE, sessionId: null, message: 'hi' }, recorder().handlers, fetchImpl);
  assert.deepEqual(outcome, { ok: false, reason: 'unavailable' });
});
