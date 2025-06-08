from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from app.database import get_collection
from app.models.dfc import (
    FlagApplicationInput,
    FlagApplyResponse,
    FlagDefinition,
    FlagEvaluationResult,
    RuleCondition,
)


class DFCService:
    def __init__(self):
        self.flags_collection: Optional[AsyncIOMotorCollection] = None

    def _get_collection(self) -> AsyncIOMotorCollection:
        if self.flags_collection is None:
            self.flags_collection = get_collection("flags")
        return self.flags_collection

    async def create_flag_definition(self, flag_data: Dict[str, Any]) -> Optional[FlagDefinition]:
        collection = self._get_collection()
        if await collection.find_one({"name": flag_data["name"]}):
            return None
        insert_result = await collection.insert_one(flag_data)
        new_flag = await collection.find_one({"_id": insert_result.inserted_id})
        return FlagDefinition(**new_flag)

    async def get_all_flag_definitions(self) -> List[FlagDefinition]:
        collection = self._get_collection()
        flags = []
        async for flag in collection.find({}):
            flags.append(FlagDefinition(**flag))
        return flags

    async def get_flag_definition_by_name(self, name: str) -> Optional[FlagDefinition]:
        collection = self._get_collection()
        flag = await collection.find_one({"name": name})
        return FlagDefinition(**flag) if flag else None

    async def update_flag_definition(self, name: str, update_data: Dict[str, Any]) -> Optional[FlagDefinition]:
        collection = self._get_collection()
        update_data.pop("name", None)
        update_result = await collection.update_one({"name": name}, {"$set": update_data})
        if update_result.modified_count == 0:
            return None
        updated_flag = await collection.find_one({"name": name})
        return FlagDefinition(**updated_flag) if updated_flag else None

    async def delete_flag_definition(self, name: str) -> int:
        collection = self._get_collection()
        delete_result = await collection.delete_one({"name": name})
        return delete_result.deleted_count

    def _evaluate_rule(self, rule: dict, metadata: Dict[str, Any]) -> bool:
        field_value = metadata.get(rule["field"])
        condition = rule["condition"]
        rule_value = rule["value"]

        if field_value is None:
            return False

        match condition:
            case RuleCondition.EQ:
                return field_value == rule_value
            case RuleCondition.NE:
                return field_value != rule_value
            case RuleCondition.GT:
                return field_value > rule_value
            case RuleCondition.GTE:
                return field_value >= rule_value
            case RuleCondition.LT:
                return field_value < rule_value
            case RuleCondition.LTE:
                return field_value <= rule_value
            case RuleCondition.CONTAINS:
                return rule_value in field_value if isinstance(field_value, (str, list, dict)) else False
            case RuleCondition.IN:
                return field_value in rule_value if isinstance(rule_value, list) else False
            case _:
                return False

    async def apply_flags_to_entity(self, entity_id: str, metadata: Dict[str, Any]) -> FlagApplyResponse:
        all_flags_definitions = await self.get_all_flag_definitions()
        evaluated_results: List[FlagEvaluationResult] = []
        active_flags_summary: Dict[str, Any] = {}

        for flag_def in all_flags_definitions:
            is_active = False
            reason = "No rules defined." if not flag_def.rules else "No rule matched."
            flag_value = flag_def.default_value

            for rule in flag_def.rules:
                if self._evaluate_rule(rule.model_dump(), metadata):
                    is_active = True
                    reason = f"Rule '{rule.field} {rule.condition} {rule.value}' matched."
                    flag_value = True if flag_def.type == "boolean" else metadata.get(rule["field"], flag_def.default_value)
                    break

            if not flag_def.rules and flag_def.default_value is not None:
                is_active = True
                flag_value = flag_def.default_value

            evaluated_results.append(
                FlagEvaluationResult(
                    flag_name=flag_def.name,
                    value=flag_value,
                    is_active=is_active,
                    weight=flag_def.weight,
                    reason=reason,
                )
            )
            if is_active:
                active_flags_summary[flag_def.name] = flag_value

        return FlagApplyResponse(
            entity_id=entity_id,
            evaluated_flags=evaluated_results,
            active_flags_summary=active_flags_summary,
        )
