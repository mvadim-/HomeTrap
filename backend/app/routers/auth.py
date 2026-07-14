from ipaddress import ip_address, ip_network

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import (
    LoginRateLimiter,
    clear_session_cookie,
    get_db,
    require_auth,
    set_session_cookie,
    verify_password,
)
from app.config import Settings
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str


def _client_ip(request: Request, settings: Settings) -> str:
    peer = request.client.host if request.client else "unknown"
    try:
        peer_address = ip_address(peer)
        trusted_proxies = [
            ip_network(value.strip(), strict=False)
            for value in settings.trusted_proxy_cidrs.split(",")
            if value.strip()
        ]
    except ValueError:
        return peer
    if not any(peer_address in network for network in trusted_proxies):
        return peer

    forwarded_for = request.headers.get("x-forwarded-for")
    if not forwarded_for:
        return peer
    try:
        forwarded_addresses = [
            ip_address(value.strip()) for value in forwarded_for.split(",")
        ]
    except ValueError:
        return peer
    for address in reversed(forwarded_addresses):
        if not any(address in network for network in trusted_proxies):
            return str(address)
    return str(forwarded_addresses[0])


@router.post("/login", response_model=UserResponse)
def login(
    credentials: LoginRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_db),
) -> User:
    settings: Settings = request.app.state.settings
    client_ip = _client_ip(request, settings)
    limiter: LoginRateLimiter = request.app.state.login_rate_limiter
    if limiter.is_limited(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts",
        )

    user = session.scalar(select(User).where(User.username == credentials.username))
    if user is None or not verify_password(credentials.password, user.password_hash):
        limiter.record_failure(client_ip)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    limiter.clear(client_ip)
    set_session_cookie(response, user.id, settings)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response) -> None:
    clear_session_cookie(response)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(require_auth)) -> User:
    return user
