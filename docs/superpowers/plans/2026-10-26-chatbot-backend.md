# 聊天 bot 後端 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為個人網站建立一個 RAG 聊天 bot 後端：提供公開的聊天 API（ngrok 對外），以及只限本機存取的文件管理 / 問答紀錄 API，並用 docker-compose 一鍵啟動。

**Architecture:** 同一份 Python 程式碼產生兩個 FastAPI app。`api`（port 8000，聊天 + 健康檢查）透過 ngrok 對外；`admin`（port 8001，文件 CRUD + 問答紀錄）只綁定本機。業務邏輯放在 `service/`，HTTP 層放在 `controller/`。所有外部依賴（Ollama、Qdrant、Redis、Postgres）都包在小型類別或 Protocol 後面，單元測試時用假物件替換。

**Tech Stack:** Python 3.11（容器）/ 3.10（本機 venv）、FastAPI、uvicorn、pydantic-settings、LangChain（`langchain-ollama`、`langchain-text-splitters`）、qdrant-client（async）、redis.asyncio、asyncpg、pypdf、sse-starlette、PyYAML；測試用 pytest、pytest-asyncio、httpx、fakeredis、fpdf2。

**Spec:** `docs/superpowers/specs/2026-10-26-chatbot-backend-design.md`

## Global Constraints

- 所有程式碼、`docker-compose.yml`、`Dockerfile`、`.env.example` 都放在 `backend/` 底下；所有指令都在 `backend/` 目錄執行。
- 程式碼必須能在 Python 3.10 和 3.11 上執行（本機測試用 `python3` 3.10 建立 `.venv`，容器使用 3.11）。
- 不要修改 `backend/service/LangChain.py`。
- Ollama 在主機上，預設 `OLLAMA_BASE_URL=http://host.docker.internal:11434`；預設 `CHAT_MODEL=qwen2.5:7b`、`EMBED_MODEL=mxbai-embed-large`（1024 維，`EMBED_DIM=1024`）。
- `api` 只公開 `127.0.0.1:8000`，`admin` 只公開 `127.0.0.1:8001`；Qdrant / Redis / Postgres 不公開任何 port。`api` app **完全不掛載** `/admin/*` 路由。
- 管理 API 用 `X-API-Key` 驗證，使用 `hmac.compare_digest`；沒有設定 `ADMIN_API_KEY` 時服務拒絕啟動。
- 預設值：`SESSION_TTL_SECONDS=3600`、`HISTORY_MAX_TURNS=6`、`RETRIEVAL_TOP_K=4`、`SCORE_THRESHOLD=0.5`（暫定值，Task 12 實測後再調整）、`CHUNK_SIZE=800`、`CHUNK_OVERLAP=100`、`MAX_UPLOAD_MB=20`、`MAX_MESSAGE_CHARS=1000`、`RATE_LIMIT_PER_MINUTE=10`、`LLM_MAX_CONCURRENCY=1`、`LLM_QUEUE_TIMEOUT_SECONDS=30`。
- 問答紀錄不記錄 IP。寫入問答紀錄失敗只記 log，不能影響回覆訪客。
- 檢索分數低於門檻時，**不呼叫 LLM**，直接回傳 persona 裡依語言選出的 `fallback_message`。
- 每個 commit 訊息結尾加上 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

- **掃描版 PDF（沒有可擷取的文字）**：應該回傳 422「沒有擷取到文字」，不能存成一份 0 段的文件。→ Task 6 `test_create_rejects_document_without_text`
- **訪客在串流途中關掉頁面**：semaphore 必須被釋放，否則之後所有人都會收到「忙碌中」。→ Task 8 `test_release_after_abandoned_stream`
- **Ollama 沒開或中途掛掉**：應該回傳 503，或送出 SSE `error` 事件，不能出現 500 或連線卡住。→ Task 8 `test_embedding_failure_raises_upstream_unavailable`、Task 10 `test_stream_emits_error_event_when_llm_fails_midway`
- **非 UTF-8 的 md 檔（Big5）或帶 BOM 的檔案**：帶 BOM 要能正常讀取；無法解碼時回傳 422，不能產生亂碼。→ Task 3 `test_md_with_bom`、`test_md_non_utf8_is_unreadable`
- **中文檔名、或像 `../../x.md` 這種檔名**：中文檔名要原樣保留，下載時檔名正確；路徑部分要去掉，不能寫到 upload 目錄之外。→ Task 6 `test_sanitize_filename`、Task 11 `test_download_returns_original_unicode_filename`

---

## 檔案結構

```
backend/
  requirements.txt / requirements-dev.txt / pytest.ini / .env.example / .gitignore
  settings.py                 Settings（環境變數）
  main.py                     create_public_app() / create_admin_app()
  config/persona.yaml         bot 個性（KLIF 之後自己改）
  controller/
    security.py               API key 檢查、client_ip、RateLimiter
    chat.py                   POST /chat、POST /chat/stream
    health.py                 GET /health
    admin_documents.py        /admin/documents CRUD
    admin_logs.py             GET /admin/chat-logs
  service/
    persona.py                Persona、load_persona、detect_lang
    loaders/__init__.py       LoadedPage、get_loader、錯誤類別、md / pdf loader
    chunking.py               Chunk、split_pages
    vector_store.py           VectorStore、Hit
    models.py                 DocumentRecord、ChatLogEntry、ChatLogRecord、LogQuery
    repos/base.py             DocumentRepo、ChatLogRepo（Protocol）
    repos/memory.py           記憶體版實作（測試用）
    repos/postgres.py         asyncpg 實作 + init_schema
    ingestion.py              IngestionService、sanitize_filename
    history.py                SessionHistory
    chat.py                   ChatService、ChatTurn、build_messages
    health.py                 HealthChecker
    container.py              Services、build_services、close_services
  tests/                      每個模組對應一個 test_*.py
  scripts/smoke.py            docker-compose 啟動後的端到端驗證
  Dockerfile / docker-compose.yml / README.md
```

---

### Task 1: 專案骨架與設定

**Files:**
- Create: `backend/requirements.txt`、`backend/requirements-dev.txt`、`backend/pytest.ini`、`backend/.env.example`、`backend/.gitignore`、`backend/settings.py`、`backend/controller/__init__.py`、`backend/service/__init__.py`、`backend/tests/__init__.py`、`backend/tests/conftest.py`
- Test: `backend/tests/test_settings.py`

**Interfaces:**
- Produces: `settings.Settings`（pydantic-settings `BaseSettings`，欄位名稱為 Global Constraints 列出的環境變數轉成小寫，另外加上 `admin_api_key: SecretStr`（必填）、`qdrant_url="http://qdrant:6333"`、`qdrant_collection="documents"`、`redis_url="redis://redis:6379/0"`、`database_url="postgresql://chatbot:chatbot@postgres:5432/chatbot"`、`upload_dir: Path=Path("/data/uploads")`、`persona_path: Path=Path("config/persona.yaml")`、`cors_origins: str=""`）；屬性 `cors_origin_list -> list[str]`（以逗號切開、去除空白、去掉空字串）；`get_settings() -> Settings`（`lru_cache`）。
- Produces: `tests/conftest.py` 的 fixture `settings`，回傳 `Settings(_env_file=None, admin_api_key="test-admin-key-0123456789", upload_dir=tmp_path / "uploads")`。

