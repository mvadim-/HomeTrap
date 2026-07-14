from __future__ import annotations

import base64
import hashlib
import hmac
import time
from collections import defaultdict, deque
from collections.abc import Iterator

import bcrypt
from fastapi import Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.models import User

SESSION_COOKIE_NAME = "hometrap_session"
SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 60 * 15


class LoginRateLimiter:
    def __init__(
        self,
        limit: int = LOGIN_ATTEMPT_LIMIT,
        window_seconds: int = LOGIN_ATTEMPT_WINDOW_SECONDS,
    ) -> None:
        self.limit = limit
        self.window_seconds = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)

    def is_limited(self, client_ip: str, now: float | None = None) -> bool:
        current_time = now if now is not None else time.monotonic()
        failures = self._failures[client_ip]
        cutoff = current_time - self.window_seconds
        while failures and failures[0] <= cutoff:
            failures.popleft()
        if not failures:
            self._failures.pop(client_ip, None)
            return False
        return len(failures) >= self.limit

    def record_failure(self, client_ip: str, now: float | None = None) -> None:
        self._failures[client_ip].append(
            now if now is not None else time.monotonic()
        )

    def clear(self, client_ip: str) -> None:
        self._failures.pop(client_ip, None)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def ensure_admin(
    session_factory: sessionmaker[Session],
    settings: Settings,
) -> None:
    if settings.admin_username is None and settings.admin_password is None:
        return
    if not settings.admin_username or not settings.admin_password:
        raise RuntimeError(
            "ADMIN_USERNAME and ADMIN_PASSWORD must be configured together"
        )

    with session_factory() as session:
        existing_user = session.scalar(
            select(User).where(User.username == settings.admin_username)
        )
        if existing_user is not None:
            return
        session.add(
            User(
                username=settings.admin_username,
                password_hash=hash_password(settings.admin_password),
            )
        )
        session.commit()


def get_db(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


def _encode_session(user_id: int, secret_key: str) -> str:
    expires_at = int(time.time()) + SESSION_MAX_AGE_SECONDS
    payload = f"{user_id}:{expires_at}".encode()
    encoded_payload = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signature = hmac.new(secret_key.encode(), payload, hashlib.sha256).hexdigest()
    return f"{encoded_payload}.{signature}"


def _decode_session(cookie_value: str, secret_key: str) -> int | None:
    try:
        encoded_payload, signature = cookie_value.rsplit(".", 1)
        padding = "=" * (-len(encoded_payload) % 4)
        payload = base64.urlsafe_b64decode((encoded_payload + padding).encode())
        expected_signature = hmac.new(
            secret_key.encode(), payload, hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(signature, expected_signature):
            return None
        raw_user_id, raw_expires_at = payload.decode().split(":", 1)
        if int(raw_expires_at) < int(time.time()):
            return None
        return int(raw_user_id)
    except (ValueError, UnicodeDecodeError):
        return None


def set_session_cookie(response: Response, user_id: int, settings: Settings) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=_encode_session(user_id, settings.secret_key),
        max_age=SESSION_MAX_AGE_SECONDS,
        httponly=True,
        secure=not settings.debug,
        samesite="lax",
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        httponly=True,
        samesite="lax",
        path="/",
    )


def require_auth(
    request: Request,
    session: Session = Depends(get_db),
) -> User:
    cookie_value = request.cookies.get(SESSION_COOKIE_NAME)
    settings: Settings = request.app.state.settings
    user_id = (
        _decode_session(cookie_value, settings.secret_key) if cookie_value else None
    )
    user = session.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )
    return user
