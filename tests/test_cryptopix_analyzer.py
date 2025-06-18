import pytest
from httpx import AsyncClient
from faker import Faker
from datetime import datetime, timedelta

from app.models.dfc import RuleCondition
from app.models.risk import RiskLevel


@pytest.mark.asyncio
async def test_analyze_cryptopix_transaction_clean(
    client: AsyncClient,
    create_flag_definition,
    create_risk_trigger,
    faker_instance: Faker,
):
    """Testa a análise de uma transação Crypto-Pix limpa."""
    entity_id = "test_clean_wallet_0x123abcef"  # Isso aciona um mock limpo do Sherlock
    pix_key = faker_instance.ssn()
    transaction_id = faker_instance.uuid4()

    # Cria algumas flags DFC
    await create_flag_definition(
        name="is_foundlab_member",
        rules=[
            {
                "field": "is_foundlab_registered",
                "condition": RuleCondition.EQ.value,
                "value": True,
            }
        ],
        weight=0.5,
    )

    input_data = {
        "transaction_id": str(transaction_id),
        "crypto_details": {
            "transaction_hash": faker_instance.sha256(),
            "blockchain": "Ethereum",
            "from_address": entity_id,
            "to_address": "0xExchangeAddress",
            "asset_ticker": "ETH",
            "amount_crypto": 0.5,
            "timestamp": (datetime.utcnow() - timedelta(minutes=5)).isoformat(),
        },
        "pix_details": {
            "pix_key": pix_key,
            "pix_key_type": "CPF",
            "receiver_name": faker_instance.name(),
            "receiver_document": faker_instance.ssn().replace("-", "").replace(".", ""),
            "bank_name": faker_instance.company(),
            "bank_ispb": faker_instance.numerify(text="########"),
            "amount_fiat": 5000.00,
        },
        "user_id": str(faker_instance.uuid4()),
        "ip_address": faker_instance.ipv4(),
    }

    response = await client.post("/cryptopix/analyze", json=input_data)
    assert response.status_code == 200
    result = response.json()

    assert result["transaction_id"] == str(transaction_id)
    assert result["overall_risk_level"] == RiskLevel.LOW.value
    assert result["suggested_action"] == "APPROVE"
    assert "low risk" in result["message"]
    assert result["score_result_summary"]["probability_score"] > 0.5
    assert result["sherlock_result_summary"]["overall_sanction_status"] == "CLEAN"
    assert len(result["triggered_rules"]) == 0


@pytest.mark.asyncio
async def test_analyze_cryptopix_transaction_high_risk_scenario(
    client: AsyncClient,
    create_flag_definition,
    create_risk_trigger,
    faker_instance: Faker,
):
    """Testa a análise de uma transação de alto risco."""
    entity_id_crypto = "sanctioned_entity_mock_test"
    transaction_id = faker_instance.uuid4()

    # Cria flags DFC
    await create_flag_definition(
        name="high_risk_country",
        rules=[
            {"field": "country_iso", "condition": RuleCondition.EQ.value, "value": "IR"}
        ],
        weight=0.9,
    )
    await create_flag_definition(
        name="large_transaction_volume",
        rules=[
            {
                "field": "amount_fiat",
                "condition": RuleCondition.GTE.value,
                "value": 10000.0,
            }
        ],
        weight=0.7,
    )

    # Cria gatilhos Sentinela
    await create_risk_trigger(
        name="critical_sanction_trigger",
        trigger_type="flag_presence",
        flag_name="sherlock_sanction_flag_sanctioned",
        risk_level=RiskLevel.CRITICAL,
    )

    input_data = {
        "transaction_id": str(transaction_id),
        "crypto_details": {
            "transaction_hash": faker_instance.sha256(),
            "blockchain": "Ethereum",
            "from_address": entity_id_crypto,  # Aciona mock de sanção
            "to_address": "0xReceiverExchangeAddress",
            "asset_ticker": "USDT",
            "amount_crypto": 5000.0,
            "timestamp": (datetime.utcnow() - timedelta(minutes=1)).isoformat(),
        },
        "pix_details": {
            "pix_key": faker_instance.ssn(),
            "pix_key_type": "CPF",
            "receiver_name": faker_instance.name(),
            "receiver_document": faker_instance.ssn().replace("-", "").replace(".", ""),
            "bank_name": faker_instance.company(),
            "bank_ispb": faker_instance.numerify(text="########"),
            "amount_fiat": 15000.00,  # Aciona a flag de alto volume
        },
        "user_id": str(faker_instance.uuid4()),
        "ip_address": faker_instance.ipv4(),
    }

    response = await client.post("/cryptopix/analyze", json=input_data)
    assert response.status_code == 200
    result = response.json()

    assert result["transaction_id"] == str(transaction_id)
    assert result["overall_risk_level"] == RiskLevel.CRITICAL.value
    assert result["suggested_action"] == "REJECT"
    assert "sanctioned or highly illicit" in result["message"]
    assert result["sherlock_result_summary"]["overall_sanction_status"] == "SANCTIONED"