- [ ] **Step 1: 建立本機 venv 並安裝依賴**

`requirements.txt`：`fastapi`、`uvicorn[standard]`、`pydantic-settings`、`langchain-core`、`langchain-ollama`、`langchain-text-splitters`、`qdrant-client`、`redis`、`asyncpg`、`pypdf`、`sse-starlette`、`python-multipart`、`pyyaml`、`httpx`（全部固定確切版本，使用當下可用的最新穩定版）。`requirements-dev.txt`：`-r requirements.txt`、`pytest`、`pytest-asyncio`、`fakeredis`、`fpdf2`。`pytest.ini`：`asyncio_mode = auto`、`testpaths = tests`、`markers = integration: needs real Postgres (TEST_DATABASE_URL)`。`.gitignore`：`.venv/`、`.env`、`__pycache__/`、`data/`。

Run: `python3 -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt`
Expected: 安裝成功，沒有錯誤

- [ ] **Step 2: 寫失敗的測試**

```python
import pytest
from pydantic import ValidationError
from settings import Settings

def test_missing_admin_key_refuses_to_start(monkeypatch):
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)

def test_defaults(settings):
    assert settings.ollama_base_url == "http://host.docker.internal:11434"
    assert settings.chat_model == "qwen2.5:7b"
    assert settings.embed_model == "mxbai-embed-large"
    assert settings.embed_dim == 1024
    assert settings.session_ttl_seconds == 3600
    assert settings.llm_max_concurrency == 1
    assert settings.llm_queue_timeout_seconds == 30

def test_cors_origin_list():
    s = Settings(_env_file=None, admin_api_key="x" * 20, cors_origins=" https://a.com, ,https://b.com ")
    assert s.cors_origin_list == ["https://a.com", "https://b.com"]
```

- [ ] **Step 3: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_settings.py -v`
Expected: FAIL（`ModuleNotFoundError: settings`）

- [ ] **Step 4: 實作 `settings.py` 和 `conftest.py`，並寫好 `.env.example`（列出所有變數和預設值，`ADMIN_API_KEY=` 留空並加註解「請填一組長的隨機字串」）**

- [ ] **Step 5: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_settings.py -v`
Expected: 3 passed

- [ ] **Step 6: 驗證容器能連到主機上的 Ollama（spec §3）**

先確認 Docker Desktop 已啟動。
Run: `docker run --rm curlimages/curl:8.10.1 -s -m 5 http://host.docker.internal:11434/api/version`
Expected: `{"version":"..."}`。如果連不上，**停下來回報給 KLIF**，不要自行修改主機的 `OLLAMA_HOST` 或防火牆設定；將結果記下來，留給 Task 12 的 README 使用。

- [ ] **Step 7: Commit**

```bash
git add backend/requirements*.txt backend/pytest.ini backend/.env.example backend/.gitignore backend/settings.py backend/controller/__init__.py backend/service/__init__.py backend/tests
git commit -m "feat(backend): project scaffold and settings"
```

---

### Task 2: Persona 設定

**Files:**
- Create: `backend/service/persona.py`、`backend/config/persona.yaml`
- Test: `backend/tests/test_persona.py`

**Interfaces:**
- Produces: `detect_lang(text: str) -> Literal["zh", "en"]`（只要包含任何 CJK 字元，範圍 `\u3400-\u9fff`、`\uf900-\ufaff`，就回傳 `"zh"`）。
- Produces: `class Persona(BaseModel)`：`name: str`、`voice: Literal["third_person", "first_person"]`、`tone: str`、`system_prompt: str`、`fallback_message: dict[str, str]`（必須有 `default` key，值必須是 map 裡另一個 key，否則 `ValidationError`）；方法 `fallback_for(message: str) -> str`（依 `detect_lang` 的結果選擇，沒有對應的語言時用 `default`）、`render_system_prompt() -> str`。
- Produces: `load_persona(path: Path) -> Persona`

- [ ] **Step 1: 寫失敗的測試**

```python
from pathlib import Path
import pytest
from pydantic import ValidationError
from service.persona import Persona, detect_lang, load_persona

def make(**kw):
    base = dict(name="KLIF 的助理", voice="third_person", tone="親切", system_prompt="你是助理。",
                fallback_message={"zh": "找不到", "en": "Not found", "default": "zh"})
    return Persona(**{**base, **kw})

def test_detect_lang():
    assert detect_lang("你好 hello") == "zh"
    assert detect_lang("What did he build?") == "en"

def test_fallback_for_picks_language():
    p = make()
    assert p.fallback_for("他做過什麼？") == "找不到"
    assert p.fallback_for("What projects?") == "Not found"

def test_fallback_uses_default_when_language_missing():
    p = make(fallback_message={"zh": "找不到", "default": "zh"})
    assert p.fallback_for("What projects?") == "找不到"

def test_default_must_reference_existing_key():
    with pytest.raises(ValidationError):
        make(fallback_message={"zh": "找不到", "default": "ja"})

def test_render_system_prompt_contains_rules():
    out = make(voice="first_person").render_system_prompt()
    assert "你是助理。" in out and "KLIF 的助理" in out
    assert "first person" in out.lower() or "第一人稱" in out

def test_shipped_persona_file_loads():
    assert load_persona(Path("config/persona.yaml")).fallback_for("hi")
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_persona.py -v`
Expected: FAIL（`ModuleNotFoundError`）

- [ ] **Step 3: 實作 `service/persona.py`，並建立 `config/persona.yaml`**

`render_system_prompt()` 的組成依序是：`system_prompt`、一行說明名字 / 人稱（`voice`）/ 語氣，再接上固定的規則段落（寫成程式裡的常數）：「只能根據〈資料〉區塊回答；資料不足時直接說找不到，不要猜測；使用與訪客提問相同的語言回答。」`persona.yaml` 的內容照 spec §6.6（name、voice、tone、中性的 system_prompt、zh / en / default 的 fallback_message），並在檔案開頭加上註解，說明每個欄位的用途、修改後要重啟 `api` 容器。

- [ ] **Step 4: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_persona.py -v`
Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add backend/service/persona.py backend/config/persona.yaml backend/tests/test_persona.py
git commit -m "feat(backend): persona config with per-language fallback"
```

---

### Task 3: 檔案 loader 與切段

**Files:**
- Create: `backend/service/loaders/__init__.py`、`backend/service/chunking.py`
- Test: `backend/tests/test_loaders.py`、`backend/tests/test_chunking.py`

**Interfaces:**
- Produces: `@dataclass(frozen=True) class LoadedPage: text: str; page: int | None`
- Produces: `Loader = Callable[[bytes], list[LoadedPage]]`；`LOADERS: dict[str, Loader]`（key 是小寫副檔名 `.md`、`.pdf`）；`get_loader(filename: str) -> Loader`
- Produces: 例外 `UnsupportedFileType(Exception)`、`UnreadableFile(Exception)`
- Produces: `@dataclass(frozen=True) class Chunk: text: str; chunk_index: int; page: int | None`；`split_pages(pages: list[LoadedPage], chunk_size: int, chunk_overlap: int) -> list[Chunk]`

