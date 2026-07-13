import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.mark.parametrize(
    "origin",
    ["https://wecdash.com", "https://www.wecdash.com"],
)
def test_canonical_frontend_origins_are_allowed(origin: str) -> None:
    with TestClient(app) as client:
        response = client.options(
            "/api/v1/events",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


def test_untrusted_origin_is_rejected() -> None:
    with TestClient(app) as client:
        response = client.options(
            "/api/v1/events",
            headers={
                "Origin": "https://untrusted.example",
                "Access-Control-Request-Method": "GET",
            },
        )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers
