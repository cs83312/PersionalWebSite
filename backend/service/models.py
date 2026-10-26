from dataclasses import dataclass, field
from datetime import datetime
from uuid import UUID


@dataclass
class DocumentRecord:
    id: UUID
    filename: str
    file_type: str
    size_bytes: int
    sha256: str
    chunk_count: int
    created_at: datetime
    updated_at: datetime


@dataclass
class ChatLogEntry:
    session_id: str
    question: str
    answer: str
    sources: list[dict]
    fallback: bool
    model: str
    latency_ms: int


@dataclass
class ChatLogRecord(ChatLogEntry):
    id: int = 0
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class LogQuery:
    from_: datetime | None = None
    to: datetime | None = None
    session_id: str | None = None
    q: str | None = None
    fallback_only: bool = False
    limit: int = 50
    offset: int = 0