- [ ] **Step 1: 寫失敗的測試**

```python
# tests/test_loaders.py
import pytest
from fpdf import FPDF
from service.loaders import get_loader, UnsupportedFileType, UnreadableFile

def make_pdf(pages: list[str]) -> bytes:
    pdf = FPDF()
    for text in pages:
        pdf.add_page(); pdf.set_font("helvetica", size=12); pdf.cell(text=text)
    return bytes(pdf.output())

def test_md_with_bom():
    pages = get_loader("a.MD")("\ufeff# 標題\n內容".encode("utf-8"))
    assert pages[0].text.startswith("# 標題") and pages[0].page is None

def test_md_non_utf8_is_unreadable():
    with pytest.raises(UnreadableFile):
        get_loader("a.md")("中文".encode("big5"))

def test_pdf_pages_are_one_based_and_blank_pages_skipped():
    pages = get_loader("cv.pdf")(make_pdf(["Hello page one", "", "Page three"]))
    assert [p.page for p in pages] == [1, 3]

def test_corrupt_pdf_is_unreadable():
    with pytest.raises(UnreadableFile):
        get_loader("x.pdf")(b"not a pdf")

def test_unsupported_extension():
    with pytest.raises(UnsupportedFileType):
        get_loader("song.mp3")
```

```python
# tests/test_chunking.py
from service.loaders import LoadedPage
from service.chunking import split_pages

def test_chunks_are_indexed_sequentially_and_keep_page():
    pages = [LoadedPage("a" * 50, 1), LoadedPage("b" * 50, 2)]
    chunks = split_pages(pages, chunk_size=20, chunk_overlap=0)
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))
    assert {c.page for c in chunks} == {1, 2}
    assert all(len(c.text) <= 20 for c in chunks)

def test_whitespace_only_pages_produce_no_chunks():
    assert split_pages([LoadedPage("   \n", None)], 100, 10) == []
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_loaders.py tests/test_chunking.py -v`
Expected: FAIL（`ModuleNotFoundError`）

- [ ] **Step 3: 實作**

md loader 用 `utf-8-sig` 解碼，遇到 `UnicodeDecodeError` 時改丟 `UnreadableFile`。pdf loader 用 `pypdf.PdfReader(BytesIO(data))` 逐頁 `extract_text()`，跳過去除空白後為空的頁面；`PdfReadError` 或其他解析錯誤一律轉成 `UnreadableFile`。`split_pages` 對每一頁使用 `RecursiveCharacterTextSplitter(chunk_size, chunk_overlap)`，`chunk_index` 跨頁連續編號。

- [ ] **Step 4: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_loaders.py tests/test_chunking.py -v`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add backend/service/loaders backend/service/chunking.py backend/tests/test_loaders.py backend/tests/test_chunking.py
git commit -m "feat(backend): md/pdf loaders and chunking"
```

---

### Task 4: Qdrant 向量庫

**Files:**
- Create: `backend/service/vector_store.py`
- Test: `backend/tests/test_vector_store.py`

**Interfaces:**
- Consumes: `Chunk`（Task 3）
- Produces: `@dataclass(frozen=True) class Hit: doc_id: str; filename: str; chunk_index: int; page: int | None; text: str; score: float`
- Produces: `class VectorStore(client: AsyncQdrantClient, collection: str, dim: int)`，方法：`async ensure_collection() -> None`（不存在時才建立，使用 cosine 距離）、`async upsert(doc_id: str, filename: str, chunks: list[Chunk], vectors: list[list[float]]) -> None`（point id 為 `uuid5(NAMESPACE_URL, f"{doc_id}:{chunk_index}")`，payload 包含 `doc_id`、`filename`、`chunk_index`、`page`、`text`）、`async delete_doc(doc_id: str) -> None`（以 payload 的 `doc_id` 篩選刪除）、`async search(vector: list[float], top_k: int) -> list[Hit]`（依分數由高到低排序）、`async ping() -> bool`（任何例外都回傳 False）

- [ ] **Step 1: 寫失敗的測試**（fixture：`AsyncQdrantClient(location=":memory:")`、`dim=4`，每個測試前先呼叫 `ensure_collection()`）

```python
async def test_ensure_collection_is_idempotent(store):
    await store.ensure_collection()  # second call must not raise

async def test_upsert_then_search_returns_best_first(store):
    chunks = [Chunk("alpha", 0, 1), Chunk("beta", 1, 2)]
    await store.upsert("d1", "cv.pdf", chunks, [[1, 0, 0, 0], [0, 1, 0, 0]])
    hits = await store.search([1, 0, 0, 0], top_k=2)
    assert hits[0].text == "alpha" and hits[0].page == 1 and hits[0].filename == "cv.pdf"
    assert hits[0].score >= hits[1].score

async def test_delete_doc_removes_only_that_doc(store):
    await store.upsert("d1", "a.md", [Chunk("a", 0, None)], [[1, 0, 0, 0]])
    await store.upsert("d2", "b.md", [Chunk("b", 0, None)], [[1, 0, 0, 0]])
    await store.delete_doc("d1")
    assert {h.doc_id for h in await store.search([1, 0, 0, 0], 10)} == {"d2"}

async def test_ping(store):
    assert await store.ping() is True
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_vector_store.py -v`
Expected: FAIL（`ModuleNotFoundError`）

- [ ] **Step 3: 實作 `service/vector_store.py`**

- [ ] **Step 4: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_vector_store.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/service/vector_store.py backend/tests/test_vector_store.py
git commit -m "feat(backend): qdrant vector store wrapper"
```

---

### Task 5: 資料模型與 Repository（Postgres + 記憶體版）

**Files:**
- Create: `backend/service/models.py`、`backend/service/repos/__init__.py`、`backend/service/repos/base.py`、`backend/service/repos/memory.py`、`backend/service/repos/postgres.py`
- Test: `backend/tests/test_repos.py`

**Interfaces:**
- Produces（`service/models.py`，皆為 dataclass）：
  - `DocumentRecord(id: UUID, filename: str, file_type: str, size_bytes: int, sha256: str, chunk_count: int, created_at: datetime, updated_at: datetime)`
  - `ChatLogEntry(session_id: str, question: str, answer: str, sources: list[dict], fallback: bool, model: str, latency_ms: int)`
  - `ChatLogRecord(id: int, created_at: datetime, + ChatLogEntry 的所有欄位)`
  - `LogQuery(from_: datetime | None = None, to: datetime | None = None, session_id: str | None = None, q: str | None = None, fallback_only: bool = False, limit: int = 50, offset: int = 0)`
- Produces（`repos/base.py`，Protocol）：
  - `DocumentRepo`：`async add(rec) -> None`、`async update(rec) -> None`、`async get(id: UUID) -> DocumentRecord | None`、`async get_by_sha256(sha: str) -> DocumentRecord | None`、`async list() -> list[DocumentRecord]`（依 `created_at` 由新到舊）、`async delete(id: UUID) -> bool`、`async ping() -> bool`
  - `ChatLogRepo`：`async add(entry: ChatLogEntry) -> None`、`async query(q: LogQuery) -> list[ChatLogRecord]`（由新到舊；`q` 不分大小寫，比對 question 或 answer）、`async ping() -> bool`
- Produces：`InMemoryDocumentRepo`、`InMemoryChatLogRepo`（`repos/memory.py`）；`PgDocumentRepo(pool)`、`PgChatLogRepo(pool)`、`async init_schema(pool: asyncpg.Pool) -> None`（`repos/postgres.py`，使用 `CREATE TABLE IF NOT EXISTS`，資料表 `documents`、`chat_logs`，欄位照 spec §6.2 / §6.4，`sources` 為 `jsonb`，`chat_logs.created_at` 加上索引）

- [ ] **Step 1: 寫失敗的測試**

用同一組合約測試，參數化跑兩種實作：`memory`，以及 `postgres`（只有設定環境變數 `TEST_DATABASE_URL` 時才執行，加上 `@pytest.mark.integration`；fixture 執行 `init_schema` 並在每個測試前 `TRUNCATE` 兩張表）。

```python
async def test_document_crud(doc_repo):
    rec = make_doc(sha256="abc")
    await doc_repo.add(rec)
    assert (await doc_repo.get(rec.id)).filename == rec.filename
    assert (await doc_repo.get_by_sha256("abc")).id == rec.id
    await doc_repo.update(replace(rec, chunk_count=9))
    assert (await doc_repo.get(rec.id)).chunk_count == 9
    assert await doc_repo.delete(rec.id) is True
    assert await doc_repo.get(rec.id) is None
    assert await doc_repo.delete(rec.id) is False

