# 個人網站聊天 bot 後端

FastAPI + LangChain + Ollama + Qdrant + Redis + Postgres，用 docker-compose 啟動。
設計文件：[docs/superpowers/specs/2026-10-26-chatbot-backend-design.md](../docs/superpowers/specs/2026-10-26-chatbot-backend-design.md)

| 服務 | 位址 | 用途 | 對外 |
|---|---|---|---|
| `api` | `127.0.0.1:8000` | 聊天 API、`/health` | ngrok 只轉發這個 |
| `admin` | `127.0.0.1:8001` | 文件 CRUD、問答紀錄 | 只能在本機使用 |
| `qdrant` / `redis` / `postgres` | 只在 compose 內部網路 | 向量、session 記憶、文件資訊與問答紀錄 | 不公開 |

## 前置需求

- Docker Desktop
- 主機上的 Ollama，並下載好兩個模型：
  ```powershell
  ollama pull llama3.1
  ollama pull mxbai-embed-large
  ```

容器透過 `host.docker.internal:11434` 連到主機上的 Ollama。這台電腦已經驗證過：使用 Ollama 預設的 `127.0.0.1` 綁定，容器就能連得到，不需要額外設定。

如果之後換了機器連不上，可以用下面的指令檢查：
```powershell
docker run --rm curlimages/curl:8.10.1 -s http://host.docker.internal:11434/api/version
```
連不上時的備案：把系統環境變數 `OLLAMA_HOST` 設為 `0.0.0.0` 後重開 Ollama，並封鎖區網對 11434 port 的連入，避免 Ollama 暴露在區網中。下面的指令需要用系統管理員身分執行：
```powershell
New-NetFirewallRule -DisplayName "Block Ollama from LAN" -Direction Inbound -Protocol TCP -LocalPort 11434 -RemoteAddress LocalSubnet -Action Block
```

## 啟動

```powershell
cd backend
copy .env.example .env      # 然後在 .env 填入 ADMIN_API_KEY（一組長的隨機字串）
docker compose up -d --build
docker compose ps           # 等 qdrant / redis / postgres 顯示 healthy
```

對外開放（**只轉發 8000**）：
```powershell
ngrok http 127.0.0.1:8000
```
`ADMIN_API_KEY` 必須至少 16 個字元，留空時服務會拒絕啟動。

記得把網站的網址加進 `.env` 的 `CORS_ORIGINS`（多個網址以逗號分隔），然後執行 `docker compose up -d` 套用設定。

## API

### 聊天（公開，port 8000）

```bash
# 一次性回傳
curl -X POST http://127.0.0.1:8000/chat -H "Content-Type: application/json" \
  -d '{"message": "KLIF 做過哪些專案？"}'
# → {"session_id": "...", "answer": "...", "sources": [{"doc_id", "filename", "page"}], "fallback": false}

# 串流（SSE）：事件依序為 meta → token… → sources → done；出錯時送出 error
curl -N -X POST http://127.0.0.1:8000/chat/stream -H "Content-Type: application/json" \
  -d '{"session_id": "上一次回傳的 session_id", "message": "那之後呢？"}'

curl http://127.0.0.1:8000/health   # 全部正常 200，否則 503
```

錯誤代碼：`422` 訊息為空或太長、`429` 太頻繁（每個 IP 每分鐘 `RATE_LIMIT_PER_MINUTE` 次）、`503 {"detail":"busy"}` GPU 忙碌中、`503 {"detail":"unavailable"}` Ollama 沒有回應。

### 管理（只限本機，port 8001，需要 `X-API-Key`）

```bash
KEY=你的 ADMIN_API_KEY
curl -H "X-API-Key: $KEY" -F "file=@履歷.pdf" http://127.0.0.1:8001/admin/documents        # 新增
curl -H "X-API-Key: $KEY" http://127.0.0.1:8001/admin/documents                            # 列表
curl -H "X-API-Key: $KEY" http://127.0.0.1:8001/admin/documents/<id>                       # 單一文件
curl -H "X-API-Key: $KEY" -OJ http://127.0.0.1:8001/admin/documents/<id>/file              # 下載原始檔
curl -H "X-API-Key: $KEY" -X PUT -F "file=@履歷-v2.pdf" http://127.0.0.1:8001/admin/documents/<id>  # 更新
curl -H "X-API-Key: $KEY" -X DELETE http://127.0.0.1:8001/admin/documents/<id>             # 刪除
curl -H "X-API-Key: $KEY" "http://127.0.0.1:8001/admin/chat-logs?q=MQTT&fallback_only=false&limit=50"
```

上傳的錯誤代碼：`415` 不支援的檔案類型（目前支援 `.md`、`.pdf`）、`422` 無法讀取，或擷取不到文字（例如掃描版 PDF）、`409` 內容和現有文件相同（回應中附上 `existing_id`）、`413` 檔案超過 `MAX_UPLOAD_MB`、`503` Ollama 沒有回應（請確認 Ollama 已啟動）。

`chat-logs` 的查詢參數：`from`、`to`（ISO 8601）、`session_id`、`q`（在問題和回答中搜尋關鍵字）、`fallback_only`、`limit`（1–200）、`offset`。

## 修改 bot 的個性

編輯 [config/persona.yaml](config/persona.yaml)，改完執行：
```powershell
docker compose restart api
```

## 調整 `SCORE_THRESHOLD`

檢索到的片段相似度如果都低於這個門檻，bot 會直接回覆 fallback 訊息，不呼叫 LLM。目前的門檻是 **0.6**，是用 `mxbai-embed-large` 實測後決定的：

| 問題 | 相似度 |
|---|---|
| 具體的相關問題（中英文） | 0.68 – 0.80 |
| 無關問題 | 0.36 – 0.56 |
| 很籠統的相關問題（例如「用過哪些語言？」） | 約 0.53 → 會回 fallback |

調整方式：
- 常常回「找不到」，但文件裡其實有答案 → 調低門檻（例如 0.55）。
- bot 會回答無關的問題 → 調高門檻。

修改 `.env` 的 `SCORE_THRESHOLD` 後，執行 `docker compose up -d` 套用。可以到 `/admin/chat-logs?fallback_only=true` 查看哪些問題觸發了 fallback，作為調整的依據。執行 `scripts/smoke.py` 也會印出一組相關、無關問題的分數供參考。

## 測試

```powershell
cd backend
python3 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
.\.venv\Scripts\python -m pytest            # 單元測試（Postgres 相關的會 skip）
```

用真的 Postgres 跑 repository 測試：
```powershell
docker run -d --rm --name pg-test -e POSTGRES_PASSWORD=t -p 127.0.0.1:55432:5432 postgres:16-alpine
$env:TEST_DATABASE_URL="postgresql://postgres:t@127.0.0.1:55432/postgres"
.\.venv\Scripts\python -m pytest tests/test_repos.py
docker stop pg-test
```

端到端測試（需要先 `docker compose up -d`）：
```powershell
.\.venv\Scripts\python scripts/smoke.py    # 全部通過時印出 ALL OK
```
腳本會上傳兩份測試文件，測完後刪除；它產生的問答紀錄會留在 Postgres 裡，session_id 以 `smoke-` 開頭。
