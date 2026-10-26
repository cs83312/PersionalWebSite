import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from starlette.requests import Request

from controller.security import RateLimiter, api_key_dependency, client_ip


@pytest.fixture
def app_with_key():
    app = FastAPI()

    @app.get("/x", dependencies=[Depends(api_key_dependency("secret-key"))])
    def x():
        return {"ok": True}

    return app


@pytest.fixture
def make_request():
    def make(headers: dict[str, str], client=("127.0.0.1", 1)):
        scope = {
            "type": "http",
            "headers": [(k.encode(), v.encode()) for k, v in headers.items()],
            "client": client,
        }
        return Request(scope)

    return make


def test_api_key(app_with_key):
    c = TestClient(app_with_key)
    assert c.get("/x").status_code == 401
    assert c.get("/x", headers={"X-API-Key": "wrong"}).status_code == 401
    assert c.get("/x", headers={"X-API-Key": "secret-key"}).status_code == 200


def test_client_ip_uses_last_forwarded_value(make_request):
    assert client_ip(make_request({"x-forwarded-for": "6.6.6.6, 1.2.3.4"})) == "1.2.3.4"
    assert client_ip(make_request({}, client=("9.9.9.9", 1))) == "9.9.9.9"


async def test_rate_limiter(redis):
    rl = RateLimiter(redis, per_minute=2)
    assert [await rl.allow("ip") for _ in range(3)] == [True, True, False]
    assert await rl.allow("other-ip") is True
