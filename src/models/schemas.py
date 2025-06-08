from pydantic import BaseModel


class WalletData(BaseModel):
    wallet_address: str
    tx_volume: float
    age_days: int


class ScoreResponse(BaseModel):
    score: int
    tier: str
    flags: list[str]
