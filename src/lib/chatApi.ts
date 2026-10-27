import { createSseParser } from './sse';

export interface ChatSource {
  doc_id: string;
  filename: string;
  page: number | null;
}

export type ChatFailure = 'invalid' | 'rate_limited' | 'busy' | 'unavailable';

export type ChatOutcome = { ok: true; fallback: boolean } | { ok: false; reason: ChatFailure };

export interface ChatHandlers {
  onSession(id: string): void;
  onToken(text: string): void;
  onSources(sources: ChatSource[]): void;
}

// ngrok 免費版沒有這個 header 時會回傳一頁 HTML 警告，而不是轉發給後端
const NGROK_HEADER = { 'ngrok-skip-browser-warning': 'true' };

const HEALTH_TIMEOUT_MS = 5000;
// 後端每 15 秒送一次 ping，超過這個時間完全沒有資料，就當成連線已經斷了
const STREAM_IDLE_TIMEOUT_MS = 45_000;

// fetchImpl 一律當成一般函式呼叫；把 window.fetch 掛在別的物件上呼叫會丟 Illegal invocation
export async function checkHealth(baseUrl: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const response = await fetchImpl(`${baseUrl}/health`, {
      headers: NGROK_HEADER,
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    return response.status === 200;
  } catch {
    return false;
  }
}

async function failureFromResponse(response: Response): Promise<ChatFailure> {
  if (response.status === 422) return 'invalid';
  if (response.status === 429) return 'rate_limited';
  if (response.status === 503) {
    try {
      const body = await response.json();
      if (body?.detail === 'busy') return 'busy';
    } catch {
      // 不是 JSON 就當成後端不可用
    }
  }
  return 'unavailable';
}

export async function streamChat(
  req: { baseUrl: string; sessionId: string | null; message: string },
  handlers: ChatHandlers,
  fetchImpl: typeof fetch = fetch,
  idleTimeoutMs: number = STREAM_IDLE_TIMEOUT_MS,
): Promise<ChatOutcome> {
  const unavailable: ChatOutcome = { ok: false, reason: 'unavailable' };
  if (!req.baseUrl) return unavailable;

  let response: Response;
  try {
    response = await fetchImpl(`${req.baseUrl}/chat/stream`, {
      method: 'POST',
      headers: { ...NGROK_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.sessionId ? { session_id: req.sessionId, message: req.message } : { message: req.message }),
    });
  } catch {
    return unavailable;
  }
  if (!response.ok) return { ok: false, reason: await failureFromResponse(response) };
  if (!response.body) return unavailable;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const push = createSseParser();
  // 電腦睡眠或 ngrok 半關閉時連線不會結束，read() 會一直等；取消 reader 讓它以 done 結束
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    while (true) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => reader.cancel().catch(() => {}), idleTimeoutMs);
      const { done, value } = await reader.read();
      // stream: true 讓被切在兩個 chunk 之間的中文字留到下一段再解碼
      const text = done ? decoder.decode() : decoder.decode(value, { stream: true });
      for (const { event, data } of push(text)) {
        const payload = JSON.parse(data);
        if (event === 'meta') handlers.onSession(payload.session_id);
        else if (event === 'token') handlers.onToken(payload.text);
        else if (event === 'sources') handlers.onSources(payload);
        else if (event === 'done') return { ok: true, fallback: Boolean(payload.fallback) };
        else if (event === 'error') return unavailable;
      }
      // 沒收到 done 串流就結束了（ngrok 斷線、電腦睡眠）
      if (done) return unavailable;
    }
  } catch {
    return unavailable;
  } finally {
    clearTimeout(idleTimer);
    reader.cancel().catch(() => {});
  }
}
