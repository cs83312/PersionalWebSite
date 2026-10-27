# 右下角聊天 bot（前端）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在每一頁右下角放一個聊天 bot，透過串流呼叫既有的 `backend/` 聊天 API，後端離線時按鈕變灰。

**Architecture:** 純邏輯（API 網址、SSE 解析、HTTP 呼叫、對話狀態 reducer）放在 `src/lib/`，各自用 `node:test` 測試；UI 是兩個 client component（`ChatWidget` 管健康檢查、按鈕、招呼語與送出流程；`ChatPanel` 只負責畫面），掛在 `layout.tsx` 的 `LanguageProvider` 裡，換頁不會重新掛載。

**Tech Stack:** Next.js 14 App Router（`output: 'export'`）、React 18、CSS Modules、`tsx --test`。不新增 npm 依賴。

**Spec:** `docs/superpowers/specs/2026-10-27-chat-widget-design.md`

**工作區：** 在 worktree `.worktrees/chat-widget`（新分支 `feat/chat-widget`，從 `feat/chatbot-backend` 分出）實作。`npm run build` 只能在 worktree 跑，不要在主要 checkout 跑（KLIF 在那裡跑 `next dev`）。

## Global Constraints

- 每個請求（包含 `GET /health`）都要帶 header `ngrok-skip-browser-warning: true`。
- 用 `fetch` + `ReadableStream` 讀 SSE，**不能用 `EventSource`**。先檢查 `response.ok` 再解析。
- 所有顏色都用 `globals.css` 的主題變數（`--primary`、`--bg`、`--surface`、`--border`、`--text`、`--text-muted`、`--text-subtle`、`--shadow`），不寫死色碼。
- 介面文字全部放 `dictionary.ts`，中英兩版。
- 回答以純文字顯示（CSS `white-space: pre-wrap`），不解析 Markdown，不用 `dangerouslySetInnerHTML`。
- 訊息上限 1000 字（後端 `max_message_chars`，先 `strip()` 再算長度）。
- 新的 `*.test.ts` 都要加進 `package.json` 的 `test` script。
- `sessionStorage`／`localStorage` 一律透過 `safeGetItem`／`safeSetItem`（傳入 `() => window.sessionStorage`）。

## Review Focus

1. **中文輸入法選字時按 Enter**：選字的 Enter 不能送出訊息。Task 6 的 `onKeyDown` 要檢查 `e.nativeEvent.isComposing`（Safari 也要檢查 `keyCode === 229`）；用注音輸入在 Chrome 和 Safari 手動驗證。
2. **`\r\n` 被切在兩個 chunk 之間**（第一段結尾是 `\r`，下一段開頭是 `\n`）：不能多出一行空白，也不能把事件提早送出或拆成兩個。用 Task 2 的 `test('\r\n split across chunks yields one event')` 鎖住。
3. **sse-starlette 每 15 秒送一次 `: ping` 註解行**：回答很長時一定會遇到，parser 必須忽略。用 Task 2 的 `test('comment lines are ignored')` 鎖住。
4. **串流沒有 `done` 就結束**（ngrok 斷線、電腦睡眠）：要視為 `unavailable`，不能卡在等待中，讓輸入框永遠鎖住。用 Task 3 的 `test('stream that ends without done is unavailable')` 鎖住。
5. **同一份文件的多個片段**：後端可能回傳同一個 `filename`／`page` 好幾次，來源清單要去重。用 Task 4 的 `test('sources are de-duplicated by filename and page')` 鎖住。

---

### Task 1: API 網址設定

**Files:**
- Create: `src/lib/chatConfig.ts`
- Test: `src/lib/chatConfig.test.ts`
- Modify: `package.json`（`test` script 加上 `src/lib/chatConfig.test.ts`）

**Interfaces:**
- Produces:
  - `CHAT_PROD_API_URL: string`：正式的 ngrok 網址，先填 `''`，由 KLIF 貼上。
  - `resolveChatApiUrl(nodeEnv: string | undefined, override: string | undefined): string`
  - `CHAT_API_URL: string` = `resolveChatApiUrl(process.env.NODE_ENV, process.env.NEXT_PUBLIC_CHAT_API_URL)`。一定要直接寫 `process.env.NEXT_PUBLIC_CHAT_API_URL`，Next 才會在建置時把值寫進程式碼。
  - `CHAT_SESSION_KEY = 'kfxnet-chat-session'`、`CHAT_GREETING_DISMISSED_KEY = 'kfxnet-chat-greeting-dismissed'`

