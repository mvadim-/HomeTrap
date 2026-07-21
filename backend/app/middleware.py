from __future__ import annotations

from fastapi import Request, status
from starlette.concurrency import run_in_threadpool
from starlette.formparsers import MultiPartException
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.auth import is_authenticated
from app.services.backup_limits import MAX_RESTORE_REQUEST_SIZE


class _RequestBodyTooLarge(MultiPartException):
    def __init__(self) -> None:
        super().__init__("Backup request exceeds the upload size limit")


class RestoreUploadGuardMiddleware:
    """Authenticate and bound restore requests before multipart parsing."""

    def __init__(
        self,
        app: ASGIApp,
        max_body_size: int = MAX_RESTORE_REQUEST_SIZE,
    ) -> None:
        self.app = app
        self.max_body_size = max_body_size

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if not self._guards(scope):
            await self.app(scope, receive, send)
            return

        request = Request(scope)
        authenticated = await run_in_threadpool(is_authenticated, request)
        if not authenticated:
            await self._response(status.HTTP_401_UNAUTHORIZED, "Not authenticated")(
                scope, receive, send
            )
            return

        content_length = request.headers.get("content-length")
        try:
            if content_length is not None and int(content_length) > self.max_body_size:
                await self._too_large(scope, receive, send)
                return
        except ValueError:
            await self._too_large(scope, receive, send)
            return

        received = 0
        body_too_large = False

        async def limited_receive() -> Message:
            nonlocal body_too_large, received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_body_size:
                    body_too_large = True
                    raise _RequestBodyTooLarge
            return message

        response_messages: list[Message] = []

        async def buffered_send(message: Message) -> None:
            response_messages.append(message)

        try:
            await self.app(scope, limited_receive, buffered_send)
        except _RequestBodyTooLarge:
            body_too_large = True

        if body_too_large:
            await self._too_large(scope, receive, send)
            return
        for message in response_messages:
            await send(message)

    @staticmethod
    def _guards(scope: Scope) -> bool:
        return (
            scope["type"] == "http"
            and scope["method"] == "POST"
            and scope["path"] == "/api/settings/restore"
        )

    @staticmethod
    def _response(status_code: int, detail: str) -> JSONResponse:
        return JSONResponse({"detail": detail}, status_code=status_code)

    async def _too_large(self, scope: Scope, receive: Receive, send: Send) -> None:
        await self._response(
            status.HTTP_413_CONTENT_TOO_LARGE,
            "Backup request exceeds the upload size limit",
        )(scope, receive, send)
