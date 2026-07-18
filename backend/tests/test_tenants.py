import asyncio

from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


async def _create_client(tmp_path):
    settings = Settings(
        database_path=tmp_path / "tenants.db",
        secret_key="test-session-secret",
        debug=True,
        scheduler_enabled=False,
        admin_username="admin",
        admin_password="password",
    )
    application = create_app(settings)
    lifespan = application.router.lifespan_context(application)
    await lifespan.__aenter__()
    client = AsyncClient(
        transport=ASGITransport(app=application),
        base_url="http://test",
    )
    response = await client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "password"},
    )
    assert response.status_code == 200
    return lifespan, client


async def _close_client(lifespan, client: AsyncClient) -> None:
    await client.aclose()
    await lifespan.__aexit__(None, None, None)


async def _create_apartment(client: AsyncClient) -> dict:
    response = await client.post(
        "/api/apartments",
        json={
            "name": "Квартира 1",
            "address": "Київ, вул. Хрещатик, 1",
            "rent_amount": "325.00",
            "rent_currency": "USD",
            "notes": None,
        },
    )
    assert response.status_code == 201
    return response.json()


def _tenant_payload(**overrides) -> dict:
    payload = {
        "full_name": "Оксана Коваль",
        "phone": "+380501234567",
        "email": "oksana@example.com",
        "contract_start": "2025-01-01",
        "contract_end": None,
        "billing_day": None,
        "notes": "Перший контракт",
    }
    payload.update(overrides)
    return payload


