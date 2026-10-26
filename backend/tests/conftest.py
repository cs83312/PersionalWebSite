import pytest

from settings import Settings


@pytest.fixture
def settings(tmp_path):
    return Settings(_env_file=None, admin_api_key="test-admin-key-0123456789", upload_dir=tmp_path / "uploads")


def make_persona(**kw):
    from service.persona import Persona

    base = dict(
        name="KLIF 的助理",
        voice="third_person",
        tone="親切",
        system_prompt="你是助理。",
        fallback_message={"zh": "找不到", "en": "Not found", "default": "zh"},
    )
    return Persona(**{**base, **kw})


@pytest.fixture
def persona():
    return make_persona()
