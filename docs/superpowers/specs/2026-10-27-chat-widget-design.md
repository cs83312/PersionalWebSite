# 右下角聊天 bot（前端）— 設計文件

日期：2026-10-27

## 目的

在網站每一頁的右下角放一個聊天 bot，讓訪客用聊天的方式認識 KLIF：自我介紹、主要在做什麼、個性、作品。回答內容由既有的聊天後端（`backend/`，FastAPI + Ollama + RAG）產生，資料來源是 KLIF 從後端管理介面上傳的文件與 `persona.yaml`。前端這次只做聊天介面，不在前端寫死任何介紹內容。

後端跑在 KLIF 自己的電腦上，透過 ngrok 對外。網站是部署在 GitHub Pages 的靜態網站（`output: 'export'`，正式網址 `https://cs83312.github.io/PersionalWebSite/`），所以瀏覽器是直接呼叫 ngrok 網址。

## 目標

- 每一頁的右下角都有聊天按鈕，點開後就能和 bot 對話，回答會以串流的方式逐字出現。
- 訪客不用想要問什麼：一打開就有建議問題可以直接點。
- 後端沒開（電腦關機、ngrok 沒開、Ollama 掛掉）時，訪客一眼就看得出來 bot 在休息，不會打了字才發現送不出去。
- 介面文字跟著網站的中／英文切換。

## 非目標

- 不在前端寫死自我介紹、作品等內容，也不在前端做檢索或 fallback 回答。
- 不做登入，也不做跨裝置或跨分頁的對話紀錄。
- 不改後端（CORS 已經由後端 session 處理好，見「後端契約」）。

## 反目標（做出來也算失敗的情況）

- 後端離線時，訪客打開面板、打了字，才收到錯誤訊息。
- 聊天元件弄壞網站既有的版面、主題或靜態輸出建置，或讓 `npm test`／`npm run build` 失敗。
- 呼叫因為 ngrok 警告頁或 CORS 被擋而失敗，前端卻只顯示一般的「錯誤」。

## 已決定的外觀與行為（KLIF 決定）

外觀選用視覺稿中的 **B. 泡泡＋建議問題**。

### 按鈕與開關
- 右下角固定一顆深藍色（`--primary` 系）圓形按鈕，每一頁都有，放在 `layout.tsx` 中，換頁時不會重新掛載。
- 按鈕旁邊有一句招呼語，例如「想認識我嗎？👋」。
- 點按鈕會展開聊天面板，面板上方顯示名字。再點一次按鈕或按 Esc 就會收起來。

### 開始對話
- 打開面板時，bot 先打招呼，下面列出四個建議問題：「你是誰？」「你在做什麼？」「你是什麼個性？」「有哪些作品？」。點建議問題的效果和自己打字送出一樣。
- 介面文字與建議問題都放在 `dictionary.ts`，有中、英兩個版本。

### 回答時
- 回答以串流方式逐字出現；回答完後，在下方用小字列出參考來源（後端回傳的 `sources`，顯示 `filename`，有 `page` 時一併顯示）。
- 等待回答時不能送出新訊息，因為後端一次只處理一個請求。
- 換頁時對話保留；關掉瀏覽器分頁後重新開始。

### 後端休息中
- 網頁載入時先呼叫 `GET /health`。連不到（網路錯誤）或回傳非 200 時，按鈕會變灰，招呼語改成「我的 AI 分身休息中 😴，晚點再來找我聊」。
- 如果聊到一半後端斷掉（`503`，或串流中收到 `error`、連線中斷），就在對話裡顯示「我先休息一下，晚點再聊」，按鈕同時變灰。

### 其他
- 面板最下方有一行小字，告知訪客對話會被記錄（後端會保存聊天紀錄，後端規格要求前端告知）。
- `429` 時顯示「問得太快了，休息一下再問」；`503 busy` 時顯示「現在有點忙，請稍後再試」；`422` 時顯示訊息是空的或太長（上限 1000 字）。

## 後端契約（由後端 session 確認，commit `9e07a52`）

