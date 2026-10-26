import re
from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, model_validator

_CJK = re.compile(r"[\u3400-\u9fff\uf900-\ufaff]")

_VOICE = {
    "third_person": "以第三人稱介紹 KLIF（third person）。",
    "first_person": "以第一人稱、代表 KLIF 本人回答（first person）。",
}

_RULES = (
    "規則：\n"
    "1. 只能根據〈資料〉區塊的內容回答，不要使用資料以外的知識。\n"
    "2. 資料不足以回答時，直接說你找不到相關資訊，不要猜測或編造。\n"
    "3. 使用與訪客提問相同的語言回答。"
)


def detect_lang(text: str) -> Literal["zh", "en"]:
    return "zh" if _CJK.search(text) else "en"


class Persona(BaseModel):
    name: str
    voice: Literal["third_person", "first_person"]
    tone: str
    system_prompt: str
    fallback_message: dict[str, str]

    @model_validator(mode="after")
    def _default_points_to_language(self) -> "Persona":
        default = self.fallback_message.get("default")
        if default is None or default == "default" or default not in self.fallback_message:
            raise ValueError("fallback_message.default must name another key in fallback_message")
        return self

    def fallback_for(self, message: str) -> str:
        lang = detect_lang(message)
        return self.fallback_message.get(lang) or self.fallback_message[self.fallback_message["default"]]

    def render_system_prompt(self) -> str:
        return (
            f"{self.system_prompt.strip()}\n\n"
            f"你的名字是「{self.name}」。{_VOICE[self.voice]}語氣：{self.tone}。\n\n"
            f"{_RULES}"
        )


def load_persona(path: Path) -> Persona:
    with open(path, encoding="utf-8") as f:
        return Persona(**yaml.safe_load(f))