async def test_log_query_filters(log_repo):
    await log_repo.add(make_log(session_id="s1", question="MQTT 是什麼", fallback=False))
    await log_repo.add(make_log(session_id="s2", question="weather?", fallback=True))
    assert [r.session_id for r in await log_repo.query(LogQuery(q="mqtt"))] == ["s1"]
    assert [r.session_id for r in await log_repo.query(LogQuery(fallback_only=True))] == ["s2"]
    assert [r.session_id for r in await log_repo.query(LogQuery(session_id="s2"))] == ["s2"]
    assert len(await log_repo.query(LogQuery(limit=1))) == 1
    assert (await log_repo.query(LogQuery()))[0].session_id == "s2"  # newest first
```

（`make_doc` / `make_log` 是測試檔裡的小工具，用來填入其餘欄位。）

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_repos.py -v`
Expected: FAIL（`ModuleNotFoundError`）

- [ ] **Step 3: 實作 models、Protocol、記憶體版與 Postgres 版**

- [ ] **Step 4: 執行測試（記憶體版）**

Run: `.venv/Scripts/python -m pytest tests/test_repos.py -v`
Expected: memory 版 passed，postgres 版 skipped

- [ ] **Step 5: 用真的 Postgres 執行一次測試**

Run: `docker run -d --rm --name pg-test -e POSTGRES_PASSWORD=t -p 127.0.0.1:55432:5432 postgres:16-alpine`，等容器就緒後執行 `TEST_DATABASE_URL=postgresql://postgres:t@127.0.0.1:55432/postgres .venv/Scripts/python -m pytest tests/test_repos.py -v`，最後 `docker stop pg-test`
Expected: 全部 passed（包含 postgres 參數）

- [ ] **Step 6: Commit**

```bash
git add backend/service/models.py backend/service/repos backend/tests/test_repos.py
git commit -m "feat(backend): document and chat-log repositories"
```

---

### Task 6: 文件匯入服務

**Files:**
- Create: `backend/service/ingestion.py`
- Test: `backend/tests/test_ingestion.py`

**Interfaces:**
- Consumes: `get_loader`、`UnsupportedFileType`、`UnreadableFile`（Task 3）、`split_pages`（Task 3）、`VectorStore`（Task 4）、`DocumentRepo`、`DocumentRecord`（Task 5）、LangChain `Embeddings`（`aembed_documents`）
- Produces: `sanitize_filename(name: str) -> str`（同時處理 `/` 和 `\` 並只取 basename，去掉控制字元，保留 unicode；結果為空、`.` 或 `..` 時回傳 `"file"`）
- Produces: 例外 `DocumentNotFound(doc_id)`、`DuplicateDocument(existing_id: UUID)`、`EmptyDocument`
- Produces: `class IngestionService(upload_dir: Path, embeddings: Embeddings, store: VectorStore, repo: DocumentRepo, chunk_size: int, chunk_overlap: int)`，方法：`async create(filename: str, data: bytes) -> DocumentRecord`、`async replace(doc_id: UUID, filename: str, data: bytes) -> DocumentRecord`、`async delete(doc_id: UUID) -> None`、`async get(doc_id: UUID) -> DocumentRecord`（找不到時丟 `DocumentNotFound`）、`async list() -> list[DocumentRecord]`、`file_path(rec: DocumentRecord) -> Path`（`upload_dir / str(rec.id) / rec.filename`）

- [ ] **Step 1: 寫失敗的測試**（fixture：`DeterministicFakeEmbedding(size=4)`、Task 4 的 memory Qdrant `dim=4`、`InMemoryDocumentRepo`、`tmp_path`；`chunk_size=200`、`chunk_overlap=0`）

```python
def test_sanitize_filename():
    assert sanitize_filename("../../evil.md") == "evil.md"
    assert sanitize_filename("C:\\x\\中文 履歷.pdf") == "中文 履歷.pdf"
    assert sanitize_filename("..") == "file"

async def test_create_stores_file_vectors_and_record(svc, store):
    rec = await svc.create("notes.md", "# Hi\nMQTT broker work".encode())
    assert rec.chunk_count >= 1 and rec.file_type == ".md"
    assert svc.file_path(rec).read_bytes().startswith(b"# Hi")
    assert {h.doc_id for h in await store.search([1, 0, 0, 0], 10)} == {str(rec.id)}

async def test_duplicate_content_is_rejected(svc):
    rec = await svc.create("a.md", b"same")
    with pytest.raises(DuplicateDocument) as e:
        await svc.create("b.md", b"same")
    assert e.value.existing_id == rec.id

async def test_create_rejects_document_without_text(svc, repo, tmp_path):
    with pytest.raises(EmptyDocument):
        await svc.create("blank.md", b"   \n")
    assert await repo.list() == [] and not any((tmp_path / "uploads").rglob("*.*"))

async def test_failure_during_upsert_leaves_nothing_behind(svc_with_failing_store, repo, tmp_path):
    with pytest.raises(RuntimeError):
        await svc_with_failing_store.create("a.md", b"text")
    assert await repo.list() == [] and not any((tmp_path / "uploads").rglob("*.*"))

async def test_replace_keeps_id_and_swaps_content(svc, store):
    rec = await svc.create("a.md", b"old content")
    new = await svc.replace(rec.id, "a2.md", b"new content")
    assert new.id == rec.id and new.filename == "a2.md" and new.updated_at >= rec.updated_at
    texts = {h.text for h in await store.search([1, 0, 0, 0], 10)}
    assert texts == {"new content"}
    assert not (svc.file_path(rec)).exists() or svc.file_path(rec) == svc.file_path(new)

async def test_replace_with_unreadable_file_keeps_old_version(svc, store):
    rec = await svc.create("a.md", b"old content")
    with pytest.raises(UnreadableFile):
        await svc.replace(rec.id, "a.md", "壞".encode("big5"))
    assert {h.text for h in await store.search([1, 0, 0, 0], 10)} == {"old content"}

