from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_db, require_auth
from app.models import PushSubscription
from app.schemas import (
    PushSubscriptionCreate,
    PushSubscriptionDelete,
    PushSubscriptionResponse,
    VapidPublicKeyResponse,
)
from app.services.push import get_vapid_public_key
from app.services.storage import coordinated_write

router = APIRouter(
    prefix="/api/push",
    tags=["push"],
    dependencies=[Depends(require_auth)],
)


@router.get("/public-key", response_model=VapidPublicKeyResponse)
@coordinated_write
def public_key(session: Session = Depends(get_db)) -> dict[str, str]:
    return {"public_key": get_vapid_public_key(session)}


@router.post(
    "/subscriptions",
    response_model=PushSubscriptionResponse,
    status_code=status.HTTP_201_CREATED,
)
@coordinated_write
def upsert_subscription(
    payload: PushSubscriptionCreate,
    session: Session = Depends(get_db),
) -> PushSubscription:
    endpoint = str(payload.endpoint)
    subscription = session.scalar(
        select(PushSubscription).where(PushSubscription.endpoint == endpoint)
    )
    if subscription is None:
        subscription = PushSubscription(
            endpoint=endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
        )
        session.add(subscription)
    else:
        subscription.p256dh = payload.keys.p256dh
        subscription.auth = payload.keys.auth
    session.commit()
    return subscription


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
@coordinated_write
def delete_subscription(
    payload: PushSubscriptionDelete,
    session: Session = Depends(get_db),
) -> Response:
    subscription = session.scalar(
        select(PushSubscription).where(
            PushSubscription.endpoint == str(payload.endpoint)
        )
    )
    if subscription is not None:
        session.delete(subscription)
        session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
