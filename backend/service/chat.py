import asyncio
import logging
import time
from collections.abc import AsyncIterator
from dataclasses import asdict, dataclass

import httpx
import ollama
from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from service.history import SessionHistory
from service.models import ChatLogEntry
from service.persona import Persona
from service.repos.base import ChatLogRepo
from service.vector_store import Hit, VectorStore

logger = logging.getLogger(__name__)

# Ollama 沒開或連線中斷時會丟出的錯誤
UPSTREAM_ERRORS = (httpx.HTTPError, ConnectionError, OSError, ollama.ResponseError)


class LLMBusy(Exception):
    pass


class UpstreamUnavailable(Exception):
    pass


@dataclass(frozen=True)
class Source:
    doc_id: str
    filename: str
    page: int | None


@dataclass
class ChatResult:
    answer: str
    sources: list[Source]
    fallback: bool


def build_messages(persona: Persona, hits: list[Hit], history: list[tuple[str, str]], message: str) -> list[BaseMessage]:
    context = "\n\n".join(
        f"[{h.filename}{f' p.{h.page}' if h.page is not None else ''}] {h.text}" for h in hits
    )
    msgs: list[BaseMessage] = [SystemMessage(f"{persona.render_system_prompt()}\n\n〈資料〉\n{context}")]
    msgs += [HumanMessage(c) if role == "human" else AIMessage(c) for role, c in history]
    msgs.append(HumanMessage(message))
    return msgs


def _sources(hits: list[Hit]) -> list[Source]:
    seen: dict[tuple[str, int | None], Source] = {}
    for h in hits:
        seen.setdefault((h.doc_id, h.page), Source(h.doc_id, h.filename, h.page))
    return list(seen.values())


class ChatTurn:
    def __init__(
        self,
        service: "ChatService",
        session_id: str,
        message: str,
        *,
        fallback: bool,
        sources: list[Source],
        messages: list[BaseMessage],
        started: float,
        semaphore: asyncio.Semaphore | None,
    ):
        self.session_id = session_id
        self.fallback = fallback
        self.sources = sources
        self._service = service
        self._message = message
        self._messages = messages
        self._started = started
        self._semaphore = semaphore

    async def tokens(self) -> AsyncIterator[str]:
        try:
            if self.fallback:
                yield self._service.persona.fallback_for(self._message)
                return
            try:
                async for chunk in self._service.llm.astream(self._messages):
                    if isinstance(chunk.content, str) and chunk.content:
                        yield chunk.content
            except UPSTREAM_ERRORS as e:
                raise UpstreamUnavailable() from e
        finally:
            self.release()

    async def finish(self, answer: str) -> None:
        svc = self._service
        try:
            await svc.history.append_turn(self.session_id, self._message, answer)
        except Exception:
            logger.exception("failed to write session history")
        entry = ChatLogEntry(
            session_id=self.session_id,
            question=self._message,
            answer=answer,
            sources=[asdict(s) for s in self.sources],
            fallback=self.fallback,
            model=svc.model_name,
            latency_ms=int((time.monotonic() - self._started) * 1000),
        )
        try:
            await svc.log_repo.add(entry)
        except Exception:
            logger.exception("failed to write chat log")

    def release(self) -> None:
        if self._semaphore is not None:
            self._semaphore.release()
            self._semaphore = None


class ChatService:
    def __init__(
        self,
        embeddings: Embeddings,
        store: VectorStore,
        history: SessionHistory,
        log_repo: ChatLogRepo,
        llm: BaseChatModel,
        persona: Persona,
        *,
        top_k: int,
        score_threshold: float,
        max_concurrency: int,
        queue_timeout: float,
        model_name: str,
    ):
        self.embeddings = embeddings
        self.store = store
        self.history = history
        self.log_repo = log_repo
        self.llm = llm
        self.persona = persona
        self.model_name = model_name
        self._top_k = top_k
        self._threshold = score_threshold
        self._queue_timeout = queue_timeout
        self._semaphore = asyncio.Semaphore(max_concurrency)

    async def begin(self, session_id: str, message: str) -> ChatTurn:
        started = time.monotonic()
        last = await self.history.last_question(session_id)
        query = f"{last}\n{message}" if last else message
        try:
            vector = await self.embeddings.aembed_query(query)
            hits = await self.store.search(vector, self._top_k)
        except UPSTREAM_ERRORS as e:
            raise UpstreamUnavailable() from e
        hits = [h for h in hits if h.score >= self._threshold]

        if not hits:
            return ChatTurn(self, session_id, message, fallback=True, sources=[], messages=[], started=started, semaphore=None)

        history = await self.history.get(session_id)
        try:
            await asyncio.wait_for(self._semaphore.acquire(), self._queue_timeout)
        except asyncio.TimeoutError:
            raise LLMBusy() from None
        return ChatTurn(
            self,
            session_id,
            message,
            fallback=False,
            sources=_sources(hits),
            messages=build_messages(self.persona, hits, history, message),
            started=started,
            semaphore=self._semaphore,
        )

    async def answer(self, session_id: str, message: str) -> ChatResult:
        turn = await self.begin(session_id, message)
        try:
            text = "".join([t async for t in turn.tokens()])
        finally:
            turn.release()
        await turn.finish(text)
        return ChatResult(text, turn.sources, turn.fallback)
