from fastapi import APIRouter

from src.models.schemas import WalletData, ScoreResponse
from src.services.scorer import compute_score

router = APIRouter(prefix="/score", tags=["score"])


@router.post("/", response_model=ScoreResponse)
async def calculate_score(data: WalletData) -> ScoreResponse:
    return await compute_score(data)
