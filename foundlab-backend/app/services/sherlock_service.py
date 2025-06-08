from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from app.database import get_collection
from app.models.sherlock import (
    ComplianceFlag,
    ExternalProviderResult,
    ProviderStatus,
    SanctionStatus,
    SherlockValidationInput,
    SherlockValidationResult,
)


class SherlockService:
    def __init__(self):
        self.validation_results_collection: Optional[AsyncIOMotorCollection] = None

    def _get_collection(self) -> AsyncIOMotorCollection:
        if self.validation_results_collection is None:
            self.validation_results_collection = get_collection("sherlock_results")
        return self.validation_results_collection

    async def _mock_chainalysis_check(self, entity_id: str, entity_type: str) -> ExternalProviderResult:
        flags: List[ComplianceFlag] = []
        score = 0.1
        status_val = ProviderStatus.SUCCESS
        message = "No significant issues found by Chainalysis."

        if "sanctioned_entity" in entity_id.lower() or "ofac_test" in entity_id.lower():
            flags.append(ComplianceFlag(flag_name="OFAC_SDN_Match", category="Sanctions", value="Direct hit", severity=1.0))
            score = 1.0
            message = "Entity directly linked to OFAC SDN list."
        elif "dark_market_exposure" in entity_id.lower():
            flags.append(ComplianceFlag(flag_name="Dark_Market_Involvement", category="Illicit Activities", value="Indirect exposure", severity=0.85))
            flags.append(ComplianceFlag(flag_name="High_Risk_DEX_Usage", category="DeFi & Exchanges", value="Extensive DEX only activity", severity=0.6))
            score = 0.85
            message = "Entity has exposure to dark market transactions."
        elif "high_volume_gambling" in entity_id.lower():
            flags.append(ComplianceFlag(flag_name="High_Intensity_Gambling", category="AML", value="Frequent large transfers to gambling sites", severity=0.7))
            score = 0.7
            message = "High volume of transactions with known gambling services."
        elif "under_investigation" in entity_id.lower():
            status_val = ProviderStatus.PENDING
            message = "Entity is currently under investigation, manual review required."
            score = 0.5
        elif "mixer_usage" in entity_id.lower():
            flags.append(ComplianceFlag(flag_name="Crypto_Mixer_Usage", category="Privacy Enhancing", value="Observed interaction with CoinJoin/mixers", severity=0.75))
            score = 0.75
            message = "Transaction history includes interaction with cryptocurrency mixers."

        return ExternalProviderResult(
            provider_name="Chainalysis",
            status=status_val,
            score=score,
            flags=flags,
            message=message,
        )

    async def _mock_trm_labs_check(self, entity_id: str, entity_type: str) -> ExternalProviderResult:
        flags: List[ComplianceFlag] = []
        score = 0.05
        status_val = ProviderStatus.SUCCESS
        message = "No red flags from TRM Labs."

        if "terror_finance_org" in entity_id.lower() or "cft_listed" in entity_id.lower():
            flags.append(ComplianceFlag(flag_name="CFT_List_Match", category="Terrorist Financing", value="Match on CFT watchlist", severity=0.98))
            score = 0.98
            message = "Entity found on Counter-Terrorism Financing watchlist."
        elif "pep_exposed" in entity_id.lower():
            flags.append(ComplianceFlag(flag_name="PEP_Exposure", category="AML", value="Politically Exposed Person", severity=0.6))
            score = 0.6
            message = "Entity flagged as Politically Exposed Person."
        elif "sanctioned_entity" in entity_id.lower():
            flags.append(ComplianceFlag(flag_name="Global_Sanctions_Match", category="Sanctions", value="International sanctions list", severity=0.95))
            score = 0.95
            message = "Entity found on global sanctions lists."
        elif "high_risk_jurisdiction" in entity_id.lower():
            flags.append(ComplianceFlag(flag_name="High_Risk_Jurisdiction_Link", category="Geographic Risk", value="Tied to known high-risk region", severity=0.8))
            score = 0.8
            message = "Entity linked to a high-risk jurisdiction."

        return ExternalProviderResult(
            provider_name="TRM Labs",
            status=status_val,
            score=score,
            flags=flags,
            message=message,
        )

    async def validate_entity(self, validation_input: SherlockValidationInput) -> SherlockValidationResult:
        provider_results: List[ExternalProviderResult] = []

        chainalysis_result = await self._mock_chainalysis_check(validation_input.entity_id, validation_input.entity_type)
        provider_results.append(chainalysis_result)

        trm_labs_result = await self._mock_trm_labs_check(validation_input.entity_id, validation_input.entity_type)
        provider_results.append(trm_labs_result)

        overall_risk_score = 0.0
        overall_sanction_status = SanctionStatus.UNKNOWN if any(res.status == ProviderStatus.PENDING for res in provider_results) else SanctionStatus.CLEAN
        sherlock_flags: List[ComplianceFlag] = []

        sanction_or_cft_flag_detected = False
        pep_or_watchlist_flag_detected = False
        high_risk_aml_or_illicit_detected = False

        for res in provider_results:
            if res.status == ProviderStatus.SUCCESS:
                if res.score is not None:
                    overall_risk_score = max(overall_risk_score, res.score)

                for flag in res.flags:
                    sherlock_flags.append(flag)
                    if "sanction" in flag.flag_name.lower() or "cft" in flag.flag_name.lower():
                        sanction_or_cft_flag_detected = True
                    if "pep" in flag.flag_name.lower() or "watchlist" in flag.flag_name.lower():
                        pep_or_watchlist_flag_detected = True
                    if flag.category in ["AML", "Illicit Activities"] and flag.severity >= 0.7:
                        high_risk_aml_or_illicit_detected = True

        if sanction_or_cft_flag_detected:
            overall_sanction_status = SanctionStatus.SANCTIONED
        elif pep_or_watchlist_flag_detected or high_risk_aml_or_illicit_detected:
            overall_sanction_status = SanctionStatus.HIGH_RISK
        elif overall_sanction_status == SanctionStatus.CLEAN and overall_risk_score >= 0.7:
            overall_sanction_status = SanctionStatus.HIGH_RISK

        suggested_action = "proceed"
        if overall_sanction_status == SanctionStatus.SANCTIONED:
            suggested_action = "block"
        elif overall_sanction_status in [SanctionStatus.HIGH_RISK, SanctionStatus.UNKNOWN]:
            suggested_action = "review_manual"

        result = SherlockValidationResult(
            entity_id=validation_input.entity_id,
            entity_type=validation_input.entity_type,
            overall_sanction_status=overall_sanction_status,
            overall_risk_score=overall_risk_score,
            provider_results=provider_results,
            sherlock_flags=sherlock_flags,
            suggested_action=suggested_action,
        )

        collection = self._get_collection()
        inserted_result = await collection.insert_one(result.model_dump(by_alias=True))
        if not inserted_result.inserted_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to save Sherlock validation result.",
            )

        new_result = await collection.find_one({"_id": inserted_result.inserted_id})
        return SherlockValidationResult(**new_result)

    async def get_validation_results_by_entity_id(self, entity_id: str) -> List[SherlockValidationResult]:
        collection = self._get_collection()
        results = []
        cursor = collection.find({"entity_id": entity_id}).sort("created_at", -1)
        async for result_doc in cursor:
            results.append(SherlockValidationResult(**result_doc))
        return results
