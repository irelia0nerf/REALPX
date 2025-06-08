import pytest
from httpx import ASGITransport, AsyncClient

from src.main import app


@pytest.mark.asyncio
async def test_score_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "wallet_address": "0xabc",
            "tx_volume": 15000,
            "age_days": 10,
        }
        response = await client.post("/score/", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "score" in data
    assert "tier" in data
    assert "flags" in data