async def test_delete_removes_everything(svc, store, repo):
    rec = await svc.create("a.md", b"x")
    await svc.delete(rec.id)
    assert await repo.get(rec.id) is None and not svc.file_path(rec).exists()
    assert await store.search([1, 0, 0, 0], 10) == []
    with pytest.raises(DocumentNotFound):
        await svc.delete(rec.id)
```

（`svc_with_failing_store` 這個 fixture 使用一個 `upsert` 會丟出 `RuntimeError` 的 VectorStore 子類別。）

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_ingestion.py -v`
Expected: FAIL（`ModuleNotFoundError`）

- [ ] **Step 3: 實作 `service/ingestion.py`**

`create` 的順序：淨化檔名 → 檢查 sha256 是否重複 → 載入並切段（沒有任何 chunk 時丟 `EmptyDocument`）→ embedding → 寫入檔案 → `store.upsert` → `repo.add`。在寫入檔案之後，任何一步失敗都要執行 `store.delete_doc` 並刪除 `upload_dir/<id>` 整個目錄，然後重新丟出原本的例外。`replace` 的順序：確認文件存在 → 檢查 sha256 是否和**其他**文件重複 → 先完成新內容的載入、切段和 embedding（這段失敗時，舊版本完全不受影響）→ `store.delete_doc` → `upsert` → 用新檔案取代舊目錄的內容 → `repo.update`（`id`、`created_at` 不變，`updated_at` 更新為現在時間）。

- [ ] **Step 4: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_ingestion.py -v`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add backend/service/ingestion.py backend/tests/test_ingestion.py
git commit -m "feat(backend): document ingestion with rollback and replace"
```

---

### Task 7: Session 對話歷史（Redis）

**Files:**
- Create: `backend/service/history.py`
- Test: `backend/tests/test_history.py`

**Interfaces:**
- Produces: `class SessionHistory(redis: redis.asyncio.Redis, ttl_seconds: int, max_turns: int)`，方法：`async get(session_id: str) -> list[tuple[str, str]]`（每個元素為 `(role, content)`，role 是 `"human"` 或 `"ai"`，依時間順序排列）、`async last_question(session_id: str) -> str | None`、`async append_turn(session_id: str, question: str, answer: str) -> None`、`async ping() -> bool`
- Redis key 為 `chat:{session_id}`，用 list 存放 JSON 字串；每次 append 後 `LTRIM` 只保留最後 `2 * max_turns` 筆，並重設 `EXPIRE ttl_seconds`

- [ ] **Step 1: 寫失敗的測試**（fixture：`fakeredis.aioredis.FakeRedis(decode_responses=True)`、`ttl_seconds=3600`、`max_turns=2`）

```python
async def test_empty_session(history):
    assert await history.get("nope") == [] and await history.last_question("nope") is None

async def test_append_and_get_in_order(history):
    await history.append_turn("s", "q1", "a1")
    assert await history.get("s") == [("human", "q1"), ("ai", "a1")]
    assert await history.last_question("s") == "q1"

async def test_trims_to_max_turns(history):
    for i in range(3):
        await history.append_turn("s", f"q{i}", f"a{i}")
    assert [c for _, c in await history.get("s")] == ["q1", "a1", "q2", "a2"]

async def test_ttl_is_set_and_refreshed(history, redis):
    await history.append_turn("s", "q", "a")
    await redis.expire("chat:s", 5)
    await history.append_turn("s", "q", "a")
    assert 3590 <= await redis.ttl("chat:s") <= 3600
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_history.py -v`
Expected: FAIL

- [ ] **Step 3: 實作 `service/history.py`**（append 用 pipeline 一次送出 RPUSH、LTRIM、EXPIRE）

- [ ] **Step 4: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_history.py -v`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add backend/service/history.py backend/tests/test_history.py
git commit -m "feat(backend): redis session history with TTL"
```

---

### Task 8: 聊天服務

**Files:**
- Create: `backend/service/chat.py`
- Test: `backend/tests/test_chat_service.py`

**Interfaces:**
- Consumes: `Persona`（Task 2）、`VectorStore`、`Hit`（Task 4）、`ChatLogRepo`、`ChatLogEntry`（Task 5）、`SessionHistory`（Task 7）、LangChain `Embeddings`（`aembed_query`）、`BaseChatModel`（`astream`）
- Produces: `@dataclass(frozen=True) class Source: doc_id: str; filename: str; page: int | None`；`@dataclass class ChatResult: answer: str; sources: list[Source]; fallback: bool`
- Produces: 例外 `LLMBusy`、`UpstreamUnavailable`
- Produces: `build_messages(persona: Persona, hits: list[Hit], history: list[tuple[str, str]], message: str) -> list[BaseMessage]`：依序為 `SystemMessage(render_system_prompt() + "\n\n〈資料〉\n" + 每個 hit 的 "[filename p.N] text")`、對話歷史、`HumanMessage(message)`
- Produces: `class ChatTurn`：屬性 `session_id: str`、`fallback: bool`、`sources: list[Source]`；方法 `tokens() -> AsyncIterator[str]`、`async finish(answer: str) -> None`（寫入 history 和 log；寫 log 失敗時只用 `logger.exception` 記錄）、`release() -> None`（可重複呼叫）
- Produces: `class ChatService(embeddings, store, history, log_repo, llm, persona, *, top_k: int, score_threshold: float, max_concurrency: int, queue_timeout: float, model_name: str)`，方法：`async begin(session_id: str, message: str) -> ChatTurn`、`async answer(session_id: str, message: str) -> ChatResult`

`begin` 的流程：檢索查詢 = `f"{last_question}\n{message}"`（有歷史紀錄時）或 `message` → `aembed_query` → `store.search(top_k)` → 只保留 `score >= score_threshold` 的結果。沒有結果時，回傳 `fallback=True` 的 turn（不取得 semaphore，`tokens()` 只會產出一次 `persona.fallback_for(message)`）。有結果時，以 `asyncio.wait_for(semaphore.acquire(), queue_timeout)` 取得 semaphore，逾時則丟 `LLMBusy`。`sources` 依 `(doc_id, page)` 去除重複，並保持原本順序。embedding 或 search 時遇到連線類的錯誤（`httpx.HTTPError`、`ConnectionError`、`OSError`、`ollama.ResponseError`），都轉成 `UpstreamUnavailable`；`tokens()` 執行中遇到同樣的錯誤也一樣轉換。`tokens()` 必須在 `finally` 裡呼叫 `release()`。`answer()` 的實作方式：`begin` → 收集所有 tokens → `finish` → 回傳 `ChatResult`。`latency_ms` 從 `begin` 開始計算。

- [ ] **Step 1: 寫失敗的測試**

fixture：`DeterministicFakeEmbedding(size=4)`、memory Qdrant 裡預先放入一份文件 `cv.md`（chunk 文字為 `"KLIF built an MQTT gateway"`）、fakeredis 版 `SessionHistory`、`InMemoryChatLogRepo`、`FakeListChatModel(responses=["He built an MQTT gateway."])`、Task 2 的 `make()` persona；預設 `score_threshold=-1.0`（一定命中）、`max_concurrency=1`、`queue_timeout=0.05`。

