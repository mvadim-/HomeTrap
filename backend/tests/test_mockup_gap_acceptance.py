from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app


async def test_tenant_attachments_history_and_empty_stats_acceptance(tmp_path) -> None:
    settings = Settings(
        database_path=tmp_path / "acceptance.db",
        uploads_dir=tmp_path / "uploads",
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

    try:
        login = await client.post(
            "/api/auth/login",
            json={"username": "admin", "password": "password"},
        )
        assert login.status_code == 200

        apartment_response = await client.post(
            "/api/apartments",
            json={
                "name": "Квартира acceptance",
                "address": "Київ, вул. Тестова, 8",
                "rent_amount": "325.00",
                "rent_currency": "USD",
                "notes": None,
            },
        )
        assert apartment_response.status_code == 201
        apartment_id = apartment_response.json()["id"]
        assert (await client.get(f"/api/apartments/{apartment_id}/tenants")).json() == []
        assert (await client.get("/api/apartments")).json()[0]["current_tenant_name"] is None

        first_response = await client.post(
            f"/api/apartments/{apartment_id}/tenants",
            json={
                "full_name": "Оксана Коваль",
                "phone": "+380501112233",
                "email": "oksana@example.com",
                "contract_start": "2025-01-01",
                "contract_end": None,
                "notes": "Перший контракт",
            },
        )
        assert first_response.status_code == 201
        first = first_response.json()
        attachments_endpoint = f"/api/tenants/{first['id']}/attachments"
        assert (await client.get(attachments_endpoint)).json() == []

        upload = await client.post(
            attachments_endpoint,
            files=[
                ("files", ("contract.jpg", b"jpeg-contract", "image/jpeg")),
                ("files", ("contract.pdf", b"pdf-contract", "application/pdf")),
            ],
        )
        assert upload.status_code == 201
        attachments = upload.json()
        assert [item["original_name"] for item in attachments] == [
            "contract.jpg",
            "contract.pdf",
        ]
        for attachment, expected_content in zip(
            attachments,
            (b"jpeg-contract", b"pdf-contract"),
            strict=True,
        ):
            viewed = await client.get(f"/api/attachments/{attachment['id']}")
            assert viewed.status_code == 200
            assert viewed.content == expected_content

        ended = await client.post(
            f"/api/tenants/{first['id']}/end-contract",
            json={"contract_end": "2025-12-31"},
        )
        assert ended.status_code == 200

        second_response = await client.post(
            f"/api/apartments/{apartment_id}/tenants",
            json={
                "full_name": "Іван Бондаренко",
                "phone": None,
                "email": None,
                "contract_start": "2026-01-01",
                "contract_end": None,
                "notes": None,
            },
        )
        assert second_response.status_code == 201
        second = second_response.json()
        assert (await client.get(f"/api/tenants/{second['id']}/attachments")).json() == []

        history = await client.get(f"/api/apartments/{apartment_id}/tenants")
        assert history.status_code == 200
        assert [tenant["full_name"] for tenant in history.json()] == [
            "Іван Бондаренко",
            "Оксана Коваль",
        ]
        assert history.json()[1]["contract_end"] == "2025-12-31"

        for period in (
            {"months": 6},
            {"months": 12},
            {"months": 24},
            {"all_time": "true"},
            {"date_from": "2035-01-01", "date_to": "2035-03-01"},
        ):
            consumption = await client.get(
                "/api/stats/consumption",
                params={"apartment_id": apartment_id, **period},
            )
            income = await client.get(
                "/api/stats/income",
                params={"apartment_id": apartment_id, **period},
            )
            assert consumption.status_code == 200
            assert consumption.json()["series"] == []
            assert income.status_code == 200
            assert income.json()["values"] == []
            assert income.json()["totals"] == {
                "rent": "0.00",
                "utilities": "0.00",
                "adjustments": "0.00",
                "total": "0.00",
            }
            assert income.json()["top_service"] is None
    finally:
        await client.aclose()
        await lifespan.__aexit__(None, None, None)
