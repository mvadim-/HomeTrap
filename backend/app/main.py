from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import Settings, get_settings
from app.db import run_migrations

APP_VERSION = "0.1.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        run_migrations(resolved_settings)
        yield

    application = FastAPI(
        title="HomeTrap API",
        version=APP_VERSION,
        debug=resolved_settings.debug,
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings

    @application.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": APP_VERSION}

    return application


app = create_app()
