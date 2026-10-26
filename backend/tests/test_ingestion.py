import httpx
import pytest
from langchain_core.embeddings import DeterministicFakeEmbedding

from service.ingestion import DocumentNotFound, DuplicateDocument, EmptyDocument, sanitize_filename
from service.loaders import UnreadableFile
from service.vector_store import VectorStore


class FailingUpsertStore(VectorStore):
    async def upsert(self, *args, **kwargs):
        raise RuntimeError("qdrant down")


@pytest.fixture
def svc_with_failing_store(make_ingestion, store):
    return make_ingestion(FailingUpsertStore(store._client, store._collection, 4))


def test_sanitize_filename():
    assert sanitize_filename("../../evil.md") == "evil.md"
    assert sanitize_filename(r"C:\x\中文 履歷.pdf") == "中文 履歷.pdf"
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
    assert {h.text for h in await store.search([1, 0, 0, 0], 10)} == {"new content"}
    assert not svc.file_path(rec).exists()
    assert svc.file_path(new).read_bytes() == b"new content"


async def test_replace_with_unreadable_file_keeps_old_version(svc, store):
    rec = await svc.create("a.md", b"old content")
    with pytest.raises(UnreadableFile):
        await svc.replace(rec.id, "a.md", "壞".encode("big5"))
    assert {h.text for h in await store.search([1, 0, 0, 0], 10)} == {"old content"}
    assert svc.file_path(rec).read_bytes() == b"old content"


async def test_delete_removes_everything(svc, store, repo):
    rec = await svc.create("a.md", b"x")
    await svc.delete(rec.id)
    assert await repo.get(rec.id) is None and not svc.file_path(rec).exists()
    assert await store.search([1, 0, 0, 0], 10) == []
    with pytest.raises(DocumentNotFound):
        await svc.delete(rec.id)


class DownDocEmbeddings(DeterministicFakeEmbedding):
    async def aembed_documents(self, texts):
        raise httpx.ConnectError("ollama down")


async def test_create_when_ollama_down_raises_upstream_unavailable(tmp_path, store, repo):
    from service.chat import UpstreamUnavailable
    from service.ingestion import IngestionService

    svc = IngestionService(tmp_path / "uploads", DownDocEmbeddings(size=4), store, repo, chunk_size=200, chunk_overlap=0)
    with pytest.raises(UpstreamUnavailable):
        await svc.create("a.md", b"text")
    assert await repo.list() == []
