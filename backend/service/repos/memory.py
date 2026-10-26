from dataclasses import asdict, replace
from datetime import datetime, timezone
from uuid import UUID

from service.models import ChatLogEntry, ChatLogRecord, DocumentRecord, LogQuery


class InMemoryDocumentRepo:
    def __init__(self):
        self._docs: dict[UUID, DocumentRecord] = {}

    async def add(self, rec: DocumentRecord) -> None:
        self._docs[rec.id] = replace(rec)

    async def update(self, rec: DocumentRecord) -> None:
        self._docs[rec.id] = replace(rec)

    async def get(self, id: UUID) -> DocumentRecord | None:
        rec = self._docs.get(id)
        return replace(rec) if rec else None

    async def get_by_sha256(self, sha: str) -> DocumentRecord | None:
        return next((replace(d) for d in self._docs.values() if d.sha256 == sha), None)

    async def list(self) -> list[DocumentRecord]:
        return sorted((replace(d) for d in self._docs.values()), key=lambda d: d.created_at, reverse=True)

    async def delete(self, id: UUID) -> bool:
        return self._docs.pop(id, None) is not None

    async def ping(self) -> bool:
        return True


class InMemoryChatLogRepo:
    def __init__(self):
        self._logs: list[ChatLogRecord] = []

    async def add(self, entry: ChatLogEntry) -> None:
        self._logs.append(ChatLogRecord(**asdict(entry), id=len(self._logs) + 1, created_at=datetime.now(timezone.utc)))

    async def query(self, q: LogQuery) -> list[ChatLogRecord]:
        needle = q.q.lower() if q.q else None
        rows = [
            r
            for r in reversed(self._logs)
            if (q.from_ is None or r.created_at >= q.from_)
            and (q.to is None or r.created_at <= q.to)
            and (q.session_id is None or r.session_id == q.session_id)
            and (not q.fallback_only or r.fallback)
            and (needle is None or needle in r.question.lower() or needle in r.answer.lower())
        ]
        return rows[q.offset : q.offset + q.limit]

    async def ping(self) -> bool:
        return True
