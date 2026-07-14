from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth import LoginRateLimiter, ensure_admin
from app.config import Settings, get_settings
from app.db import create_database_engine, create_session_factory, run_migrations
from app.routers.auth import router as auth_router

APP_VERSION = "0.1.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        run_migrations(resolved_settings)
        engine = create_database_engine(resolved_settings.database_path)
        application.state.session_factory = create_session_factory(engine)
        ensure_admin(application.state.session_factory, resolved_settings)
        try:
            yield
        finally:
            engine.dispose()

    application = FastAPI(
        title="HomeTrap API",
        version=APP_VERSION,
        debug=resolved_settings.debug,
        lifespan=lifespan,
    )
    application.state.settings = resolved_settings
    application.state.login_rate_limiter = LoginRateLimiter()
    application.include_router(auth_router)

    @application.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": APP_VERSION}

    return application


app = create_app()