```python
async def test_answer_with_hits(chat, log_repo, history):
    r = await chat.answer("s1", "What did KLIF build?")
    assert r.fallback is False and r.answer == "He built an MQTT gateway."
    assert r.sources[0].filename == "cv.md"
    assert len(await history.get("s1")) == 2
    assert (await log_repo.query(LogQuery()))[0].fallback is False

async def test_fallback_skips_llm(make_chat, log_repo):
    chat = make_chat(score_threshold=1.01, llm=ExplodingChatModel())
    r = await chat.answer("s1", "今天天氣如何？")
    assert r.fallback is True and r.answer == "找不到" and r.sources == []
    assert (await log_repo.query(LogQuery()))[0].fallback is True

async def test_followup_query_includes_previous_question(make_chat, history):
    spy = SpyEmbeddings(size=4)
    chat = make_chat(embeddings=spy)
    await history.append_turn("s1", "Tell me about MQTT", "...")
    await chat.answer("s1", "And after that?")
    assert spy.queries[-1] == "Tell me about MQTT\nAnd after that?"

async def test_second_caller_gets_busy(chat):
    first = await chat.begin("a", "q")
    with pytest.raises(LLMBusy):
        await chat.begin("b", "q")
    first.release()

async def test_release_after_abandoned_stream(chat):
    turn = await chat.begin("a", "q")
    gen = turn.tokens()
    await gen.__anext__()
    await gen.aclose()
    (await chat.begin("b", "q")).release()  # must not raise LLMBusy

async def test_log_failure_does_not_break_answer(make_chat):
    chat = make_chat(log_repo=FailingLogRepo())
    assert (await chat.answer("s", "q")).answer

async def test_embedding_failure_raises_upstream_unavailable(make_chat):
    with pytest.raises(UpstreamUnavailable):
        await make_chat(embeddings=DownEmbeddings()).begin("s", "q")

def test_build_messages_layout(persona):
    hit = Hit("d", "cv.pdf", 0, 2, "ctx text", 0.9)
    msgs = build_messages(persona, [hit], [("human", "hi"), ("ai", "yo")], "now?")
    assert isinstance(msgs[0], SystemMessage) and "[cv.pdf p.2] ctx text" in msgs[0].content
    assert [m.content for m in msgs[1:]] == ["hi", "yo", "now?"]
```

（`ExplodingChatModel`、`SpyEmbeddings`、`FailingLogRepo`、`DownEmbeddings` 是測試檔裡的小型假物件：被呼叫時分別丟出 `AssertionError`、記錄查詢內容、`add` 時丟 `RuntimeError`、丟出 `httpx.ConnectError`。）

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_chat_service.py -v`
Expected: FAIL

- [ ] **Step 3: 實作 `service/chat.py`**

- [ ] **Step 4: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_chat_service.py -v`
Expected: 8 passed

- [ ] **Step 5: Commit**

```bash
git add backend/service/chat.py backend/tests/test_chat_service.py
git commit -m "feat(backend): chat service with fallback, follow-ups and GPU slot"
```

---

### Task 9: 安全性元件

**Files:**
- Create: `backend/controller/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Produces: `api_key_dependency(expected: str) -> Callable`（FastAPI dependency：讀取 header `X-API-Key`，用 `hmac.compare_digest` 比對，不符或缺少時丟 `HTTPException(401)`）
- Produces: `client_ip(request: Request) -> str`：取 `X-Forwarded-For` 的**最後一個**值（ngrok 會把真實 IP 附加在最後面，前面的值可能是訪客自己偽造的），沒有這個 header 時用 `request.client.host`
- Produces: `class RateLimiter(redis, per_minute: int)`：`async allow(key: str) -> bool`（key 格式為 `rl:{key}:{epoch_minute}`，使用 INCR，第一次時設定 `EXPIRE 60`，計數超過 `per_minute` 時回傳 False）

- [ ] **Step 1: 寫失敗的測試**

```python
def test_api_key(app_with_key):  # tiny FastAPI app with one route guarded by api_key_dependency("secret-key")
    c = TestClient(app_with_key)
    assert c.get("/x").status_code == 401
    assert c.get("/x", headers={"X-API-Key": "wrong"}).status_code == 401
    assert c.get("/x", headers={"X-API-Key": "secret-key"}).status_code == 200

def test_client_ip_uses_last_forwarded_value(make_request):
    assert client_ip(make_request({"x-forwarded-for": "6.6.6.6, 1.2.3.4"})) == "1.2.3.4"
    assert client_ip(make_request({}, client=("9.9.9.9", 1))) == "9.9.9.9"

async def test_rate_limiter(fake_redis):
    rl = RateLimiter(fake_redis, per_minute=2)
    assert [await rl.allow("ip") for _ in range(3)] == [True, True, False]
    assert await rl.allow("other-ip") is True
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_security.py -v`
Expected: FAIL

- [ ] **Step 3: 實作 `controller/security.py`**

- [ ] **Step 4: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_security.py -v`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add backend/controller/security.py backend/tests/test_security.py
git commit -m "feat(backend): api key, client ip and rate limiter"
```

---

### Task 10: 服務組裝與公開 app（聊天 + 健康檢查）

**Files:**
- Create: `backend/service/health.py`、`backend/service/container.py`、`backend/controller/chat.py`、`backend/controller/health.py`、`backend/main.py`
- Modify: `backend/tests/conftest.py`（新增 `services` fixture）
- Test: `backend/tests/test_public_app.py`

**Interfaces:**
- Consumes: Task 2–9 的所有元件
- Produces: `class HealthChecker(checks: dict[str, Callable[[], Awaitable[bool]]])`：`async run() -> dict[str, bool]`（每一項檢查最多 3 秒，例外或逾時都視為 False）；Ollama 檢查為 `GET {ollama_base_url}/api/version` 回傳 200
- Produces: `@dataclass class Services: settings, persona, ingestion: IngestionService, chat: ChatService, history: SessionHistory, rate_limiter: RateLimiter, log_repo: ChatLogRepo, health: HealthChecker, closers: list[Callable[[], Awaitable[None]]]`；`async build_services(settings: Settings) -> Services`（建立 asyncpg pool 並執行 `init_schema`、`AsyncQdrantClient(url)` 並執行 `ensure_collection`、Redis、`OllamaEmbeddings`、`ChatOllama`）；`async close_services(s: Services) -> None`
- Produces: `create_public_app(services: Services | None = None) -> FastAPI`：`services` 為 None 時，由 lifespan 透過 `get_settings()` 建立；建好的物件存在 `app.state.services`。CORS 只允許 `settings.cors_origin_list`。
- Routes：
  - `POST /chat`：body `{session_id?: str (max 64), message: str}`。message 去除前後空白後為空，或超過 `max_message_chars` 時回傳 422；超過 rate limit 回傳 429 `{"detail":"rate_limited"}`；`LLMBusy` 回傳 503 `{"detail":"busy"}`；`UpstreamUnavailable` 回傳 503 `{"detail":"unavailable"}`。成功時回傳 200 `{session_id, answer, sources: [{doc_id, filename, page}], fallback}`。沒有帶 `session_id` 時用 `uuid4().hex` 產生。
  - `POST /chat/stream`：驗證和錯誤處理與上面相同；**`begin()` 在建立 SSE 回應之前呼叫**，所以 busy / unavailable 一樣回傳 503 狀態碼。SSE 事件依序為：`meta {session_id}` → 多個 `token {text}` → `sources [...]` → `done {fallback}`。`tokens()` 中途發生 `UpstreamUnavailable` 時，送出 `error {"detail":"unavailable"}` 並結束串流，不呼叫 `finish`。
  - `GET /health`：全部正常時回傳 200，否則 503；body 為 `{"status": "ok"|"degraded", "checks": {"ollama": bool, "qdrant": bool, "redis": bool, "postgres": bool}}`，只包含布林值。

- [ ] **Step 1: 在 `conftest.py` 新增 `services` fixture**

組合 Task 4–9 測試用的假物件（memory Qdrant、fakeredis、記憶體版 repo、`DeterministicFakeEmbedding`、`FakeListChatModel`、測試用 persona），`HealthChecker` 的每一項檢查都回傳 True，`RATE_LIMIT_PER_MINUTE=3`、`SCORE_THRESHOLD=-1.0`（讓檢索一定命中），並預先匯入一份 `cv.md`。fixture 的 scope 是 function，每個測試都會拿到全新的 fakeredis，rate limit 計數不會互相影響。fixture 要允許測試替換其中的 `chat`、`health` 物件。

- [ ] **Step 2: 寫失敗的測試**（`client = httpx.AsyncClient(transport=ASGITransport(create_public_app(services)), base_url="http://t")`）

```python
async def test_chat_returns_answer_and_session(client):
    r = await client.post("/chat", json={"message": "What did KLIF build?"})
    body = r.json()
    assert r.status_code == 200 and body["session_id"] and body["sources"][0]["filename"] == "cv.md"

