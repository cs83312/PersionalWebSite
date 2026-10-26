from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import asyncpg
import httpx
from langchain_ollama import ChatOllama, OllamaEmbeddings
from qdrant_client import AsyncQdrantClient
from redis.asyncio import Redis

from controller.security import RateLimiter
from service.chat import ChatService
from service.health import HealthChecker
from service.history import SessionHistory
from service.ingestion import IngestionService
from service.persona import Persona, load_persona
from service.repos.base import ChatLogRepo
from service.repos.postgres import PgChatLogRepo, PgDocumentRepo, init_schema
from service.vector_store import VectorStore
from settings import Settings


@dataclass
class Services:
    settings: Settings
    persona: Persona
    ingestion: IngestionService
    chat: ChatService
    history: SessionHistory
    rate_limiter: RateLimiter
    log_repo: ChatLogRepo
    health: HealthChecker
    closers: list[Callable[[], Awaitable[None]]] = field(default_factory=list)


def build_ollama_clients(settings: Settings) -> tuple[OllamaEmbeddings, ChatOllama]:
    # 沒有逾時的話，Ollama 卡住時會永遠占住唯一的 GPU 名額
    timeout = httpx.Timeout(settings.llm_timeout_seconds, connect=5)
    embeddings = OllamaEmbeddings(
        model=settings.embed_model, base_url=settings.ollama_base_url, client_kwargs={"timeout": timeout}
    )
    llm = ChatOllama(
        model=settings.chat_model,
        base_url=settings.ollama_base_url,
        num_predict=settings.llm_num_predict,
        num_ctx=settings.llm_num_ctx,
        client_kwargs={"timeout": timeout},
    )
    return embeddings, llm


async def build_services(settings: Settings) -> Services:
    pool = await asyncpg.create_pool(settings.database_url)
    await init_schema(pool)
    qdrant = AsyncQdrantClient(url=settings.qdrant_url)
    store = VectorStore(qdrant, settings.qdrant_collection, settings.embed_dim)
    await store.ensure_collection()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)

    persona = load_persona(settings.persona_path)
    embeddings, llm = build_ollama_clients(settings)
    doc_repo = PgDocumentRepo(pool)
    log_repo = PgChatLogRepo(pool)
    history = SessionHistory(redis, settings.session_ttl_seconds, settings.history_max_turns)

    async def ollama_ok() -> bool:
        async with httpx.AsyncClient(timeout=3) as client:
            return (await client.get(f"{settings.ollama_base_url}/api/version")).status_code == 200

    return Services(
        settings=settings,
        persona=persona,
        ingestion=IngestionService(
            settings.upload_dir, embeddings, store, doc_repo, settings.chunk_size, settings.chunk_overlap
        ),
        chat=ChatService(
            embeddings,
            store,
            history,
            log_repo,
            llm,
            persona,
            top_k=settings.retrieval_top_k,
            score_threshold=settings.score_threshold,
            max_concurrency=settings.llm_max_concurrency,
            queue_timeout=settings.llm_queue_timeout_seconds,
            model_name=settings.chat_model,
        ),
        history=history,
        rate_limiter=RateLimiter(redis, settings.rate_limit_per_minute),
        log_repo=log_repo,
        health=HealthChecker({"ollama": ollama_ok, "qdrant": store.ping, "redis": history.ping, "postgres": log_repo.ping}),
        closers=[pool.close, qdrant.close, redis.aclose],
    )


async def close_services(s: Services) -> None:
    for close in s.closers:
        await close()
