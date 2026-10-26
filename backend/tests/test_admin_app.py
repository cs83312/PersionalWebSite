import httpx
import pytest

from main import create_admin_app
from tests.conftest import ADMIN_KEY

H = {"X-API-Key": ADMIN_KEY}


@pytest.fixture
async def admin(services):
    transport = httpx.ASGITransport(app=create_admin_app(services))
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as c:
        yield c


async def test_requires_api_key(admin):
    assert (await admin.get("/admin/documents")).status_code == 401
    assert (await admin.get("/admin/chat-logs", headers={"X-API-Key": "wrong"})).status_code == 401


async def test_document_lifecycle(admin):
    up = await admin.post("/admin/documents", headers=H, files={"file": ("中文 履歷.md", b"# hi\nabout me")})
    assert up.status_code == 201
    doc_id = up.json()["id"]
    assert doc_id in [d["id"] for d in (await admin.get("/admin/documents", headers=H)).json()]
    assert (await admin.get(f"/admin/documents/{doc_id}", headers=H)).json()["filename"] == "中文 履歷.md"
    put = await admin.put(f"/admin/documents/{doc_id}", headers=H, files={"file": ("v2.md", b"# v2")})
    assert put.status_code == 200 and put.json()["id"] == doc_id and put.json()["filename"] == "v2.md"
    assert (await admin.delete(f"/admin/documents/{doc_id}", headers=H)).status_code == 204
    assert (await admin.get(f"/admin/documents/{doc_id}", headers=H)).status_code == 404


async def test_download_returns_original_unicode_filename(admin):
    doc_id = (await admin.post("/admin/documents", headers=H, files={"file": ("中文 履歷.md", b"x1")})).json()["id"]
    r = await admin.get(f"/admin/documents/{doc_id}/file", headers=H)
    assert r.status_code == 200 and r.content == b"x1"
    assert "%E4%B8%AD%E6%96%87" in r.headers["content-disposition"]


async def test_upload_errors(admin):
    def post(name, data):
        return admin.post("/admin/documents", headers=H, files={"file": (name, data)})

    assert (await post("a.mp3", b"x")).status_code == 415
    assert (await post("a.md", "壞".encode("big5"))).status_code == 422
    assert (await post("blank.md", b"  \n")).status_code == 422
    first = await post("dup.md", b"same")
    dup = await post("dup2.md", b"same")
    assert dup.status_code == 409 and dup.json()["existing_id"] == first.json()["id"]
    assert (await post("big.md", b"x" * (20 * 1024 * 1024 + 1))).status_code == 413


async def test_unknown_document_is_404(admin):
    missing = "00000000-0000-0000-0000-000000000000"
    assert (await admin.delete(f"/admin/documents/{missing}", headers=H)).status_code == 404
    put = await admin.put(f"/admin/documents/{missing}", headers=H, files={"file": ("a.md", b"x")})
    assert put.status_code == 404


async def test_chat_logs_query(admin, services):
    await services.chat.answer("s-log", "MQTT?")
    r = await admin.get("/admin/chat-logs", headers=H, params={"session_id": "s-log"})
    assert r.status_code == 200 and r.json()[0]["question"] == "MQTT?"
    assert (await admin.get("/admin/chat-logs", headers=H, params={"limit": 0})).status_code == 422


async def test_chat_routes_not_mounted_on_admin_app(admin):
    assert (await admin.post("/chat", json={"message": "hi"})).status_code == 404


async def test_upload_when_ollama_down_returns_503(services, admin, tmp_path, store, repo):
    from service.ingestion import IngestionService
    from tests.test_ingestion import DownDocEmbeddings

    services.ingestion = IngestionService(tmp_path / "u2", DownDocEmbeddings(size=4), store, repo, chunk_size=200, chunk_overlap=0)
    r = await admin.post("/admin/documents", headers=H, files={"file": ("a.md", b"text")})
    assert r.status_code == 503 and r.json()["detail"] == "unavailable"
