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
