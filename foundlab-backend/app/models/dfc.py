from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union

from pydantic import BaseModel, Field
from pydantic_extra_types.color import Color

from app.models.base import MongoBaseModel


class FlagType(str, Enum):
    BOOLEAN = "boolean"
    NUMERIC = "numeric"
    CATEGORY = "category"


class RuleCondition(str, Enum):
    EQ = "eq"  # equals
    NE = "ne"  # not equals
    GT = "gt"  # greater than
    GTE = "gte"  # greater than or equals
    LT = "lt"  # less than
    LTE = "lte"  # less than or equals
    CONTAINS = "contains"  # for string or list
    IN = "in"  # value in list
    NOT_CONTAINS = "not_contains" # NOVO: para DFC v2
    NOT_IN = "not_in"             # NOVO: para DFC v2


class Rule(BaseModel):
    """Defines a single rule for a flag."""

    field: str = Field(description="The field in the input data to check.")
    condition: RuleCondition = Field(description="The condition to apply (e.g., eq, gt).")
    value: Any = Field(description="The value to compare against.")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"field": "country", "condition": "eq", "value": "SanctionedLand"},
                {"field": "transaction_amount", "condition": "gte", "value": 10000.0},
            ]
        }
    }


class FlagDefinition(MongoBaseModel):
    """Defines the structure and rules for a dynamic flag."""

    name: str = Field(description="Unique name of the flag (e.g., high_risk_country, suspicious_transaction).")
    description: str = Field(description="A brief description of what the flag signifies.")
    type: FlagType = Field(description="The type of the flag (e.g., boolean, numeric, category).")
    default_value: Optional[Any] = Field(None, description="Default value if no rules match or input is missing.")
    rules: List[Rule] = Field(default_factory=list, description="List of rules to evaluate for this flag.")
    weight: float = Field(0.0, description="Numerical weight for scoring purposes.")
    category: Optional[str] = Field(None, description="Optional categorization for the flag (e.g., compliance, fraud).")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "name": "is_high_risk_country",
                    "description": "True if transaction originates from a high-risk country.",
                    "type": "boolean",
                    "default_value": False,
                    "rules": [{"field": "origin_country", "condition": "in", "value": ["SY", "IR", "KP"]}],
                    "weight": 0.8,
                    "category": "compliance",
                },
                {
                    "name": "transaction_risk_score",
                    "description": "Calculated risk score for a transaction based on amount.",
                    "type": "numeric",
                    "default_value": 0.0,
                    "rules": [
                        {"field": "amount", "condition": "gt", "value": 10000.0},
                        {"field": "amount", "condition": "lte", "value": 50000.0},
                    ],
                    "weight": 0.7,
                    "category": "fraud",
                }
            ]
        }
    }


class DynamicFlagCreate(BaseModel):
    name: str
    description: str
    type: FlagType
    default_value: Optional[Any] = None
    rules: List[Rule] = []
    weight: float = 0.0
    category: Optional[str] = None

    model_config = {
        "json_schema_extra": {
            "examples": FlagDefinition.model_config["json_schema_extra"]["examples"]
        }
    }


class DynamicFlagUpdate(BaseModel):
    description: Optional[str] = None
    type: Optional[FlagType] = None
    default_value: Optional[Any] = None
    rules: Optional[List[Rule]] = None
    weight: Optional[float] = None
    category: Optional[str] = None


class FlagEvaluationResult(BaseModel):
    """Represents the result of evaluating a dynamic flag for an entity."""

    flag_name: str = Field(description="Name of the evaluated flag.")
    value: Any = Field(description="Resolved value for the flag.")
    is_active: bool = Field(description="Whether the flag is considered active.")
    weight: float = Field(0.0, description="Weight applied to this flag.")
    reason: str = Field(description="Explanation of how the flag was evaluated.")


class FlagApplicationInput(BaseModel):
    """Input for applying DFC flags to a specific entity or context."""

    entity_id: str = Field(description="Unique identifier for the entity being evaluated.")
    metadata: Dict[str, Any] = Field(description="Contextual metadata for flag evaluation (e.g., transaction_amount, country).")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "entity_id": "user_xyz",
                    "metadata": {
                        "age": 30,
                        "country": "US",
                        "transaction_amount": 1500.0,
                        "is_kyc_verified": True,
                        "past_flags": ["high_volume_user"]
                    }
                }
            ]
        }
    }


class FlagApplyResponse(BaseModel):
    """Response containing evaluated flags for a given input."""

    entity_id: str
    evaluated_flags: List["FlagEvaluationResult"]
    active_flags_summary: Dict[str, Any] = Field(description="Summary of active flags (name: value).")

