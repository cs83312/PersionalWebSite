# 個人網站聊天 bot 後端：設計文件

日期：2026-10-26
範圍：後端 API 服務（前端聊天視窗是之後的另一個專案）

## 1. 目的與動機

KLIF 想在個人網站（本 repo 的 Next.js 靜態站）上放一個聊天 bot，讓訪客詢問關於 KLIF 的事，例如經歷、專案、部落格的主題。bot 的回答必須以 KLIF 自己上傳的文件為依據（RAG），不能憑空捏造。

這個服務跑在 KLIF 家裡的電腦上，透過 ngrok 對外開放，讓網站前端連得到。

## 2. 目標、非目標、反目標

**目標**
- 提供公開的聊天 API：支援串流（SSE）和一次性回傳，回答時要附上引用來源。
- 在同一個瀏覽 session 內記得對話上下文。
- 提供管理用的文件 CRUD API（第一版支援 md 和 pdf）：上傳後自動切段、向量化，存入 Qdrant。
- 永久保存每一筆問答紀錄，並提供管理用的查詢 API。
- bot 的個性、語氣、找不到資料時的回覆，全部寫在設定檔裡，KLIF 可以自己修改。
- 用 docker-compose 一鍵啟動。

**非目標（這次不做）**
- 前端聊天視窗，以及網站上「對話會被記錄」的告知文字（之後做前端時一起處理）。
- 影片、音訊的匯入。不過匯入流程必須能直接加上新的檔案類型（見 §6.1）。
- 跨瀏覽 session 的記憶（訪客隔天回來時，bot 不會記得之前的對話）。
- 訪客帳號或登入機制、多位管理者。
- 雲端部署、把 Ollama 放進容器。

**反目標（就算功能都能跑，發生了也算失敗）**
- bot 編造關於 KLIF 的事實，例如文件裡沒有的經歷。
- 管理 API、Qdrant、Redis、Postgres、Ollama 能從外網直接存取。
- 公開的聊天 API 可以被無限制地呼叫，把家裡的 GPU 拖垮。

## 3. 限制條件

- 主機：Windows 10、RTX 2080 SUPER（8GB VRAM）、Docker Desktop（Compose v2）。
- Ollama 直接裝在 Windows 上（不在容器裡），已經下載好 `llama3.1`、`qwen2.5:7b`、`qwen3.5:4b`、`mxbai-embed-large`。8GB VRAM 只跑得動 7B~8B 等級的模型。
- 對外只透過 ngrok，ngrok 跑在主機上，轉發到 API 的 port。
- Ollama 目前只監聽 `127.0.0.1:11434`。Docker Desktop 的 `host.docker.internal` 一般連得到主機上只綁定 localhost 的服務，但**實作的第一步就要實際驗證**。如果連不上，備案是設定 `OLLAMA_HOST=0.0.0.0`，並加一條 Windows 防火牆規則，擋掉區域網路對 11434 的連入，避免 Ollama 暴露在區網中。兩種情況都要寫進 README。
- 主機關機或 ngrok 斷線時，服務就停止。這是可以接受的，但必須提供 `/health` 讓之後的前端判斷服務是否在線。
- 沿用 `backend/` 現有的 `controller/`、`service/` 分層方式。`backend/service/LangChain.py` 是 KLIF 自己的測試腳本，不要動它。

## 4. 已確定的設計（KLIF 的決定）

| 項目 | 決定 |
|---|---|
| 技術堆疊 | FastAPI + LangChain + Ollama + Qdrant + Redis + Postgres，用 docker-compose 啟動 |
| 文件類型 | 第一版支援 md、pdf；之後會加影片、音訊 |
| 文件管理 | 需要完整的 CRUD |
| 部署方式 | 跑在家裡的電腦，用 ngrok 對外 |
| Ollama | 使用主機上的 Ollama，容器透過 `host.docker.internal:11434` 連線 |
| 對話記憶 | 只在同一次瀏覽內有效 → 存在 Redis，設定 TTL |
| 對話紀錄 | 永久保存，供事後查看 → 存在 Postgres |
| bot 個性 | 寫在設定檔，KLIF 之後自己填入 |
| 找不到答案時 | 簡單回覆「找不到相關文件」 |
| 開發順序 | 先完成後端 API，之後再做前端聊天視窗 |
| 文件管理的位置 | 只在家裡這台電腦上管理；管理 API 不透過 ngrok 對外 |

