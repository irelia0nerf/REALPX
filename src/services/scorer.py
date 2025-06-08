from datetime import datetime
from typing import List

from src.models.schemas import WalletData, ScoreResponse
from src.utils.db import get_db


async def compute_score(data: WalletData) -> ScoreResponse:
    flags: List[str] = []
    score = 0

    if data.tx_volume > 10000:
        score += 40
        flags.append("high_volume")
    else:
        flags.append("low_volume")

    if data.age_days < 30:
        score -= 20
        flags.append("new_wallet")

    score += 10 * len(flags)
    score = max(0, min(100, score))

    if score >= 80:
        tier = "AAA"
    elif score >= 50:
        tier = "BB"
    else:
        tier = "RISK"

    db = get_db()
    try:
        await db.scores.insert_one(
            {
                "wallet_address": data.wallet_address,
                "tx_volume": data.tx_volume,
                "age_days": data.age_days,
                "score": score,
                "tier": tier,
                "flags": flags,
                "created_at": datetime.utcnow(),
            }
        )
    except Exception:
        pass

    return ScoreResponse(score=score, tier=tier, flags=flags)
