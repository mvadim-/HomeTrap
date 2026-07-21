from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.auth import LoginRateLimiter, ensure_admin
from app.constants import APP_VERSION
from app.config import Settings, get_settings, validate_production_settings
from app.db import create_database_engine, create_session_factory, run_migrations
from app.middleware import RestoreUploadGuardMiddleware
from app.routers.apartments import router as apartments_router
from app.routers.auth import router as auth_router
from app.routers.billing import router as billing_router
from app.routers.expenses import router as expenses_router
from app.routers.invoices import router as invoices_router
from app.routers.import_ import router as import_router
from app.routers.push import router as push_router
from app.routers.rates import router as rates_router
from app.routers.services import router as services_router
from app.routers.stats import router as stats_router
from app.routers.settings import router as settings_router
from app.routers.tenants import router as tenants_router
from app.services.scheduler import start_scheduler
from app.services.restore import recover_restore_journals
from app.services.storage import recover_tenant_file_deletions


def add_frontend(application: FastAPI, static_dir: Path) -> None:
    index_file = static_dir / "index.html"
    if not index_file.is_file():
        return

    assets_dir = static_dir / "assets"
    if assets_dir.is_dir():
        application.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @application.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404)

        requested_file = (static_dir / path).resolve()
        if (
            requested_file.is_relative_to(static_dir.resolve())
            and requested_file.is_file()
        ):
            return FileResponse(requested_file)
        return FileResponse(index_file)


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(application: FastAPI):
        validate_production_settings(resolved_settings)
        run_migrations(resolved_settings)
        engine = create_database_engine(resolved_settings.database_path)
        application.state.session_factory = create_session_factory(engine)
        ensure_admin(application.state.session_factory, resolved_settings)
        recover_restore_journals(
            resolved_settings.uploads_dir,
            application.state.session_factory,
        )
        recover_tenant_file_deletions(
            resolved_settings.uploads_dir,
            application.state.session_factory,
        )
        scheduler = (
            start_scheduler(application.state.session_factory)
            if resolved_settings.scheduler_enabled
            else None
        )
        application.state.scheduler = scheduler
        try:
            yield
        finally:
            if scheduler is not None:
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
    application.add_middleware(RestoreUploadGuardMiddleware)
    application.include_router(auth_router)
    application.include_router(apartments_router)
    application.include_router(tenants_router)
    application.include_router(services_router)
    application.include_router(rates_router)
    application.include_router(invoices_router)
    application.include_router(billing_router)
    application.include_router(expenses_router)
    application.include_router(import_router)
    application.include_router(stats_router)
    application.include_router(settings_router)
    application.include_router(push_router)

    @application.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": APP_VERSION}

    add_frontend(application, resolved_settings.static_dir)

    return application


app = create_app()