## 5. 架構

```
外部前端 ──ngrok──▶ 主機 127.0.0.1:8000
                         │
        ┌────────────────┴──────── docker-compose ────────────┐
        │  api   (FastAPI，聊天，127.0.0.1:8000 ← ngrok)       │
        │  admin (FastAPI，管理，127.0.0.1:8001，只限本機)     │
        │  兩者共用以下服務：                                  │
        │    ├─▶ qdrant    (向量庫，不對外公開 port)           │
        │    ├─▶ redis     (session 上下文，不對外公開 port)   │
        │    └─▶ postgres  (文件資訊 + 問答紀錄，不對外公開)   │
        └──────────────────────────────────────────────────────┘
                         │
                         └─▶ host.docker.internal:11434 (主機上的 Ollama)
```

- **公開 API 和管理 API 分開成兩個 app**（KLIF 的決定：只在家裡管理文件）。兩者使用同一份程式碼、同一個 image，但在 compose 裡是兩個 service：
  - `api`：聊天 API + `/health`，對外公開 `127.0.0.1:8000:8000`。**ngrok 只轉發這個 port。**
  - `admin`：文件 CRUD + 問答紀錄查詢，對外公開 `127.0.0.1:8001:8001`。ngrok 不轉發這個 port，只能在主機上存取。
  - 兩個 port 都綁定 127.0.0.1，所以區域網路的其他機器也連不到。`api` 這個 app **完全不掛載** `/admin/*` 路由（不只是擋掉而已）。管理 API 仍然保留 `X-API-Key` 檢查，作為多一層的防護。
  - `api` 和 `admin` 的上傳檔案 volume 只有 `admin` 需要寫入。
- `qdrant`、`redis`、`postgres` 不公開任何 port，只在 compose 的內部網路中互相連線。資料都存在 named volume。
- 原始上傳檔案存在 named volume `uploads`，路徑為 `/data/uploads/{doc_id}/{原檔名}`。

**建議的程式目錄結構**（實作時可以調整）：
```
backend/
  controller/   FastAPI routers：chat、admin_documents、admin_logs、health
  service/      業務邏輯：ingestion、retrieval、chat、history、loaders/
  config/       persona.yaml
  main.py       建立 app、掛載 routers、設定 CORS
  settings.py   從環境變數讀取設定
  Dockerfile
docker-compose.yml   （放在 backend/ 底下）
.env.example
```

## 6. 各部分的行為

### 6.1 文件匯入

- **Loader 註冊表**：以副檔名作為 key，每個 loader 負責「檔案 → 純文字（加上可選的頁碼等資訊）」。第一版實作 `.md` 和 `.pdf`。之後要支援音訊或影片時，只要新增一個 loader（例如用 Whisper 轉成逐字稿），後面的流程都不用改。上傳不支援的副檔名時回傳 415。
- **切段**：使用 LangChain 的 `RecursiveCharacterTextSplitter`，chunk 大小和重疊長度寫在設定裡。md 可以依標題切段，但不強制。
- **向量化**：使用 Ollama 的 `mxbai-embed-large`（1024 維）。Qdrant collection 在啟動時如果不存在，就自動建立（cosine 距離）。
- **Qdrant payload**：`doc_id`、`filename`、`chunk_index`、`text`、`page`（pdf 才有）。
- **匯入流程**：在請求內同步完成（第一版文件小，夠用）。失敗時要回滾，不可以留下一半的向量或一半的檔案。

### 6.2 管理用的文件 API（`admin` app，port 8001，需要 `X-API-Key`）

| 方法 | 路徑 | 行為 |
|---|---|---|
| POST | `/admin/documents` | multipart 上傳一個檔案 → 匯入 → 回傳文件資訊 |
| GET | `/admin/documents` | 列出所有文件 |
| GET | `/admin/documents/{id}` | 單一文件的資訊 |
| GET | `/admin/documents/{id}/file` | 下載原始檔案 |
| PUT | `/admin/documents/{id}` | 上傳新檔案取代舊的：刪掉舊向量和舊檔 → 重新匯入，`id` 不變 |
| DELETE | `/admin/documents/{id}` | 刪除向量、原始檔案和資料庫紀錄 |

