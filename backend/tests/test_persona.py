from pathlib import Path

import pytest
from pydantic import ValidationError

from service.persona import detect_lang, load_persona
from tests.conftest import make_persona as make


def test_detect_lang():
    assert detect_lang("你好 hello") == "zh"
    assert detect_lang("What did he build?") == "en"


def test_fallback_for_picks_language():
    p = make()
    assert p.fallback_for("他做過什麼？") == "找不到"
    assert p.fallback_for("What projects?") == "Not found"


def test_fallback_uses_default_when_language_missing():
    p = make(fallback_message={"zh": "找不到", "default": "zh"})
    assert p.fallback_for("What projects?") == "找不到"


def test_default_must_reference_existing_key():
    with pytest.raises(ValidationError):
        make(fallback_message={"zh": "找不到", "default": "ja"})


def test_render_system_prompt_contains_rules():
    out = make(voice="first_person").render_system_prompt()
    assert "你是助理。" in out and "KLIF 的助理" in out
    assert "first person" in out.lower() or "第一人稱" in out


def test_shipped_persona_file_loads():
    assert load_persona(Path("config/persona.yaml")).fallback_for("hi")
