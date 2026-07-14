from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_path: Path = Path("/data/hometrap.db")
    secret_key: str = "local-development-secret"
    debug: bool = False

    model_config = SettingsConfigDict(
        env_prefix="HOMETRAP_",
        env_file=".env",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