- [ ] **Step 1: 寫失敗的測試**

```ts
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
```

- [ ] **Step 2: 執行 `npx tsx --test src/lib/chatConfig.test.ts`，確認失敗（找不到模組）**
- [ ] **Step 3: 實作 `src/lib/chatConfig.ts`。** 空字串的 override 視為沒有設定。在 `CHAT_PROD_API_URL` 上方加註解：ngrok 免費版每次重開網址都會變，網址變了要改這裡並重新部署。
- [ ] **Step 4: 執行 `npm test`，確認全部通過**
- [ ] **Step 5: Commit** `feat(chat): chat API url config`

---

### Task 2: SSE 解析器

**Files:**
- Create: `src/lib/sse.ts`
- Test: `src/lib/sse.test.ts`
- Modify: `package.json`（加上 `src/lib/sse.test.ts`）

**Interfaces:**
- Produces:
  - `interface SseEvent { event: string; data: string }`
  - `createSseParser(): (chunk: string) => SseEvent[]`：回傳有狀態的 `push` 函式，每次只回傳已經完整的事件。

- [ ] **Step 1: 寫失敗的測試。** 實際的傳輸格式（sse-starlette）是 `event: meta\r\ndata: {...}\r\n\r\n`。

```ts
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
  assert.deepEqual(push('event: a\ndata: 1\n\nevent: b\ndata: 2\n\n'), [{ event: 'a', data: '1' }, { event: 'b', data: '2' }]);
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
```

- [ ] **Step 2: 執行 `npx tsx --test src/lib/sse.test.ts`，確認失敗**
- [ ] **Step 3: 實作 `createSseParser`。** 把文字累積在 buffer 裡；只有確定一行已經結束時才切出來（`\n`、`\r\n`，或後面接著別的字元的 `\r`）。buffer 結尾是單獨的 `\r` 時要先留著，等下一個 chunk 再判斷。空行代表事件結束，如果這個事件有 `data` 就送出；只有 `event:` 沒有 data 的事件直接丟掉。開頭是 `:` 的行忽略；不認得的欄位（`id`、`retry`）也忽略。
- [ ] **Step 4: 執行 `npm test`，確認全部通過**
- [ ] **Step 5: Commit** `feat(chat): SSE parser`

---

### Task 3: 聊天 API 客戶端

**Files:**
- Create: `src/lib/chatApi.ts`
- Test: `src/lib/chatApi.test.ts`
- Modify: `package.json`（加上 `src/lib/chatApi.test.ts`）

**Interfaces:**
- Consumes: Task 2 的 `createSseParser`
- Produces:
  - `interface ChatSource { doc_id: string; filename: string; page: number | null }`
  - `type ChatFailure = 'invalid' | 'rate_limited' | 'busy' | 'unavailable'`
  - `type ChatOutcome = { ok: true; fallback: boolean } | { ok: false; reason: ChatFailure }`
  - `interface ChatHandlers { onSession(id: string): void; onToken(text: string): void; onSources(sources: ChatSource[]): void }`
  - `checkHealth(baseUrl: string, fetchImpl?: typeof fetch): Promise<boolean>`
  - `streamChat(req: { baseUrl: string; sessionId: string | null; message: string }, handlers: ChatHandlers, fetchImpl?: typeof fetch): Promise<ChatOutcome>`：這個函式不會丟例外。

`fetchImpl` 預設用全域的 `fetch`，而且要當成一般函式呼叫（`fetchImpl(url, init)`），不要掛在物件上變成方法呼叫，否則瀏覽器會丟 `Illegal invocation`。

- [ ] **Step 1: 寫失敗的測試。** 用一個假的 `fetch` 記錄每次呼叫的 url／init，並回傳 `new Response(body, { status })`。串流內容用 `ReadableStream` 一次送一段文字（用 `TextEncoder` 編碼），來測試分段送達的情況。

