import json
from uuid import UUID

import asyncpg

from service.models import ChatLogEntry, ChatLogRecord, DocumentRecord, LogQuery

SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    sha256 TEXT NOT NULL UNIQUE,
    chunk_count INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE IF NOT EXISTS chat_logs (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    sources JSONB NOT NULL,
    fallback BOOLEAN NOT NULL,
    model TEXT NOT NULL,
    latency_ms INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_logs_created_at_idx ON chat_logs (created_at);
"""

_DOC_COLS = "id, filename, file_type, size_bytes, sha256, chunk_count, created_at, updated_at"


async def init_schema(pool: asyncpg.Pool) -> None:
    await pool.execute(SCHEMA)


def _doc(row) -> DocumentRecord | None:
    return DocumentRecord(**dict(row)) if row else None


async def _ping(pool: asyncpg.Pool) -> bool:
    try:
        return await pool.fetchval("SELECT 1") == 1
    except Exception:
        return False


class PgDocumentRepo:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    async def add(self, rec: DocumentRecord) -> None:
        await self._pool.execute(
            f"INSERT INTO documents ({_DOC_COLS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            rec.id, rec.filename, rec.file_type, rec.size_bytes, rec.sha256, rec.chunk_count, rec.created_at, rec.updated_at,
        )

    async def update(self, rec: DocumentRecord) -> None:
        await self._pool.execute(
            "UPDATE documents SET filename=$2, file_type=$3, size_bytes=$4, sha256=$5, chunk_count=$6, updated_at=$7 WHERE id=$1",
            rec.id, rec.filename, rec.file_type, rec.size_bytes, rec.sha256, rec.chunk_count, rec.updated_at,
        )

    async def get(self, id: UUID) -> DocumentRecord | None:
        return _doc(await self._pool.fetchrow(f"SELECT {_DOC_COLS} FROM documents WHERE id=$1", id))

    async def get_by_sha256(self, sha: str) -> DocumentRecord | None:
        return _doc(await self._pool.fetchrow(f"SELECT {_DOC_COLS} FROM documents WHERE sha256=$1", sha))

    async def list(self) -> list[DocumentRecord]:
        rows = await self._pool.fetch(f"SELECT {_DOC_COLS} FROM documents ORDER BY created_at DESC")
        return [_doc(r) for r in rows]

    async def delete(self, id: UUID) -> bool:
        return await self._pool.execute("DELETE FROM documents WHERE id=$1", id) == "DELETE 1"

    async def ping(self) -> bool:
        return await _ping(self._pool)


class PgChatLogRepo:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    async def add(self, entry: ChatLogEntry) -> None:
        await self._pool.execute(
            "INSERT INTO chat_logs (session_id, question, answer, sources, fallback, model, latency_ms) "
            "VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)",
            entry.session_id, entry.question, entry.answer, json.dumps(entry.sources, ensure_ascii=False),
            entry.fallback, entry.model, entry.latency_ms,
        )

    async def query(self, q: LogQuery) -> list[ChatLogRecord]:
        where: list[str] = []
        args: list = []

        def arg(value) -> str:
            args.append(value)
            return f"${len(args)}"

        if q.from_ is not None:
            where.append(f"created_at >= {arg(q.from_)}")
        if q.to is not None:
            where.append(f"created_at <= {arg(q.to)}")
        if q.session_id is not None:
            where.append(f"session_id = {arg(q.session_id)}")
        if q.fallback_only:
            where.append("fallback")
        if q.q:
            p = arg(f"%{q.q}%")
            where.append(f"(question ILIKE {p} OR answer ILIKE {p})")
        sql = (
            "SELECT id, created_at, session_id, question, answer, sources, fallback, model, latency_ms FROM chat_logs"
            + (" WHERE " + " AND ".join(where) if where else "")
            + f" ORDER BY id DESC LIMIT {arg(q.limit)} OFFSET {arg(q.offset)}"
        )
        rows = await self._pool.fetch(sql, *args)
        return [ChatLogRecord(**{**dict(r), "sources": json.loads(r["sources"])}) for r in rows]

    async def ping(self) -> bool:
        return await _ping(self._pool)
