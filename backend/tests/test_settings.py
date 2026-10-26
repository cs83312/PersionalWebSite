import pytest
from pydantic import ValidationError

from settings import Settings


def test_missing_admin_key_refuses_to_start(monkeypatch):
    monkeypatch.delenv("ADMIN_API_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_defaults(settings):
    assert settings.ollama_base_url == "http://host.docker.internal:11434"
    assert settings.chat_model == "qwen2.5:7b"
    assert settings.embed_model == "mxbai-embed-large"
    assert settings.embed_dim == 1024
    assert settings.session_ttl_seconds == 3600
    assert settings.llm_max_concurrency == 1
    assert settings.llm_queue_timeout_seconds == 30


def test_cors_origin_list():
    s = Settings(_env_file=None, admin_api_key="x" * 20, cors_origins=" https://a.com, ,https://b.com ")
    assert s.cors_origin_list == ["https://a.com", "https://b.com"]