- `POST {API}/chat/stream`，body 為 `{ session_id?: string (≤64), message: string }`。第一次發問時不帶 `session_id`，從第一個 SSE 事件取得。
- 回應是透過 POST 傳回的 SSE，必須用 `fetch` 搭配 `ReadableStream` 讀取並解析，**不能用 `EventSource`**。
- 事件依序為：`meta {session_id}` → `token {text}`（重複多次）→ `sources [{doc_id, filename, page}]` → `done {fallback: bool}`。Ollama 在串流中途失敗時，會收到 `error {detail: "unavailable"}`，之後不會有 `done`。
- 串流開始前的錯誤會回傳一般 JSON 和 HTTP 狀態碼：`422`、`429 {detail:"rate_limited"}`、`503 {detail:"busy"}`、`503 {detail:"unavailable"}`。要先檢查 `response.ok` 再開始解析 SSE。
- `GET {API}/health`：正常時回 200，異常時回 503；如果是 ngrok 或電腦沒開，則會是網路錯誤。
- 每個請求都要帶 `ngrok-skip-browser-warning: true` header（包含 `/health`），否則 ngrok 免費版會回傳警告頁。後端的 CORS 已允許這個 header，以及 `https://cs83312.github.io`、`http://localhost:3000` 這兩個 origin。

## 限制

- 靜態輸出，沒有伺服器端，所有呼叫都在瀏覽器中進行。
- 沿用現有技術：Next.js 14 App Router、React 18、CSS Modules、主題變數（`globals.css`）、`LanguageContext` + `dictionary.ts`。不新增 npm 依賴。
- 測試沿用 `tsx --test`（`node:test`），新增的測試檔要加進 `package.json` 的 `test` script。
- 不要在主要 checkout 執行 `next build`（KLIF 在那裡跑 `next dev`，共用 `.next` 會壞掉）；要建置請在 worktree 中進行。

## 我替 KLIF 做的決定（KLIF 可推翻）

- **API 網址設定：** 寫在單一常數檔 `src/lib/chatConfig.ts`。KLIF 說「會把 ngrok 網址貼到前端」，GitHub Actions 建置時沒有 `.env`，所以正式網址就直接寫在檔案中，並提交進版本控制。開發時（`NODE_ENV !== 'production'`）預設為 `http://localhost:8000`，也可以用 `NEXT_PUBLIC_CHAT_API_URL` 覆蓋。提醒 KLIF：ngrok 免費版每次重開網址都會變，除非使用 ngrok 提供的固定網域；網址變了就要改這個檔案並重新部署。
- **session_id** 存在 `sessionStorage`（比照 `safeStorage.ts` 用 try/catch 包起來）。對話內容存在 React state，所以換頁時保留、關閉分頁就消失。
- **健康檢查**：網頁載入時檢查一次；離線時每 60 秒重新檢查一次，恢復後按鈕自動變回正常。開啟面板時也檢查一次。
- **點灰色按鈕**不會打開面板，只會再顯示一次休息中的招呼語。
- **招呼語**在網頁載入幾秒後出現，幾秒後自動消失；訪客點掉後，本次分頁不再出現。
- **手機**（寬度 ≤ 480px）時，面板改為全螢幕顯示。
- **面板標題**用 `dictionary` 中的名字，例如「問問 KLIF」／「Ask KLIF」。頭像先用「K」字母圓形，之後可以換成照片。
- **回答以純文字顯示**，保留換行，不解析 Markdown（避免 XSS，也比較簡單）。
- **SSE 解析**抽成純函式（例如 `src/lib/sse.ts`），以 `node:test` 測試，涵蓋事件被切成多段送達、`\r\n`、一次收到多個事件等情況。
- **深色模式**：所有顏色都使用 `globals.css` 的主題變數，不寫死色碼。

## 交給實作者決定

- 元件拆分與檔名（例如 `ChatWidget.tsx` + `ChatWidget.module.css`）、狀態管理方式。
- 動畫、陰影、間距等細節，只要符合視覺稿 B 的感覺即可。
- 無障礙細節：按鈕的 `aria-label`、面板 `role="dialog"`、開啟時把焦點移到輸入框等，請依一般做法處理。
- 錯誤訊息的英文版用字。
