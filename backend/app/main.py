from fastapi import FastAPI

from app.config import Settings, get_settings

APP_VERSION = "0.1.0"


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved_settings = settings or get_settings()
    application = FastAPI(
        title="HomeTrap API",
        version=APP_VERSION,
        debug=resolved_settings.debug,
    )
    application.state.settings = resolved_settings

    @application.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "version": APP_VERSION}

    return application


app = create_app()
