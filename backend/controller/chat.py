import json
from dataclasses import asdict
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sse_starlette import EventSourceResponse

from controller.security import client_ip
from service.chat import ChatTurn, LLMBusy, UpstreamUnavailable
from service.container import Services

router = APIRouter()


class ChatRequest(BaseModel):
    session_id: str | None = Field(default=None, max_length=64)
    message: str


async def _prepare(request: Request, body: ChatRequest) -> tuple[Services, str, str]:
    s: Services = request.app.state.services
    message = body.message.strip()
    if not message or len(message) > s.settings.max_message_chars:
        raise HTTPException(status_code=422, detail="invalid_message")
    if not await s.rate_limiter.allow(client_ip(request)):
        raise HTTPException(status_code=429, detail="rate_limited")
    return s, body.session_id or uuid4().hex, message


def _unavailable(e: Exception) -> HTTPException:
    return HTTPException(status_code=503, detail="busy" if isinstance(e, LLMBusy) else "unavailable")


@router.post("/chat")
async def chat(request: Request, body: ChatRequest):
    s, session_id, message = await _prepare(request, body)
    try:
        result = await s.chat.answer(session_id, message)
    except (LLMBusy, UpstreamUnavailable) as e:
        raise _unavailable(e) from e
    return {
        "session_id": session_id,
        "answer": result.answer,
        "sources": [asdict(src) for src in result.sources],
        "fallback": result.fallback,
    }


@router.post("/chat/stream")
async def chat_stream(request: Request, body: ChatRequest):
    s, session_id, message = await _prepare(request, body)
    # 在建立 SSE 回應之前就取得 GPU 名額，忙碌或 Ollama 掛掉時才能回傳 503 狀態碼
    try:
        turn = await s.chat.begin(session_id, message)
    except (LLMBusy, UpstreamUnavailable) as e:
        raise _unavailable(e) from e
    return EventSourceResponse(_events(turn))


def _event(name: str, data) -> dict:
    return {"event": name, "data": json.dumps(data, ensure_ascii=False)}


async def _events(turn: ChatTurn):
    try:
        yield _event("meta", {"session_id": turn.session_id})
        parts: list[str] = []
        try:
            async for text in turn.tokens():
                parts.append(text)
                yield _event("token", {"text": text})
        except UpstreamUnavailable:
            yield _event("error", {"detail": "unavailable"})
            return
        await turn.finish("".join(parts))
        yield _event("sources", [asdict(src) for src in turn.sources])
        yield _event("done", {"fallback": turn.fallback})
    finally:
        turn.release()