```ts
test('checkHealth is true only for 200, and sends the ngrok header', async () => { /* 200 → true；503 → false；斷言 init.headers 包含 ngrok-skip-browser-warning: 'true'；url === base + '/health' */ });
test('checkHealth is false on network error and never fetches with an empty base url', async () => { /* fetch 丟 TypeError → false；baseUrl '' → false，且 fetch 呼叫次數是 0 */ });
test('streamChat posts JSON with the header and omits session_id when null', async () => { /* url === base + '/chat/stream'；method POST；body 解析後 deepEqual {message:'你是誰？'}；有 sessionId 時 body 包含 session_id */ });
test('streamChat reports meta, tokens and sources in order and returns done.fallback', async () => {
  // 送的內容：meta {session_id:'s1'}、token '你'、token '好'、sources [{doc_id:'d',filename:'cv.pdf',page:2}]、done {fallback:true}
  // 斷言：呼叫順序依序是 session s1、token 你、token 好、sources，結果 deepEqual { ok: true, fallback: true }
});
test('HTTP errors map to failures before any SSE parsing', async () => {
  // 422 → invalid；429 {detail:'rate_limited'} → rate_limited；503 {detail:'busy'} → busy；
  // 503 {detail:'unavailable'} → unavailable；500 → unavailable；而且都不會呼叫任何 handler
});
test('network error is unavailable', async () => { /* fetch 丟例外 → { ok:false, reason:'unavailable' } */ });
test('error event mid-stream is unavailable and keeps tokens already sent', async () => { /* meta、token '部分'、error → handler 收到 '部分'；結果是 unavailable */ });
test('stream that ends without done is unavailable', async () => { /* meta、token 之後串流就結束 → unavailable */ });
```

- [ ] **Step 2: 執行 `npx tsx --test src/lib/chatApi.test.ts`，確認失敗**
- [ ] **Step 3: 實作 `src/lib/chatApi.ts`。** 每個請求都帶 `ngrok-skip-browser-warning: 'true'`；POST 另外帶 `Content-Type: application/json`。`checkHealth` 加上 `signal: AbortSignal.timeout(5000)`。非 2xx 時解析 JSON 的 `detail`，`busy` 對應 `busy`，其他 503 對應 `unavailable`；JSON 解析失敗就當成 `unavailable`。串流用 `TextDecoder` 搭配 `{ stream: true }` 解碼（避免中文字被切在兩個 chunk 之間時變成亂碼）。讀串流時丟出的例外、事件 data 不是合法 JSON，都對應 `unavailable`。不認得的事件名稱忽略。
- [ ] **Step 4: 執行 `npm test`，確認全部通過**
- [ ] **Step 5: Commit** `feat(chat): streaming chat API client`

---

### Task 4: 對話狀態 reducer

**Files:**
- Create: `src/lib/chatState.ts`
- Test: `src/lib/chatState.test.ts`
- Modify: `package.json`（加上 `src/lib/chatState.test.ts`）

**Interfaces:**
- Consumes: Task 3 的 `ChatSource`、`ChatFailure`
- Produces:
  - `interface ChatMessage { id: number; role: 'user' | 'bot'; text: string; sources: ChatSource[]; failure?: ChatFailure }`：`failure` 存的是錯誤原因，不是文字，這樣切換語言時錯誤訊息也會跟著換。
  - `interface ChatState { messages: ChatMessage[]; pending: boolean; nextId: number }`
  - `type ChatAction = { type: 'send'; text: string } | { type: 'token'; text: string } | { type: 'sources'; sources: ChatSource[] } | { type: 'finish' } | { type: 'fail'; reason: ChatFailure }`
  - `initialChatState: ChatState`（`messages: []`、`pending: false`、`nextId: 1`）
  - `chatReducer(state: ChatState, action: ChatAction): ChatState`

- [ ] **Step 1: 寫失敗的測試**