async def test_chat_validation(client):
    assert (await client.post("/chat", json={"message": "   "})).status_code == 422
    assert (await client.post("/chat", json={"message": "x" * 1001})).status_code == 422

async def test_rate_limit(client):
    codes = [(await client.post("/chat", json={"message": "hi"})).status_code for _ in range(4)]
    assert codes[-1] == 429

async def test_stream_event_order(client):
    async with client.stream("POST", "/chat/stream", json={"message": "q"}) as r:
        events = [line.split(": ", 1)[1] for line in [l async for l in r.aiter_lines()] if line.startswith("event:")]
    assert events[0] == "meta" and events[-2:] == ["sources", "done"] and "token" in events

async def test_busy_returns_503(client, services):
    held = await services.chat.begin("x", "q")
    try:
        r = await client.post("/chat/stream", json={"message": "q"})
        assert r.status_code == 503 and r.json()["detail"] == "busy"
    finally:
        held.release()

async def test_stream_emits_error_event_when_llm_fails_midway(client_with_failing_llm):
    async with client_with_failing_llm.stream("POST", "/chat/stream", json={"message": "q"}) as r:
        text = "".join([l async for l in r.aiter_lines()])
    assert "event: error" in text and "event: done" not in text

async def test_upstream_down_returns_503(client_with_down_embeddings):
    r = await client_with_down_embeddings.post("/chat", json={"message": "q"})
    assert r.status_code == 503 and r.json()["detail"] == "unavailable"

async def test_health(client, services):
    assert (await client.get("/health")).status_code == 200
    services.health = HealthChecker({"ollama": _false, "qdrant": _true})
    r = await client.get("/health")
    assert r.status_code == 503 and r.json()["checks"] == {"ollama": False, "qdrant": True}

async def test_admin_routes_not_mounted_on_public_app(client):
    assert (await client.get("/admin/documents")).status_code == 404

