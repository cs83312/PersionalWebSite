import os
from contextlib import asynccontextmanager
from dataclasses import replace
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from service.models import ChatLogEntry, DocumentRecord, LogQuery
from service.repos.memory import InMemoryChatLogRepo, InMemoryDocumentRepo

PG_URL = os.environ.get("TEST_DATABASE_URL")
BACKENDS = [
    "memory",
    pytest.param("postgres", marks=[pytest.mark.integration, pytest.mark.skipif(not PG_URL, reason="TEST_DATABASE_URL not set")]),
]


def make_doc(**kw) -> DocumentRecord:
    now = datetime.now(timezone.utc)
    base = dict(id=uuid4(), filename="cv.md", file_type=".md", size_bytes=10, sha256="x", chunk_count=1, created_at=now, updated_at=now)
    return DocumentRecord(**{**base, **kw})


def make_log(**kw) -> ChatLogEntry:
    base = dict(session_id="s", question="q", answer="a", sources=[], fallback=False, model="m", latency_ms=1)
    return ChatLogEntry(**{**base, **kw})


@asynccontextmanager
async def pg_pool():
    import asyncpg

    from service.repos.postgres import init_schema

    pool = await asyncpg.create_pool(PG_URL)
    await init_schema(pool)
    await pool.execute("TRUNCATE documents, chat_logs")
    try:
        yield pool
    finally:
        await pool.close()


@pytest.fixture(params=BACKENDS)
async def doc_repo(request):
    if request.param == "memory":
        yield InMemoryDocumentRepo()
        return
    from service.repos.postgres import PgDocumentRepo

    async with pg_pool() as pool:
        yield PgDocumentRepo(pool)


@pytest.fixture(params=BACKENDS)
async def log_repo(request):
    if request.param == "memory":
        yield InMemoryChatLogRepo()
        return
    from service.repos.postgres import PgChatLogRepo

    async with pg_pool() as pool:
        yield PgChatLogRepo(pool)


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


async def test_document_list_newest_first(doc_repo):
    old = make_doc(sha256="1", created_at=datetime(2020, 1, 1, tzinfo=timezone.utc))
    new = make_doc(sha256="2")
    await doc_repo.add(old)
    await doc_repo.add(new)
    assert [d.id for d in await doc_repo.list()] == [new.id, old.id]
    assert await doc_repo.ping() is True


async def test_log_query_filters(log_repo):
    await log_repo.add(make_log(session_id="s1", question="MQTT 是什麼", fallback=False))
    await log_repo.add(make_log(session_id="s2", question="weather?", fallback=True, sources=[{"doc_id": "d"}]))
    assert [r.session_id for r in await log_repo.query(LogQuery(q="mqtt"))] == ["s1"]
    assert [r.session_id for r in await log_repo.query(LogQuery(fallback_only=True))] == ["s2"]
    assert [r.session_id for r in await log_repo.query(LogQuery(session_id="s2"))] == ["s2"]
    assert len(await log_repo.query(LogQuery(limit=1))) == 1
    newest = (await log_repo.query(LogQuery()))[0]
    assert newest.session_id == "s2" and newest.sources == [{"doc_id": "d"}]
    assert await log_repo.ping() is True