```ts
test('send appends the user message and an empty bot message, and sets pending', () => {
  const s = chatReducer(initialChatState, { type: 'send', text: '你是誰？' });
  assert.deepEqual(s.messages.map((m) => [m.role, m.text]), [['user', '你是誰？'], ['bot', '']]);
  assert.equal(s.pending, true);
  assert.notEqual(s.messages[0].id, s.messages[1].id);
});
test('send is ignored while pending', () => { /* 連續 send 兩次 → 第二次回傳的 state 是同一個物件（===） */ });
test('tokens append to the last bot message', () => { /* send、token '你'、token '好' → 最後一則的 text 是 '你好' */ });
test('sources are de-duplicated by filename and page', () => {
  // sources 依序是 [a.pdf p1, a.pdf p1, a.pdf p2, b.md null, b.md null] → 剩下 [a.pdf p1, a.pdf p2, b.md null]，維持原本順序
});
test('finish clears pending', () => {});
test('fail with no text turns the empty bot message into the failure', () => {
  // send、fail busy → 最後一則是 bot，text 為 ''，failure 為 'busy'，pending 為 false，總共 2 則訊息
});
test('fail after partial text keeps it and appends a failure message', () => {
  // send、token '部分'、fail unavailable → 共 3 則：user、bot '部分'（沒有 failure）、bot 且 failure 為 'unavailable'
});
```

- [ ] **Step 2: 執行 `npx tsx --test src/lib/chatState.test.ts`，確認失敗**
- [ ] **Step 3: 實作 `chatReducer`。** 純函式，不改動傳入的 state。如果最後一則不是 bot 訊息，`token`／`sources` 就回傳原本的 state。
- [ ] **Step 4: 執行 `npm test`，確認全部通過**
- [ ] **Step 5: Commit** `feat(chat): conversation state reducer`

---

### Task 5: 介面文字

**Files:**
- Modify: `src/lib/dictionary.ts`（`zh` 和 `en` 都加上 `chat` 區塊）
- Test: `src/lib/dictionary.test.ts`（加測試）

**Interfaces:**
- Produces: `t.chat`，key 如下（中文版是規格指定的文字，不能改；英文版和沒有指定的中文由實作者用字，下面只是建議）：

| key | zh | en |
|---|---|---|
| `title` | 問問 KLIF | Ask KLIF |
| `greeting` | 想認識我嗎？👋 | Want to get to know me? 👋 |
| `offline` | 我的 AI 分身休息中 😴，晚點再來找我聊 | My AI twin is taking a nap 😴, come back later |
| `welcome` | 嗨！我是 KLIF 的 AI 分身，想知道什麼都可以問我 | Hi! I'm KLIF's AI twin — ask me anything |
| `suggestions` | `['你是誰？', '你在做什麼？', '你是什麼個性？', '有哪些作品？']` | `['Who are you?', 'What do you do?', "What's your personality like?", 'What have you built?']` |
| `placeholder` | 輸入你的問題… | Type your question… |
| `connecting` | 連線中… | Connecting… |
| `send` | 送出 | Send |
| `open` / `close` | 打開聊天 / 關閉聊天 | Open chat / Close chat |
| `dismiss` | 關閉提示 | Dismiss |
| `sources` | 參考來源 | Sources |
| `page` | 第 {page} 頁 | p. {page} |
| `logNotice` | 對話內容會被記錄，用來改善回答 | Conversations are logged to improve answers |
| `errors.unavailable` | 我先休息一下，晚點再聊 | I need a short break, let's talk later |
| `errors.busy` | 現在有點忙，請稍後再試 | I'm a bit busy right now, please try again shortly |
| `errors.rate_limited` | 問得太快了，休息一下再問 | You're asking too fast, take a breather |
| `errors.invalid` | 訊息是空的或太長（上限 1000 字） | Message is empty or too long (1000 characters max) |

`errors` 的 key 要跟 `ChatFailure` 完全一致，元件才能直接寫 `t.chat.errors[reason]`。

- [ ] **Step 1: 寫失敗的測試**

```ts
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
```

- [ ] **Step 2: 執行 `npx tsx --test src/lib/dictionary.test.ts`，確認失敗**
- [ ] **Step 3: 把上表加進 `dictionary.ts`**
- [ ] **Step 4: 執行 `npm test` 和 `npm run typecheck`，確認通過**（`en` 的結構要跟 `zh` 一樣，因為 `LanguageContext` 把它轉型成 `typeof dictionary.zh`）
- [ ] **Step 5: Commit** `feat(chat): chat widget copy`

---

### Task 6: 聊天元件並掛到 layout

