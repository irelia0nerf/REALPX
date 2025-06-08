from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection
from bson import ObjectId

from app.database import get_collection
from app.models.score import ScoreInput, ScoreResult
from app.utils.score_calculator import ScoreCalculator


class ScoreLabService:
    def __init__(self):
        self.scores_collection: Optional[AsyncIOMotorCollection] = None
        self.score_calculator = ScoreCalculator()

    def _get_collection(self) -> AsyncIOMotorCollection:
        if self.scores_collection is None:
            self.scores_collection = get_collection("scores")
        return self.scores_collection

    async def calculate_score(self, score_input: ScoreInput) -> ScoreResult:
        """
        Calculates a new reputation score P(x) for a given entity based on provided flags and metadata.
        Only flags marked as `is_active=True` will contribute to the P(x) calculation.
        The full list of flags provided in `score_input` (active and inactive) is stored.
        The calculated score result is stored in the database.
        """
        active_flags = [f for f in score_input.flags if f.is_active]

        raw_score, probability_score = self.score_calculator.calculate_p_x(
            active_flags, score_input.metadata
        )

        score_data = {
            "entity_id": score_input.entity_id,
            "probability_score": probability_score,
            "raw_score": raw_score,
            "algorithm_version": self.score_calculator.version,
            "flags_used": [f.model_dump() for f in score_input.flags],
            "metadata_used": score_input.metadata,
            "summary": f"Reputation score for {score_input.entity_id} is {probability_score:.4f}.",
        }

        collection = self._get_collection()
        insert_result = await collection.insert_one(score_data)
        new_score_doc = await collection.find_one({"_id": insert_result.inserted_id})

        return ScoreResult(**new_score_doc)

    async def get_score_by_id(self, score_id: str) -> Optional[ScoreResult]:
        """Retrieves a previously calculated score by its unique ID."""
        if not ObjectId.is_valid(score_id):
            return None

        _id_obj = ObjectId(score_id)
        collection = self._get_collection()
        score = await collection.find_one({"_id": _id_obj})

        return ScoreResult(**score) if score else None

    async def get_scores_by_entity_id(self, entity_id: str) -> List[ScoreResult]:
        """Retrieves all historical scores for a given entity, ordered by most recent first."""
        scores = []
        collection = self._get_collection()
        cursor = collection.find({"entity_id": entity_id}).sort("created_at", -1)
        async for score_doc in cursor:
            scores.append(ScoreResult(**score_doc))
        return scores
