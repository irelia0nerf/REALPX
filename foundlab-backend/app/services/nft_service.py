from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic_extra_types.color import Color

from app.database import get_collection
from app.models.nft import SigilMeshNFTMetadata, SigilMeshNFTOutput
from app.models.risk import RiskLevel
from app.services.risk_service import SentinelaService
from app.services.score_service import ScoreLabService


class SigilMeshService:
    def __init__(self):
        self.score_service = ScoreLabService()
        self.sentinela_service = SentinelaService()
        self.nft_metadata_collection: Optional[AsyncIOMotorCollection] = None

    def _get_collection(self) -> AsyncIOMotorCollection:
        if self.nft_metadata_collection is None:
            self.nft_metadata_collection = get_collection("nft_metadata")
        return self.nft_metadata_collection

    async def generate_nft_metadata(
        self,
        entity_id: str,
        score_id: str,
        custom_name: Optional[str] = None,
        custom_description: Optional[str] = None,
        image_url: Optional[str] = None,
        background_color: Optional[Color] = None,
    ) -> SigilMeshNFTOutput:
        score_result = await self.score_service.get_score_by_id(score_id)
        if not score_result:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Score with ID {score_id} not found.")

        if score_result.entity_id != entity_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Score ID {score_id} does not belong to entity {entity_id}.",
            )

        latest_risk_assessment = (
            await self.sentinela_service.get_latest_risk_assessment_for_entity(entity_id)
        )
        risk_tier = latest_risk_assessment.overall_risk_level if latest_risk_assessment else RiskLevel.LOW

        name = custom_name if custom_name else f"FoundLab Sigil of Reputation for {entity_id[:10]}..."
        description = (
            custom_description
            if custom_description
            else (
                f"This FoundLab Reputational Sigil represents the digital trust score of {entity_id}. "
                f"It indicates a score of {score_result.probability_score:.4f} "
                f"calculated on {score_result.created_at.strftime('%Y-%m-%d')} (UTC). "
                f"Overall Risk Tier: {risk_tier.value}."
            )
        )

        if not image_url:
            if score_result.probability_score >= 0.8 and risk_tier == RiskLevel.LOW:
                image_url = "https://foundlab.io/sigil_high_reputation.png"
            elif score_result.probability_score >= 0.5:
                image_url = "https://foundlab.io/sigil_medium_reputation.png"
            else:
                image_url = "https://foundlab.io/sigil_low_reputation.png"

        if not background_color:
            if risk_tier == RiskLevel.LOW:
                background_color = Color("#00FF00")
            elif risk_tier == RiskLevel.MEDIUM:
                background_color = Color("#FFFF00")
            elif risk_tier == RiskLevel.HIGH:
                background_color = Color("#FFA500")
            elif risk_tier == RiskLevel.CRITICAL:
                background_color = Color("#FF0000")
            else:
                background_color = Color("#808080")

        attributes = [
            {"trait_type": "FoundLab Score", "value": f"{score_result.probability_score:.4f}"},
            {"trait_type": "Risk Tier", "value": risk_tier.value},
            {"trait_type": "Evaluation Date", "value": score_result.created_at.strftime("%Y-%m-%d")},
            {"trait_type": "Algorithm Version", "value": score_result.algorithm_version},
        ]

        for flag in score_result.flags_used:
            if flag.is_active:
                attributes.append(
                    {"trait_type": f"Flag: {flag.name}", "value": str(flag.value)}
                )

        if score_result.metadata_used:
            attributes.append({"trait_type": "Metadata Context Available", "value": True})

        nft_metadata = SigilMeshNFTMetadata(
            name=name,
            description=description,
            image=image_url,
            external_url=f"https://foundlab.io/entities/{entity_id}",
            attributes=attributes,
            background_color=str(background_color),
        )

        collection = self._get_collection()
        await collection.insert_one(
            {
                "entity_id": entity_id,
                "score_id": score_id,
                "generated_at": datetime.utcnow(),
                "nft_metadata_content": nft_metadata.model_dump(mode='json'),
            }
        )

        return SigilMeshNFTOutput(
            entity_id=entity_id,
            score_id=score_id,
            nft_metadata=nft_metadata,
            message="NFT metadata generated successfully from ScoreLab score. Ready for minting!"
        )
