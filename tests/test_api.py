from fastapi.testclient import TestClient
from services.api_gateway.app import app

client = TestClient(app)


def test_health():
    assert client.get("/health").json()["status"] == "ok"


def test_auth_and_dna():
    token = client.post("/auth/token", params={"subject": "test"}).json()["access_token"]
    response = client.post(
        "/dna",
        headers={"Authorization": f"Bearer {token}"},
        json={"traveller_id": "1", "emails": ["I love museums"]},
    )
    assert response.status_code == 200
