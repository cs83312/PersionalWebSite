from dataclasses import dataclass
from uuid import NAMESPACE_URL, uuid5

from qdrant_client import AsyncQdrantClient, models

from service.chunking import Chunk


@dataclass(frozen=True)
class Hit:
    doc_id: str
    filename: str
    chunk_index: int
    page: int | None
    text: str
    score: float


class VectorStore:
    def __init__(self, client: AsyncQdrantClient, collection: str, dim: int):
        self._client = client
        self._collection = collection
        self._dim = dim

    async def ensure_collection(self) -> None:
        if not await self._client.collection_exists(self._collection):
            await self._client.create_collection(
                self._collection,
                vectors_config=models.VectorParams(size=self._dim, distance=models.Distance.COSINE),
            )

    async def upsert(self, doc_id: str, filename: str, chunks: list[Chunk], vectors: list[list[float]]) -> None:
        points = [
            models.PointStruct(
                id=str(uuid5(NAMESPACE_URL, f"{doc_id}:{c.chunk_index}")),
                vector=v,
                payload={"doc_id": doc_id, "filename": filename, "chunk_index": c.chunk_index, "page": c.page, "text": c.text},
            )
            for c, v in zip(chunks, vectors, strict=True)
        ]
        await self._client.upsert(self._collection, points=points)

    async def delete_doc(self, doc_id: str) -> None:
        await self._client.delete(
            self._collection,
            points_selector=models.FilterSelector(
                filter=models.Filter(must=[models.FieldCondition(key="doc_id", match=models.MatchValue(value=doc_id))])
            ),
        )

    async def search(self, vector: list[float], top_k: int) -> list[Hit]:
        res = await self._client.query_points(self._collection, query=vector, limit=top_k, with_payload=True)
        hits = [
            Hit(p.payload["doc_id"], p.payload["filename"], p.payload["chunk_index"], p.payload["page"], p.payload["text"], p.score)
            for p in res.points
        ]
        return sorted(hits, key=lambda h: h.score, reverse=True)

    async def ping(self) -> bool:
        try:
            await self._client.get_collections()
            return True
        except Exception:
            return False