**Files:**
- Create: `src/components/ChatWidget.tsx`、`src/components/ChatWidget.module.css`
- Create: `src/components/ChatPanel.tsx`、`src/components/ChatPanel.module.css`
- Modify: `src/app/layout.tsx`（在 `LanguageProvider` 裡、`<main>` 之後放 `<ChatWidget />`）

**Interfaces:**
- Consumes: Task 1 的 `CHAT_API_URL`、`CHAT_SESSION_KEY`、`CHAT_GREETING_DISMISSED_KEY`；Task 3 的 `checkHealth`、`streamChat`；Task 4 的 `chatReducer`、`initialChatState`、`ChatMessage`；Task 5 的 `t.chat`；`safeGetItem`／`safeSetItem`
- Produces:
  - `ChatWidget()`：沒有 props，元件本身是 `'use client'`。
  - `ChatPanel(props: { messages: ChatMessage[]; pending: boolean; online: boolean; connecting: boolean; onSend(text: string): void; inputRef: RefObject<HTMLTextAreaElement> })`：只負責畫面，自己沒有任何網路狀態。

這個專案沒有元件測試工具，也不能新增依賴，所以這個 task 用 typecheck、建置和手動測試來驗證。

**ChatWidget 的行為：**
- `health: 'checking' | 'online' | 'offline'`，初始值是 `'checking'`。掛載時呼叫一次 `checkHealth(CHAT_API_URL)`。只要狀態是 `offline`，就每 60000 ms 重新檢查一次（用 `setInterval`，在 effect 的 cleanup 裡清掉）；恢復成 `online` 就停止。打開面板時也檢查一次。
- 按鈕：`offline` 時套用灰色樣式（`--text-subtle`），點擊不會打開面板，而是重新顯示 `t.chat.offline` 招呼語 5 秒（就算訪客之前關掉過招呼語也一樣）。其他狀態點擊會切換面板開關。`aria-label` 是 `t.chat.open`／`t.chat.close`，加上 `aria-expanded`。按鈕上顯示「K」字母頭像。
- 招呼語：載入 3000 ms 後出現，顯示 8000 ms 後自動消失。`offline` 時文字是 `t.chat.offline`，否則是 `t.chat.greeting`。面板打開時不顯示。如果 `sessionStorage` 有 `CHAT_GREETING_DISMISSED_KEY` 就不會自動出現；按 × 關掉時寫入這個 key。
- Esc：面板打開時按 Esc 會關閉面板，並把焦點移回按鈕。打開面板時把焦點移到輸入框。
- 送出：先 `trim()`，空字串就不送；正在 `pending` 或狀態不是 `online` 時也不送。先 dispatch `send`，再用從 `sessionStorage` 讀到的 session id 呼叫 `streamChat`（只採用長度 ≤ 64 的值）；`onSession` 時寫回 `sessionStorage`。`onToken` 和 `onSources` 分別 dispatch `token`／`sources`。結果是 ok 就 dispatch `finish`；失敗就 dispatch `fail`，原因是 `unavailable` 時同時把 `health` 設成 `offline`（這樣就會開始每 60 秒重試）。
- 對話用 `useReducer` 存在 component state 裡。因為元件在 layout 中不會重新掛載，換頁時對話會保留。

**ChatPanel 的行為：**
- `role="dialog"`，`aria-label={t.chat.title}`。標題列有「K」頭像和 `t.chat.title`。
- 第一個泡泡永遠是 `t.chat.welcome`（每次 render 時從 `t` 取，切換語言會跟著換，不存進 state）。`messages.length === 0` 時在下面顯示四個建議問題按鈕，點了就呼叫 `onSend(建議問題)`。這些按鈕在 `pending` 或不是 `online` 時要 disabled。
- 訊息：user 泡泡靠右（背景 `--primary`，文字 `--bg`），bot 泡泡靠左（背景 `--surface`，文字 `--text`），都用 `white-space: pre-wrap`。有 `failure` 的訊息顯示 `t.chat.errors[failure]`，用 `--text-muted` 斜體。等待中且 bot 的文字還是空的時候，顯示三個點的動畫。`sources.length > 0` 時，在泡泡下方用小字顯示 `t.chat.sources`，後面接 `filename`，有 page 時再加上 `t.chat.page.replace('{page}', String(page))`。
- 訊息改變時，把訊息列表捲到最底。
- 輸入區用 `<textarea rows={1} maxLength={1000}>`。Enter 送出、Shift+Enter 換行；**`e.nativeEvent.isComposing` 為 true 或 `e.keyCode === 229` 時，Enter 不能送出**（中文輸入法選字）。`connecting` 時 placeholder 是 `t.chat.connecting`，`!online` 時是 `t.chat.offline`，否則是 `t.chat.placeholder`。不是 `online` 時輸入框 disabled；`pending` 或內容空白時送出按鈕 disabled。
- 最下方用小字顯示 `t.chat.logNotice`。

