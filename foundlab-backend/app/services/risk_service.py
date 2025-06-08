from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from app.database import get_collection
from app.models.risk import (
    RiskAssessmentResult,
    RiskLevel,
    RiskTrigger,
    RiskTriggerDetail,
)


class SentinelaService:
    def __init__(self):
        self.risk_triggers_collection: Optional[AsyncIOMotorCollection] = None
        self.risk_assessments_collection: Optional[AsyncIOMotorCollection] = None

    def _get_triggers_collection(self) -> AsyncIOMotorCollection:
        if self.risk_triggers_collection is None:
            self.risk_triggers_collection = get_collection("risk_triggers")
        return self.risk_triggers_collection

    def _get_assessments_collection(self) -> AsyncIOMotorCollection:
        if self.risk_assessments_collection is None:
            self.risk_assessments_collection = get_collection("risk_assessments")
        return self.risk_assessments_collection

    async def create_risk_trigger(self, trigger_data: Dict[str, Any]) -> Optional[RiskTrigger]:
        collection = self._get_triggers_collection()
        if await collection.find_one({"name": trigger_data["name"]}):
            return None

        now = datetime.utcnow()
        trigger_data["created_at"] = now
        trigger_data["updated_at"] = now

        insert_result = await collection.insert_one(trigger_data)
        new_trigger = await collection.find_one({"_id": insert_result.inserted_id})
        return RiskTrigger(**new_trigger)

    async def get_all_risk_triggers(self) -> List[RiskTrigger]:
        collection = self._get_triggers_collection()
        triggers = []
        async for trigger in collection.find({"is_active": True}):
            triggers.append(RiskTrigger(**trigger))
        return triggers

    async def get_risk_trigger_by_name(self, name: str) -> Optional[RiskTrigger]:
        collection = self._get_triggers_collection()
        trigger = await collection.find_one({"name": name})
        return RiskTrigger(**trigger) if trigger else None

    async def update_risk_trigger(self, name: str, update_data: Dict[str, Any]) -> Optional[RiskTrigger]:
        update_data.pop("name", None)
        update_data["updated_at"] = datetime.utcnow()
        collection = self._get_triggers_collection()
        update_result = await collection.update_one({"name": name}, {"$set": update_data})
        if update_result.modified_count == 0:
            if await collection.find_one({"name": name}):
                return RiskTrigger(**(await collection.find_one({"name": name})))
            return None
        updated_trigger = await collection.find_one({"name": name})
        return RiskTrigger(**updated_trigger) if updated_trigger else None

    async def delete_risk_trigger(self, name: str) -> int:
        collection = self._get_triggers_collection()
        delete_result = await collection.delete_one({"name": name})
        return delete_result.deleted_count

    async def get_latest_risk_assessment_for_entity(self, entity_id: str) -> Optional[RiskAssessmentResult]:
        assessment_collection = self._get_assessments_collection()
        latest_assessment = await assessment_collection.find_one(
            {"entity_id": entity_id}, sort=[("created_at", -1)]
        )
        return RiskAssessmentResult(**latest_assessment) if latest_assessment else None

    async def assess_entity_risk(
        self, entity_id: str, score_id: str, additional_context: Optional[Dict[str, Any]] = None
    ) -> RiskAssessmentResult:
        from app.services.score_service import ScoreLabService

        score_service = ScoreLabService()
        score_result = await score_service.get_score_by_id(score_id)
        if not score_result:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Score with ID {score_id} not found.")

        if score_result.entity_id != entity_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Score ID {score_id} does not belong to entity {entity_id}.",
            )

        active_triggers = await self.get_all_risk_triggers()
        triggered_rules: List[RiskTriggerDetail] = []

        risk_level_order = {
            RiskLevel.LOW: 0,
            RiskLevel.MEDIUM: 1,
            RiskLevel.HIGH: 2,
            RiskLevel.CRITICAL: 3,
        }
        current_highest_level = RiskLevel.LOW

        for trigger in active_triggers:
            is_triggered = False
            reason = ""

            match trigger.trigger_type:
                case "score_threshold":
                    if trigger.score_threshold is not None and score_result.probability_score < trigger.score_threshold:
                        is_triggered = True
                        reason = (
                            f"Score ({score_result.probability_score:.4f}) is below "
                            f"threshold ({trigger.score_threshold:.4f})."
                        )
                case "flag_presence":
                    if trigger.flag_name:
                        matched_flag = next(
                            (f for f in score_result.flags_used if f.name == trigger.flag_name and f.is_active), None
                        )
                        if matched_flag:
                            is_triggered = True
                            reason = f"Flag '{trigger.flag_name}' is active with value '{matched_flag.value}'."
                case "custom_logic":
                    if trigger.custom_logic_params:
                        max_score_param = trigger.custom_logic_params.get("max_score", 1.0)
                        min_recent_volume_param = trigger.custom_logic_params.get("min_recent_volume", 0.0)
                        current_recent_volume = (
                            additional_context.get("recent_transaction_volume_usd", 0.0) if additional_context else 0.0
                        )

                        if (
                            score_result.probability_score <= max_score_param
                            and current_recent_volume >= min_recent_volume_param
                        ):
                            is_triggered = True
                            reason = (
                                f"Custom logic: Score ({score_result.probability_score:.4f}) <= {max_score_param} "
                                f"and recent volume ({current_recent_volume}) >= {min_recent_volume_param}."
                            )

            if is_triggered:
                triggered_rules.append(
                    RiskTriggerDetail(
                        trigger_name=trigger.name, risk_level=trigger.risk_level, reason=reason
                    )
                )
                if risk_level_order[trigger.risk_level] > risk_level_order[current_highest_level]:
                    current_highest_level = trigger.risk_level

        summary_message = f"Risk assessment for {entity_id}: Overall {current_highest_level.value}."
        if triggered_rules:
            summary_message += f" ({len(triggered_rules)} rules triggered)."

        assessment_data = RiskAssessmentResult(
            entity_id=entity_id,
            score_id=score_id,
            overall_risk_level=current_highest_level,
            triggered_rules=triggered_rules,
            summary_message=summary_message,
        ).model_dump(by_alias=True)

        assessment_collection = self._get_assessments_collection()
        insert_result = await assessment_collection.insert_one(assessment_data)
        new_assessment = await assessment_collection.find_one({"_id": insert_result.inserted_id})
        return RiskAssessmentResult(**new_assessment)
