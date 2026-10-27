from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    admin_api_key: SecretStr

    ollama_base_url: str = "http://host.docker.internal:11434"
    chat_model: str = "llama3.1"
    embed_model: str = "mxbai-embed-large"
    embed_dim: int = 1024
    llm_timeout_seconds: float = 120
    llm_num_predict: int = 512
    llm_num_ctx: int = 8192

    qdrant_url: str = "http://qdrant:6333"
    qdrant_collection: str = "documents"
    redis_url: str = "redis://redis:6379/0"
    database_url: str = "postgresql://chatbot:chatbot@postgres:5432/chatbot"

    upload_dir: Path = Path("/data/uploads")
    persona_path: Path = Path("config/persona.yaml")

    retrieval_top_k: int = 4
    score_threshold: float = 0.6
    chunk_size: int = 800
    chunk_overlap: int = 100
    session_ttl_seconds: int = 3600
    history_max_turns: int = 6

    cors_origins: str = ""
    max_upload_mb: int = 20
    max_message_chars: int = 1000
    rate_limit_per_minute: int = 10
    llm_max_concurrency: int = 1
    llm_queue_timeout_seconds: float = 30

    @field_validator("admin_api_key")
    @classmethod
    def _admin_key_is_set(cls, v: SecretStr) -> SecretStr:
        if len(v.get_secret_value().strip()) < 16:
            raise ValueError("ADMIN_API_KEY must be set to a random string of at least 16 characters")
        return v

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