**樣式：**
- 按鈕：`position: fixed; right: 24px; bottom: 24px;`，56px 圓形，背景 `--primary`，文字 `--bg`，加上 `--shadow`。`z-index: 1000`（NavBar 沒有設 z-index，LightningCanvas 是 -1）。
- 面板：固定在按鈕上方，寬 360px，`max-height: min(560px, calc(100vh - 120px))`，背景 `--bg`、邊框 `--border`、圓角 16px、陰影 `--shadow`。`@media (max-width: 480px)` 時面板改成全螢幕（`inset: 0`、沒有圓角），按鈕仍然顯示在面板上方，用來關閉面板。
- 招呼語泡泡在按鈕左邊，背景 `--surface`，邊框 `--border`。
- 所有顏色都用主題變數。

- [ ] **Step 1: 寫 `ChatPanel.tsx` + `ChatPanel.module.css`**
- [ ] **Step 2: 寫 `ChatWidget.tsx` + `ChatWidget.module.css`**
- [ ] **Step 3: 把 `<ChatWidget />` 加進 `layout.tsx`**
- [ ] **Step 4: 執行 `npm run typecheck` 和 `npm test`，確認通過**
- [ ] **Step 5: 在 worktree 執行 `npm run build`，確認成功（靜態輸出），而且 `out/index.html` 存在**
- [ ] **Step 6: Commit** `feat(chat): chat widget on every page`

---

### Task 7: 端對端手動驗證

**Files:** 沒有要改的檔案，除非驗證時發現問題。

在 worktree 跑 `npx next dev -p 3001`（避免跟 KLIF 在主要 checkout 跑的 dev server 衝突）。後端跑 `cd backend && docker compose up -d`，並確認 Ollama 已經在跑、`llama3.1` 已經下載。

**注意：** 後端的 CORS 目前只允許 `http://localhost:3000` 和 `https://cs83312.github.io`。所以這一步要先停掉主要 checkout 的 dev server，改在 worktree 用 3000 port 跑；或是請 KLIF 允許暫時把 `http://localhost:3001` 加進後端的 CORS 設定。用哪個方式要先問 KLIF。

- [ ] **Step 1: 後端在線上。** 點按鈕 → 面板打開、輸入框拿到焦點。點「你是誰？」→ 回答逐字出現，回答完顯示參考來源；等待中送出按鈕是 disabled。按 Esc → 面板關閉，焦點回到按鈕。
- [ ] **Step 2: 換頁**（首頁 → 部落格）→ 對話還在。重新整理頁面 → 對話清空，但 `sessionStorage` 裡的 session id 還在（後端記得之前的上下文）。
- [ ] **Step 3: 切換語言、切換深色模式** → 介面文字和顏色都正確，錯誤訊息也跟著語言換。
- [ ] **Step 4: 注音輸入法** → 選字時按 Enter 不會送出訊息。
- [ ] **Step 5: 後端離線。** 執行 `docker compose stop api` 後重新整理 → 按鈕變灰，招呼語顯示休息中，點按鈕不會打開面板。重新啟動 api → 60 秒內按鈕恢復正常。
- [ ] **Step 6: 回答到一半時停掉 api** → 對話中出現「我先休息一下，晚點再聊」，按鈕變灰。
- [ ] **Step 7: 快速連續發問直到被限流** → 出現「問得太快了，休息一下再問」。
- [ ] **Step 8: 在 DevTools 把寬度調到 375px** → 面板變成全螢幕，用按鈕可以關閉，頁面沒有水平捲軸。
- [ ] **Step 9: 驗證時有修改的話，修正後 commit**，接著用 superpowers:finishing-a-development-branch 收尾。
