import httpx
import pytest
from langchain_core.language_models import FakeListChatModel
from langchain_core.messages import AIMessageChunk

from main import create_public_app
from service.health import HealthChecker
from tests.test_chat_service import DownEmbeddings


class MidwayFailingChatModel(FakeListChatModel):
    responses: list[str] = ["unused"]

    async def astream(self, *args, **kwargs):
        yield AIMessageChunk(content="He")
        raise httpx.ConnectError("ollama died")


async def _true() -> bool:
    return True


async def _false() -> bool:
    return False


def _client(services) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=create_public_app(services)), base_url="http://t")


@pytest.fixture
async def client(services):
    async with _client(services) as c:
        yield c


@pytest.fixture
async def client_with_failing_llm(services, make_chat):
    services.chat = make_chat(llm=MidwayFailingChatModel())
    async with _client(services) as c:
        yield c


@pytest.fixture
async def client_with_down_embeddings(services, make_chat):
    services.chat = make_chat(embeddings=DownEmbeddings(size=4))
    async with _client(services) as c:
        yield c


async def _events(client, payload) -> list[str]:
    async with client.stream("POST", "/chat/stream", json=payload) as r:
        lines = [line async for line in r.aiter_lines()]
    return [line.split(": ", 1)[1] for line in lines if line.startswith("event:")]


async def test_chat_returns_answer_and_session(client):
    r = await client.post("/chat", json={"message": "What did KLIF build?"})
    body = r.json()
    assert r.status_code == 200 and body["session_id"] and body["sources"][0]["filename"] == "cv.md"
    assert body["answer"] == "He built an MQTT gateway." and body["fallback"] is False


async def test_chat_validation(client):
    assert (await client.post("/chat", json={"message": "   "})).status_code == 422
    assert (await client.post("/chat", json={"message": "x" * 1001})).status_code == 422


async def test_rate_limit(client):
    codes = [(await client.post("/chat", json={"message": "hi"})).status_code for _ in range(4)]
    assert codes[:3] == [200, 200, 200] and codes[-1] == 429


async def test_stream_event_order(client):
    events = await _events(client, {"message": "q"})
    assert events[0] == "meta" and events[-2:] == ["sources", "done"] and "token" in events


async def test_busy_returns_503(client, services):
    held = await services.chat.begin("x", "q")
    try:
        r = await client.post("/chat/stream", json={"message": "q"})
        assert r.status_code == 503 and r.json()["detail"] == "busy"
    finally:
        held.release()


async def test_stream_emits_error_event_when_llm_fails_midway(client_with_failing_llm):
    events = await _events(client_with_failing_llm, {"message": "q"})
    assert "error" in events and "done" not in events


async def test_upstream_down_returns_503(client_with_down_embeddings):
    r = await client_with_down_embeddings.post("/chat", json={"message": "q"})
    assert r.status_code == 503 and r.json()["detail"] == "unavailable"


async def test_health(client, services):
    assert (await client.get("/health")).status_code == 200
    services.health = HealthChecker({"ollama": _false, "qdrant": _true})
    r = await client.get("/health")
    assert r.status_code == 503 and r.json() == {"status": "degraded", "checks": {"ollama": False, "qdrant": True}}


async def test_admin_routes_not_mounted_on_public_app(client):
    assert (await client.get("/admin/documents")).status_code == 404


async def test_cors_allows_configured_origin_only(client):
    ok = await client.options("/chat", headers={"Origin": "https://site.test", "Access-Control-Request-Method": "POST"})
    bad = await client.options("/chat", headers={"Origin": "https://evil.test", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == "https://site.test"
    assert "access-control-allow-origin" not in bad.headers
