import pytest

from settings import Settings


@pytest.fixture
def settings(tmp_path):
    return Settings(_env_file=None, admin_api_key="test-admin-key-0123456789", upload_dir=tmp_path / "uploads")


def make_persona(**kw):
    from service.persona import Persona

    base = dict(
        name="KLIF 的助理",
        voice="third_person",
        tone="親切",
        system_prompt="你是助理。",
        fallback_message={"zh": "找不到", "en": "Not found", "default": "zh"},
    )
    return Persona(**{**base, **kw})


@pytest.fixture
def persona():
    return make_persona()


@pytest.fixture
async def store():
    from qdrant_client import AsyncQdrantClient

    from service.vector_store import VectorStore

    client = AsyncQdrantClient(location=":memory:")
    s = VectorStore(client, "test", dim=4)
    await s.ensure_collection()
    yield s
    await client.close()


@pytest.fixture
def embeddings():
    from langchain_core.embeddings import DeterministicFakeEmbedding

    return DeterministicFakeEmbedding(size=4)


@pytest.fixture
def repo():
    from service.repos.memory import InMemoryDocumentRepo

    return InMemoryDocumentRepo()


@pytest.fixture
def make_ingestion(tmp_path, embeddings, repo):
    from service.ingestion import IngestionService

    def make(store):
        return IngestionService(tmp_path / "uploads", embeddings, store, repo, chunk_size=200, chunk_overlap=0)

    return make


@pytest.fixture
def svc(make_ingestion, store):
    return make_ingestion(store)


@pytest.fixture
async def redis():
    from fakeredis import FakeAsyncRedis

    r = FakeAsyncRedis(decode_responses=True)
    yield r
    await r.aclose()


@pytest.fixture
def history(redis):
    from service.history import SessionHistory

    return SessionHistory(redis, ttl_seconds=3600, max_turns=2)


@pytest.fixture
def log_repo():
    from service.repos.memory import InMemoryChatLogRepo

    return InMemoryChatLogRepo()


CV_TEXT = "KLIF built an MQTT gateway"
LLM_ANSWER = "He built an MQTT gateway."


@pytest.fixture
async def seeded_store(store, embeddings):
    from service.chunking import Chunk

    await store.upsert("doc-cv", "cv.md", [Chunk(CV_TEXT, 0, None)], [embeddings.embed_query(CV_TEXT)])
    return store


@pytest.fixture
def make_chat(embeddings, seeded_store, history, log_repo, persona):
    from langchain_core.language_models import FakeListChatModel

    from service.chat import ChatService

    def make(**kw):
        args = dict(
            embeddings=embeddings,
            store=seeded_store,
            history=history,
            log_repo=log_repo,
            llm=FakeListChatModel(responses=[LLM_ANSWER]),
            persona=persona,
        )
        opts = dict(top_k=4, score_threshold=-1.0, max_concurrency=1, queue_timeout=0.05, model_name="fake")
        for k, v in kw.items():
            (args if k in args else opts)[k] = v
        return ChatService(**args, **opts)

    return make


@pytest.fixture
def chat(make_chat):
    return make_chat()


ADMIN_KEY = "test-admin-key-0123456789"


async def _true() -> bool:
    return True


@pytest.fixture
def services(tmp_path, embeddings, seeded_store, history, redis, log_repo, repo, persona, make_chat):
    from controller.security import RateLimiter
    from service.container import Services
    from service.health import HealthChecker
    from service.ingestion import IngestionService

    s = Settings(
        _env_file=None,
        admin_api_key=ADMIN_KEY,
        upload_dir=tmp_path / "uploads",
        cors_origins="https://site.test",
        rate_limit_per_minute=3,
        score_threshold=-1.0,
    )
    return Services(
        settings=s,
        persona=persona,
        ingestion=IngestionService(s.upload_dir, embeddings, seeded_store, repo, chunk_size=200, chunk_overlap=0),
        chat=make_chat(),
        history=history,
        rate_limiter=RateLimiter(redis, s.rate_limit_per_minute),
        log_repo=log_repo,
        health=HealthChecker({"ollama": _true, "qdrant": _true, "redis": _true, "postgres": _true}),
        closers=[],
    )