Postgres 的 `documents` 資料表：`id (uuid)`、`filename`、`file_type`、`size_bytes`、`sha256`、`chunk_count`、`created_at`、`updated_at`。如果上傳的檔案和現有文件的 sha256 相同，回傳 409，並在回應中附上既有文件的 id。

### 6.3 聊天 API（公開）

- `POST /chat`：body 為 `{ "session_id": 可省略, "message": "..." }`，回傳 `{ session_id, answer, sources: [{doc_id, filename, page?}], fallback: bool }`。
- `POST /chat/stream`：輸入相同，以 SSE 回傳。事件依序為：`meta`（帶 `session_id`）→ 多個 `token` → `sources` → `done`。發生錯誤時送出 `error` 事件。
- 沒有帶 `session_id` 時，由伺服器產生一組 UUID 並回傳，之後由前端保存在 `sessionStorage`。

**處理流程**
1. 組成檢索用的查詢：如果這個 session 有歷史紀錄，就把**上一個使用者問題和這次的問題串在一起**；沒有的話，只用這次的問題。這樣像「那他之後做了什麼？」這類追問才不會一律落到 fallback，而且不需要多呼叫一次 LLM 來改寫問題。把這個查詢向量化，到 Qdrant 取出 top_k 個片段。
2. **如果所有片段的分數都低於 `score_threshold`**：不呼叫 LLM，直接回傳設定檔裡的 `fallback_message`（依訪客的語言選擇，見 §6.6），並把 `fallback` 設為 `true`。這樣做是為了從程式層面防止 bot 捏造內容。
3. 否則，把 persona 的 system prompt、檢索到的片段、Redis 裡最近 N 輪的對話、這次的問題組合成 prompt，交給 chat 模型。system prompt 必須包含「只能根據提供的資料回答；資料不足時直接說找不到」，以及「使用訪客提問的語言回答」。
4. 把這一輪的問答寫進 Redis，並寫入 Postgres 的問答紀錄。

**Redis**：key 為 `chat:{session_id}`，用 list 存放訊息。每次寫入時都把 TTL 重設為 `session_ttl_seconds`（預設 3600）。放進 prompt 的輪數上限為 `history_max_turns`。

### 6.4 問答紀錄（Postgres）

`chat_logs` 資料表：`id`、`session_id`、`question`、`answer`、`sources (jsonb)`、`fallback (bool)`、`model`、`latency_ms`、`created_at`。不記錄 IP。

`GET /admin/chat-logs`（`admin` app，需要 `X-API-Key`）支援以下查詢參數：`from`、`to`、`session_id`、`q`（在問題和回答中搜尋關鍵字）、`fallback_only`、分頁。

寫入問答紀錄失敗時，只記錄錯誤日誌，不影響回覆訪客。

### 6.5 健康檢查

`GET /health`（公開）：分別檢查 Ollama、Qdrant、Redis、Postgres 是否正常。全部正常時回傳 200；任何一項異常時回傳 503，並附上各項的狀態。回應中不能洩漏內部位址等細節。

### 6.6 設定

**`backend/config/persona.yaml`**（KLIF 之後會自己修改，先放一份中性的預設版本）：
```yaml
name: "KLIF 的助理"
voice: third_person        # third_person | first_person
tone: "親切、簡潔"
system_prompt: |
  （預設內容：介紹自己是 KLIF 個人網站的助理，只根據提供的資料回答……）
fallback_message:
  zh: "抱歉，我在文件裡找不到相關資訊。"
  en: "Sorry, I couldn't find anything about that in my documents."
  default: zh
```
fallback 的語言判斷用簡單的規則：訊息中有 CJK 字元就用 `zh`，否則用 `en`，都不符合時用 `default`。之後如果要支援更多語言，只要在 map 裡新增 key 即可。
修改後重啟 `api` 容器即可生效。設定檔用 volume 掛載到容器內，所以不需要重新 build image。

