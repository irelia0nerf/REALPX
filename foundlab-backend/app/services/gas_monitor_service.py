from datetime import datetime, timedelta
from math import fsum
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from app.database import get_collection
from app.models.gas_monitor import (
    GasPatternAnomaly,
    GasConsumptionRecord,
    GasMonitorAnalysisResult,
    IngestGasConsumptionInput,
)


class GasMonitorService:
    def __init__(self):
        self.gas_records_collection: Optional[AsyncIOMotorCollection] = None

    def _get_collection(self) -> AsyncIOMotorCollection:
        if self.gas_records_collection is None:
            self.gas_records_collection = get_collection("gas_records")
        return self.gas_records_collection

    async def ingest_record(self, record_data: Dict[str, Any]) -> GasConsumptionRecord:
        collection = self._get_collection()
        insert_result = await collection.insert_one(record_data)
        if not insert_result.inserted_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to insert gas consumption record.",
            )
        new_record = await collection.find_one({"_id": insert_result.inserted_id})
        return GasConsumptionRecord(**new_record)

    async def get_records_by_entity(self, entity_id: str, limit: int = 10, skip: int = 0) -> List[GasConsumptionRecord]:
        collection = self._get_collection()
        records = []
        cursor = collection.find({"entity_id": entity_id}).sort("timestamp", -1).skip(skip).limit(limit)
        async for record in cursor:
            records.append(GasConsumptionRecord(**record))
        return records

    async def analyze_patterns(self, entity_id: str, lookback_days: int) -> GasMonitorAnalysisResult:
        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=lookback_days)

        collection = self._get_collection()
        records_cursor = collection.find(
            {
                "entity_id": entity_id,
                "timestamp": {"$gte": start_date, "$lte": end_date},
            }
        ).sort("timestamp", 1)

        records_list: List[GasConsumptionRecord] = []
        async for record in records_cursor:
            records_list.append(GasConsumptionRecord(**record))

        if not records_list:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No gas consumption records found for entity '{entity_id}' in the last {lookback_days} days.",
            )

        total_gas_consumed = fsum([r.gas_used for r in records_list])
        avg_gas_per_transaction = total_gas_consumed / len(records_list) if records_list else 0

        anomalies: List[GasPatternAnomaly] = []
        summary = f"Analysis for entity '{entity_id}' over {lookback_days} days finished. "

        threshold_multiplier = 4.0
        for record in records_list:
            if record.gas_used > avg_gas_per_transaction * threshold_multiplier and record.gas_used > 100_000:
                anom = GasPatternAnomaly(
                    entity_id=entity_id,
                    anomaly_type="high_gas_spike",
                    score=min(1.0, (record.gas_used / (avg_gas_per_transaction * threshold_multiplier)) - 1.0),
                    description=f"Transaction {record.transaction_hash} used unusually high gas: {record.gas_used} "
                                f"(avg: {avg_gas_per_transaction:.0f}, threshold: {avg_gas_per_transaction * threshold_multiplier:.0f})",
                    transactions_involved=[record.transaction_hash],
                )
                anomalies.append(anom)

        if anomalies:
            summary += f"Detected {len(anomalies)} potential anomalies."
        else:
            summary += "No significant anomalies detected based on current rules."

        return GasMonitorAnalysisResult(
            entity_id=entity_id,
            analysis_period_start=start_date,
            analysis_period_end=end_date,
            total_transactions_analyzed=len(records_list),
            anomalies=anomalies,
            summary_message=summary,
        )
