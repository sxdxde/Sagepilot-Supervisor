from pydantic_settings import BaseSettings, SettingsConfigDict


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
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
