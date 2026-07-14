from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_path: Path = Path("/data/hometrap.db")
    static_dir: Path = Path("/app/static")
    secret_key: str = "local-development-secret"
    debug: bool = False
    admin_username: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ADMIN_USERNAME", "HOMETRAP_ADMIN_USERNAME"),
    )
    admin_password: str | None = Field(
        default=None,
        validation_alias=AliasChoices("ADMIN_PASSWORD", "HOMETRAP_ADMIN_PASSWORD"),
    )

    model_config = SettingsConfigDict(
        env_prefix="HOMETRAP_",
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
