from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth import LoginRateLimiter, ensure_admin
from app.config import Settings, get_settings
from app.db import create_database_engine, create_session_factory, run_migrations
from app.routers.apartments import router as apartments_router
from app.routers.auth import router as auth_router
from app.routers.rates import router as rates_router
from app.routers.services import router as services_router
from app.services.scheduler import start_scheduler

APP_VERSION = "0.1.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        run_migrations(resolved_settings)
        engine = create_database_engine(resolved_settings.database_path)
        application.state.session_factory = create_session_factory(engine)
        ensure_admin(application.state.session_factory, resolved_settings)
        scheduler = start_scheduler(application.state.session_factory)
        application.state.scheduler = scheduler
        try:
            yield
        finally:
            scheduler.shutdown(wait=False)
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
    application.include_router(apartments_router)
    application.include_router(services_router)
    application.include_router(rates_router)

    @application.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": APP_VERSION}

    return application


app = create_app()