async def test_cors_allows_configured_origin_only(client):
    ok = await client.options("/chat", headers={"Origin": "https://site.test", "Access-Control-Request-Method": "POST"})
    bad = await client.options("/chat", headers={"Origin": "https://evil.test", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "https://site.test"
    assert "access-control-allow-origin" not in bad.headers
```

（`services` fixture 的 settings 要設定 `cors_origins="https://site.test"`。`client_with_failing_llm` 使用一個串出一個 token 後就丟 `httpx.ConnectError` 的 chat model；`client_with_down_embeddings` 使用 Task 8 的 `DownEmbeddings`。）

- [ ] **Step 3: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_public_app.py -v`
Expected: FAIL

- [ ] **Step 4: 實作 `service/health.py`、`service/container.py`、`controller/chat.py`、`controller/health.py`、`main.py` 的 `create_public_app`**

SSE 使用 `sse_starlette.EventSourceResponse`，事件的 data 為 JSON 字串。路由裡從 `request.app.state.services` 取得服務物件。

- [ ] **Step 5: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest tests/test_public_app.py -v`
Expected: 10 passed

- [ ] **Step 6: 執行全部測試**

Run: `.venv/Scripts/python -m pytest -v`
Expected: 全部 passed（postgres 相關測試 skipped）

- [ ] **Step 7: Commit**

```bash
git add backend/service/health.py backend/service/container.py backend/controller/chat.py backend/controller/health.py backend/main.py backend/tests
git commit -m "feat(backend): public chat app with SSE, health and wiring"
```

---

### Task 11: 管理 app（文件 CRUD + 問答紀錄）

**Files:**
- Create: `backend/controller/admin_documents.py`、`backend/controller/admin_logs.py`
- Modify: `backend/main.py`（新增 `create_admin_app`）
- Test: `backend/tests/test_admin_app.py`

**Interfaces:**
- Consumes: `IngestionService` 及其例外（Task 6）、`ChatLogRepo`、`LogQuery`（Task 5）、`api_key_dependency`（Task 9）、`Services`、`build_services`（Task 10）
- Produces: `create_admin_app(services: Services | None = None) -> FastAPI`：所有路由都加上 `api_key_dependency(settings.admin_api_key.get_secret_value())`；沒有 `/chat` 路由，也不設定 CORS。
- Routes（照 spec §6.2 / §6.4）：文件以 JSON 回傳 `{id, filename, file_type, size_bytes, sha256, chunk_count, created_at, updated_at}`。錯誤對應：`UnsupportedFileType` → 415、`UnreadableFile` / `EmptyDocument` → 422、`DuplicateDocument` → 409 `{"detail":"duplicate","existing_id":...}`、`DocumentNotFound` → 404、檔案超過 `max_upload_mb` → 413。`GET /admin/chat-logs` 的查詢參數：`from`、`to`（ISO 8601）、`session_id`、`q`、`fallback_only`、`limit`（1–200，預設 50）、`offset`。

- [ ] **Step 1: 寫失敗的測試**（使用 Task 10 的 `services` fixture；`H = {"X-API-Key": "test-admin-key-0123456789"}`）

```python
async def test_requires_api_key(admin):
    assert (await admin.get("/admin/documents")).status_code == 401

async def test_document_lifecycle(admin):
    up = await admin.post("/admin/documents", headers=H, files={"file": ("中文 履歷.md", b"# hi\nabout me")})
    assert up.status_code == 201
    doc_id = up.json()["id"]
    assert doc_id in [d["id"] for d in (await admin.get("/admin/documents", headers=H)).json()]
    put = await admin.put(f"/admin/documents/{doc_id}", headers=H, files={"file": ("v2.md", b"# v2")})
    assert put.status_code == 200 and put.json()["id"] == doc_id
    assert (await admin.delete(f"/admin/documents/{doc_id}", headers=H)).status_code == 204
    assert (await admin.get(f"/admin/documents/{doc_id}", headers=H)).status_code == 404

async def test_download_returns_original_unicode_filename(admin):
    doc_id = (await admin.post("/admin/documents", headers=H, files={"file": ("中文 履歷.md", b"x1")})).json()["id"]
    r = await admin.get(f"/admin/documents/{doc_id}/file", headers=H)
    assert r.status_code == 200 and r.content == b"x1"
    assert "%E4%B8%AD%E6%96%87" in r.headers["content-disposition"]

async def test_upload_errors(admin):
    post = lambda name, data: admin.post("/admin/documents", headers=H, files={"file": (name, data)})
    assert (await post("a.mp3", b"x")).status_code == 415
    assert (await post("a.md", "壞".encode("big5"))).status_code == 422
    first = await post("dup.md", b"same")
    dup = await post("dup2.md", b"same")
    assert dup.status_code == 409 and dup.json()["existing_id"] == first.json()["id"]
    assert (await post("big.md", b"x" * (20 * 1024 * 1024 + 1))).status_code == 413

async def test_chat_logs_query(admin, services):
    await services.chat.answer("s-log", "MQTT?")
    r = await admin.get("/admin/chat-logs", headers=H, params={"session_id": "s-log"})
    assert r.status_code == 200 and r.json()[0]["question"] == "MQTT?"
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `.venv/Scripts/python -m pytest tests/test_admin_app.py -v`
Expected: FAIL

- [ ] **Step 3: 實作兩個 controller 和 `create_admin_app`**（下載檔案使用 `FileResponse(path, filename=rec.filename)`，Starlette 會自動產生 `filename*=utf-8''...`）

- [ ] **Step 4: 執行測試，確認通過**

Run: `.venv/Scripts/python -m pytest -v`
Expected: 全部 passed（postgres 相關測試 skipped）

- [ ] **Step 5: Commit**

```bash
git add backend/controller/admin_documents.py backend/controller/admin_logs.py backend/main.py backend/tests/test_admin_app.py
git commit -m "feat(backend): local-only admin app for documents and chat logs"
```

---

### Task 12: Docker、README 與端到端驗證

**Files:**
- Create: `backend/Dockerfile`、`backend/docker-compose.yml`、`backend/.dockerignore`、`backend/README.md`、`backend/scripts/smoke.py`

**Interfaces:**
- Consumes: `main:create_public_app`、`main:create_admin_app`（以 `uvicorn --factory` 啟動）

- [ ] **Step 1: 寫 `Dockerfile` 和 `docker-compose.yml`**

`Dockerfile`：使用 `python:3.11-slim`，先複製 `requirements.txt` 並安裝（利用 layer 快取），再複製程式碼，使用非 root 使用者，`WORKDIR /app`。`.dockerignore` 排除 `.venv`、`tests`、`data`、`.env`、`__pycache__`。

`docker-compose.yml` 的服務（image 都固定確切版本，例如 `qdrant/qdrant:v1.12.x`、`redis:7.4-alpine`、`postgres:16-alpine`）：
- `api`：`command: uvicorn --factory main:create_public_app --host 0.0.0.0 --port 8000 --proxy-headers`，`ports: ["127.0.0.1:8000:8000"]`
- `admin`：`command: uvicorn --factory main:create_admin_app --host 0.0.0.0 --port 8001`，`ports: ["127.0.0.1:8001:8001"]`，掛載 `uploads:/data/uploads`
- `api` 和 `admin` 都使用 `env_file: .env`、`extra_hosts: ["host.docker.internal:host-gateway"]`、掛載 `./config:/app/config:ro`，並在 `depends_on` 中等待 qdrant / redis / postgres 的 healthcheck 通過（`condition: service_healthy`）
- `qdrant`、`redis`、`postgres`：不設定 `ports`，各自使用 named volume，並設定 healthcheck；postgres 的帳密使用 `chatbot/chatbot/chatbot`（與 `DATABASE_URL` 的預設值一致）

- [ ] **Step 2: 寫 `scripts/smoke.py`**（使用 httpx，執行 spec §8 的完整流程；每一步失敗時都印出原因並以非 0 結束，全部通過時印出 `ALL OK`）

流程：檢查 `GET :8000/health` 回傳 200 → 透過 `:8001` 上傳一份 md 和一份 pdf（內容寫在腳本裡，pdf 用 fpdf2 產生）→ `POST :8000/chat` 問 md 內容相關的問題，預期 `fallback=false` 且 sources 包含該檔案 → 問一個完全無關的問題，預期 `fallback=true` → `PUT` 更新 md → `DELETE` 刪除兩份文件 → `GET :8001/admin/chat-logs` 至少有 2 筆紀錄 → `GET :8000/admin/documents` 回傳 404。API key 從 `.env` 讀取。

- [ ] **Step 3: 啟動並執行端到端驗證**

Run: `cp .env.example .env`（填入 `ADMIN_API_KEY`），接著 `docker compose up -d --build`，等到 `docker compose ps` 顯示全部 healthy 後，執行 `.venv/Scripts/python scripts/smoke.py`
Expected: `ALL OK`。如果「無關問題」沒有觸發 fallback，或「相關問題」觸發了 fallback，就調整 `SCORE_THRESHOLD`：在 smoke 的輸出中列出兩個問題的最高分數，取兩者中間的值，再更新 `.env.example` 的預設值和 `settings.py`，然後重新執行，直到通過。

- [ ] **Step 4: 驗證對外暴露的範圍**

Run: `docker compose ps --format "{{.Name}} {{.Ports}}"`
Expected: 只有 `api` 顯示 `127.0.0.1:8000->8000/tcp`、`admin` 顯示 `127.0.0.1:8001->8001/tcp`；qdrant、redis、postgres 沒有任何對外的 port。

- [ ] **Step 5: 寫 `backend/README.md`**

內容包含：前置需求（Docker Desktop、主機上的 Ollama 以及需要的兩個模型 `ollama pull qwen2.5:7b`、`ollama pull mxbai-embed-large`）；Task 1 Step 6 的連線驗證結果，以及連不上時的備案（設定 `OLLAMA_HOST=0.0.0.0`，並加上 Windows 防火牆規則封鎖區網對 11434 的連入，寫出完整的 `New-NetFirewallRule` 指令）；啟動方式；`ngrok http 127.0.0.1:8000`（**只轉發 8000**）；每支 API 的 curl 範例；如何修改 `config/persona.yaml`（改完執行 `docker compose restart api`）；`SCORE_THRESHOLD` 的調整方法；本機跑測試的方式；整合測試的方法（`TEST_DATABASE_URL`）。

- [ ] **Step 6: Commit**

```bash
git add backend/Dockerfile backend/.dockerignore backend/docker-compose.yml backend/README.md backend/scripts/smoke.py backend/.env.example backend/settings.py
git commit -m "feat(backend): docker-compose stack, smoke test and README"
```
