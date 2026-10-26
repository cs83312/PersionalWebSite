from __future__ import annotations

import hashlib
import logging
import re
import shutil
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path, PurePath
from uuid import UUID, uuid4

from langchain_core.embeddings import Embeddings

from service.chat import UPSTREAM_ERRORS, UpstreamUnavailable
from service.chunking import Chunk, split_pages
from service.loaders import get_loader
from service.models import DocumentRecord
from service.repos.base import DocumentRepo
from service.vector_store import VectorStore

logger = logging.getLogger(__name__)

_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


class DocumentNotFound(Exception):
    def __init__(self, doc_id: UUID):
        super().__init__(str(doc_id))
        self.doc_id = doc_id


class DuplicateDocument(Exception):
    def __init__(self, existing_id: UUID):
        super().__init__(str(existing_id))
        self.existing_id = existing_id


class EmptyDocument(Exception):
    pass


def sanitize_filename(name: str) -> str:
    base = PurePath(name.replace("\\", "/")).name
    base = _CONTROL.sub("", base).strip()
    return "file" if base in ("", ".", "..") else base


class IngestionService:
    def __init__(
        self,
        upload_dir: Path,
        embeddings: Embeddings,
        store: VectorStore,
        repo: DocumentRepo,
        chunk_size: int,
        chunk_overlap: int,
    ):
        self._upload_dir = upload_dir
        self._embeddings = embeddings
        self._store = store
        self._repo = repo
        self._chunk_size = chunk_size
        self._chunk_overlap = chunk_overlap

    def file_path(self, rec: DocumentRecord) -> Path:
        return self._upload_dir / str(rec.id) / rec.filename

    async def get(self, doc_id: UUID) -> DocumentRecord:
        rec = await self._repo.get(doc_id)
        if rec is None:
            raise DocumentNotFound(doc_id)
        return rec

    async def list(self) -> list[DocumentRecord]:
        return await self._repo.list()

    async def create(self, filename: str, data: bytes) -> DocumentRecord:
        filename = sanitize_filename(filename)
        sha = hashlib.sha256(data).hexdigest()
        if existing := await self._repo.get_by_sha256(sha):
            raise DuplicateDocument(existing.id)
        chunks, vectors = await self._prepare(filename, data)

        now = datetime.now(timezone.utc)
        rec = DocumentRecord(uuid4(), filename, PurePath(filename).suffix.lower(), len(data), sha, len(chunks), now, now)
        doc_dir = self._upload_dir / str(rec.id)
        try:
            self._write_file(rec, data)
            await self._store.upsert(str(rec.id), filename, chunks, vectors)
            await self._repo.add(rec)
        except BaseException:
            await self._safe_delete_vectors(rec.id)
            shutil.rmtree(doc_dir, ignore_errors=True)
            raise
        return rec

    async def replace(self, doc_id: UUID, filename: str, data: bytes) -> DocumentRecord:
        old = await self.get(doc_id)
        filename = sanitize_filename(filename)
        sha = hashlib.sha256(data).hexdigest()
        existing = await self._repo.get_by_sha256(sha)
        if existing and existing.id != doc_id:
            raise DuplicateDocument(existing.id)
        # 新內容先完整處理好；這一段失敗時舊版本完全不受影響
        chunks, vectors = await self._prepare(filename, data)

        new = replace(
            old,
            filename=filename,
            file_type=PurePath(filename).suffix.lower(),
            size_bytes=len(data),
            sha256=sha,
            chunk_count=len(chunks),
            updated_at=datetime.now(timezone.utc),
        )
        try:
            await self._store.delete_doc(str(doc_id))
            await self._store.upsert(str(doc_id), filename, chunks, vectors)
        except BaseException:
            await self._restore_vectors(old)
            raise
        old_bytes = self.file_path(old).read_bytes()
        self.file_path(old).unlink(missing_ok=True)
        try:
            self._write_file(new, data)
            await self._repo.update(new)
        except BaseException:
            self.file_path(new).unlink(missing_ok=True)
            self._write_file(old, old_bytes)
            await self._restore_vectors(old)
            raise
        return new

    async def delete(self, doc_id: UUID) -> None:
        rec = await self.get(doc_id)
        await self._store.delete_doc(str(doc_id))
        await self._repo.delete(doc_id)
        shutil.rmtree(self._upload_dir / str(rec.id), ignore_errors=True)

    async def _prepare(self, filename: str, data: bytes) -> tuple[list[Chunk], list[list[float]]]:
        pages = get_loader(filename)(data)
        chunks = split_pages(pages, self._chunk_size, self._chunk_overlap)
        if not chunks:
            raise EmptyDocument(filename)
        try:
            vectors = await self._embeddings.aembed_documents([c.text for c in chunks])
        except UPSTREAM_ERRORS as e:
            raise UpstreamUnavailable() from e
        return chunks, vectors

    def _write_file(self, rec: DocumentRecord, data: bytes) -> None:
        path = self.file_path(rec)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    async def _safe_delete_vectors(self, doc_id: UUID) -> None:
        try:
            await self._store.delete_doc(str(doc_id))
        except Exception:
            logger.exception("rollback: failed to delete vectors for %s", doc_id)

    async def _restore_vectors(self, old: DocumentRecord) -> None:
        """更新失敗時，用磁碟上的舊檔重新建立舊版本的向量。"""
        try:
            chunks, vectors = await self._prepare(old.filename, self.file_path(old).read_bytes())
            await self._store.delete_doc(str(old.id))
            await self._store.upsert(str(old.id), old.filename, chunks, vectors)
        except Exception:
            logger.exception("rollback: failed to restore vectors for %s", old.id)
