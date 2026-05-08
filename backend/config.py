from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env before pydantic-settings processes fields so that os.environ is
# populated for any code that reads env vars directly (e.g. third-party libs).
_ENV_FILE = Path(__file__).parent / ".env"
load_dotenv(_ENV_FILE, override=False)


class Settings(BaseSettings):
    # Database
    database_url: str

    # Groq
    groq_api_key: str

    # Temporal
    temporal_host: str = "localhost:7233"
    temporal_namespace: str = "default"
    task_queue: str = "order-supervisor"

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