async def test_tenant_lifecycle_history_and_current_name(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        apartment = await _create_apartment(client)
        apartment_id = apartment["id"]

        empty_list = await client.get(f"/api/apartments/{apartment_id}/tenants")
        assert empty_list.status_code == 200
        assert empty_list.json() == []
        apartments = (await client.get("/api/apartments")).json()
        assert apartments[0]["current_tenant_name"] is None

        first_response = await client.post(
            f"/api/apartments/{apartment_id}/tenants",
            json=_tenant_payload(),
        )
        assert first_response.status_code == 201
        first = first_response.json()
        assert first["apartment_id"] == apartment_id
        assert first["contract_end"] is None

        duplicate_active = await client.post(
            f"/api/apartments/{apartment_id}/tenants",
            json=_tenant_payload(full_name="Іван Бондар"),
        )
        assert duplicate_active.status_code == 409

        invalid_end = await client.post(
            f"/api/tenants/{first['id']}/end-contract",
            json={"contract_end": "2024-12-31"},
        )
        assert invalid_end.status_code == 422

        end_response = await client.post(
            f"/api/tenants/{first['id']}/end-contract",
            json={"contract_end": "2025-12-31"},
        )
        assert end_response.status_code == 200
        assert end_response.json()["contract_end"] == "2025-12-31"

        repeated_end = await client.post(
            f"/api/tenants/{first['id']}/end-contract",
            json={"contract_end": "2026-01-01"},
        )
        assert repeated_end.status_code == 409

        overlapping = await client.post(
            f"/api/apartments/{apartment_id}/tenants",
            json=_tenant_payload(
                full_name="Іван Бондар",
                contract_start="2025-12-31",
            ),
        )
        assert overlapping.status_code == 409

        second_response = await client.post(
            f"/api/apartments/{apartment_id}/tenants",
            json=_tenant_payload(
                full_name="Іван Бондар",
                email="ivan@example.com",
                contract_start="2026-01-01",
                notes=None,
            ),
        )
        assert second_response.status_code == 201
        second = second_response.json()

        update_response = await client.put(
            f"/api/tenants/{second['id']}",
            json=_tenant_payload(
                full_name="Іван Бондаренко",
                phone="+380671112233",
                email="ivan.bondarenko@example.com",
                contract_start="2026-01-01",
                notes="Оновлені контакти",
            ),
        )
        assert update_response.status_code == 200
        assert update_response.json()["phone"] == "+380671112233"

        overlapping_update = await client.put(
            f"/api/tenants/{first['id']}",
            json=_tenant_payload(contract_end="2026-01-01"),
        )
        assert overlapping_update.status_code == 409

        history = await client.get(f"/api/apartments/{apartment_id}/tenants")
        assert history.status_code == 200
        assert [tenant["full_name"] for tenant in history.json()] == [
            "Іван Бондаренко",
            "Оксана Коваль",
        ]
        apartments = (await client.get("/api/apartments")).json()
        assert apartments[0]["current_tenant_name"] == "Іван Бондаренко"

        reactivate_first = await client.put(
            f"/api/tenants/{first['id']}",
            json=_tenant_payload(),
        )
        assert reactivate_first.status_code == 409

        delete_response = await client.delete(f"/api/tenants/{first['id']}")
        assert delete_response.status_code == 204
        assert (
            await client.delete(f"/api/tenants/{first['id']}")
        ).status_code == 404
    finally:
        await _close_client(lifespan, client)


async def test_tenant_input_validation(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        apartment = await _create_apartment(client)
        endpoint = f"/api/apartments/{apartment['id']}/tenants"

        invalid_email = await client.post(
            endpoint,
            json=_tenant_payload(email="not-an-email"),
        )
        assert invalid_email.status_code == 422

        invalid_dates = await client.post(
            endpoint,
            json=_tenant_payload(
                contract_start="2026-01-01",
                contract_end="2025-12-31",
            ),
        )
        assert invalid_dates.status_code == 422

        for billing_day in (0, 32):
            invalid_billing_day = await client.post(
                endpoint,
                json=_tenant_payload(billing_day=billing_day),
            )
            assert invalid_billing_day.status_code == 422

        tenant = (await client.post(endpoint, json=_tenant_payload())).json()
        invalid_update = await client.put(
            f"/api/tenants/{tenant['id']}",
            json=_tenant_payload(email="missing-domain@"),
        )
        assert invalid_update.status_code == 422
    finally:
        await _close_client(lifespan, client)


async def test_tenant_billing_day_can_be_saved_and_cleared(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        apartment = await _create_apartment(client)
        endpoint = f"/api/apartments/{apartment['id']}/tenants"

        created = await client.post(endpoint, json=_tenant_payload(billing_day=12))
        assert created.status_code == 201
        tenant = created.json()
        assert tenant["billing_day"] == 12

        listed = await client.get(endpoint)
        assert listed.status_code == 200
        assert listed.json()[0]["billing_day"] == 12

        cleared = await client.put(
            f"/api/tenants/{tenant['id']}",
            json=_tenant_payload(billing_day=None),
        )
        assert cleared.status_code == 200
        assert cleared.json()["billing_day"] is None
    finally:
        await _close_client(lifespan, client)


async def test_concurrent_active_tenant_creation_returns_conflict(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        apartment = await _create_apartment(client)
        endpoint = f"/api/apartments/{apartment['id']}/tenants"

        first, second = await asyncio.gather(
            client.post(endpoint, json=_tenant_payload(full_name="Перший")),
            client.post(endpoint, json=_tenant_payload(full_name="Другий")),
        )

        assert sorted([first.status_code, second.status_code]) == [201, 409]
        tenants = await client.get(endpoint)
        assert len(tenants.json()) == 1
    finally:
        await _close_client(lifespan, client)


async def test_tenant_routes_require_auth_and_return_404(tmp_path) -> None:
    lifespan, client = await _create_client(tmp_path)
    try:
        assert (await client.get("/api/apartments/999/tenants")).status_code == 404
        assert (
            await client.post(
                "/api/apartments/999/tenants",
                json=_tenant_payload(),
            )
        ).status_code == 404
        assert (
            await client.put("/api/tenants/999", json=_tenant_payload())
        ).status_code == 404
        assert (
            await client.post(
                "/api/tenants/999/end-contract",
                json={"contract_end": "2026-01-01"},
            )
        ).status_code == 404
        assert (await client.delete("/api/tenants/999")).status_code == 404

        client.cookies.clear()
        assert (await client.get("/api/apartments/1/tenants")).status_code == 401
        assert (await client.delete("/api/tenants/1")).status_code == 401
    finally:
        await _close_client(lifespan, client)
