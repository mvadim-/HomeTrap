from functools import lru_cache
from ipaddress import ip_network
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
    scheduler_enabled: bool = True
    trusted_proxy_cidrs: str = ""

    model_config = SettingsConfigDict(
        env_prefix="HOMETRAP_",
        env_file=".env",
        extra="ignore",
        populate_by_name=True,
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


def validate_production_settings(settings: Settings) -> None:
    try:
        for value in settings.trusted_proxy_cidrs.split(","):
            if value.strip():
                ip_network(value.strip(), strict=False)
    except ValueError as error:
        raise RuntimeError("HOMETRAP_TRUSTED_PROXY_CIDRS contains an invalid CIDR") from error
    if settings.debug:
        return
    weak_secrets = {
        "",
        "local-development-secret",
        "change-me",
        "change-me-to-a-long-random-secret",
    }
    normalized_secret = settings.secret_key.casefold()
    if (
        len(settings.secret_key) < 32
        or normalized_secret in weak_secrets
        or "change-me" in normalized_secret
    ):
        raise RuntimeError(
            "HOMETRAP_SECRET_KEY must be a unique random value of at least 32 characters in production"
        )
    if settings.admin_password is not None:
        normalized_password = settings.admin_password.casefold()
        if len(settings.admin_password) < 12 or "change-me" in normalized_password:
            raise RuntimeError(
                "ADMIN_PASSWORD must be a unique strong value of at least 12 characters in production"
            )