**環境變數**（`.env`，附上 `.env.example`，並把 `.env` 加入 `.gitignore`）：
`ADMIN_API_KEY`、`OLLAMA_BASE_URL`（預設 `http://host.docker.internal:11434`）、`CHAT_MODEL`（預設 `qwen2.5:7b`）、`EMBED_MODEL`（預設 `mxbai-embed-large`）、`RETRIEVAL_TOP_K`、`SCORE_THRESHOLD`、`CHUNK_SIZE`、`CHUNK_OVERLAP`、`SESSION_TTL_SECONDS`、`HISTORY_MAX_TURNS`、`CORS_ORIGINS`、`MAX_UPLOAD_MB`、`MAX_MESSAGE_CHARS`、`RATE_LIMIT_PER_MINUTE`、Postgres、Redis、Qdrant 的連線設定。

## 7. 安全性

- 管理 API 只在 `admin` app（127.0.0.1:8001）上，ngrok 不轉發，外網碰不到。整合測試要驗證：在 `api`（8000）上呼叫 `/admin/*` 會回傳 404。
- 管理 API 一律檢查 `X-API-Key`，使用常數時間比對。如果 `ADMIN_API_KEY` 沒有設定，服務直接拒絕啟動。
- 公開的聊天 API 限制請求頻率：以 IP 為單位、以 Redis 計數。在 ngrok 後面時，從 `X-Forwarded-For` 取得真實 IP。超過限制回傳 429。
- **全域的 LLM 並行上限**：8GB 的顯卡實際上一次只能跑一個生成任務，所以用 semaphore 限制同時呼叫 chat 模型的數量（`LLM_MAX_CONCURRENCY`，預設 1）。超出的請求最多排隊等待 `LLM_QUEUE_TIMEOUT_SECONDS`（預設 30 秒），等不到就回傳 503，並在 body 中說明「目前忙碌中」，讓之後的前端可以顯示給訪客看。per-IP 的 rate limit 防的是單一來源灌請求，這個上限防的是很多來源同時湧入。文件匯入只會呼叫 embedding 模型，負擔很輕，不受這個上限管制。
- 限制訊息長度（`MAX_MESSAGE_CHARS`）和上傳檔案大小（`MAX_UPLOAD_MB`）。
- CORS 只允許 `CORS_ORIGINS` 裡列出的網站來源。
- 上傳的檔名必須淨化後才能寫入磁碟，防止路徑穿越。

## 8. 測試

- 單元測試（pytest）：loaders、切段、fallback 判斷、API key 檢查、rate limit、Redis 歷史紀錄的截斷與 TTL。Ollama、Qdrant 用假物件替代。
- 整合測試：用 docker-compose 啟動後，跑一次完整流程：上傳 md 和 pdf → 提問並命中 → 問一個無關的問題並得到 fallback → 用 PUT 更新文件 → 刪除 → 查詢問答紀錄。
- 在 README 或 `backend/README.md` 寫下啟動步驟、ngrok 指令，以及 curl 範例。

## 9. 交給實作者決定的部分

- 套件管理（`requirements.txt` 或 `pyproject.toml`）、Python 版本（建議 3.11）。
- 資料表的建立方式（啟動時自動建表，或使用 Alembic）。
- rate limit 的實作細節、SSE 套件的選擇。
- `SCORE_THRESHOLD` 的初始值：用幾份真實文件實測後再調整，並在 README 記下調整的方法。

## 10. 設計時由 Claude 決定、請 KLIF 確認的事項

- Ollama 使用主機上的版本，不放進容器。
- 不能憑空回答的規則在程式層面擋下：檢索分數低於門檻時，直接回傳 fallback，不呼叫 LLM。
- 預設的 chat 模型是 `qwen2.5:7b`（中文表現較好），可以透過 `CHAT_MODEL` 改回 `llama3.1`。
- 同時提供串流和一次性回傳兩種聊天 API，回答都附上引用來源。
- Session 閒置 1 小時後過期。
- 文件資訊存在 Postgres（因為已經決定要用 Postgres 存問答紀錄，就不放在 Qdrant 的 payload 裡）。
- 同步匯入文件；sha256 相同的檔案回傳 409。
- 問答紀錄不保存 IP。
- 聊天 API 有 rate limit；API port 只綁定 127.0.0.1。
- 檢索時把上一個問題和這次的問題串在一起，用來處理追問，不額外呼叫 LLM 改寫問題。
- 全域 LLM 並行上限為 1，最多排隊 30 秒，超過回傳 503。
- `fallback_message` 改成依語言區分的 map（zh / en）。
- Ollama 連線先實際驗證，連不上時改用 `OLLAMA_HOST=0.0.0.0` 加上防火牆規則。
