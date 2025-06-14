from typing import Any, Dict, List, Optional
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from app.database import get_collection
from app.models.cryptopix import CryptoPixTransactionInput, CryptoPixAnalysisResult
from app.models.score import ScoreInput, FlagWithValue
from app.models.sherlock import SherlockValidationInput, SanctionStatus
from app.models.risk import RiskLevel, RiskAssessmentInput
from app.services.dfc_service import DFCService
from app.services.score_service import ScoreLabService
from app.services.sherlock_service import SherlockService
from app.services.risk_service import SentinelaService

class CryptoPixAnalyzerService:
    def __init__(self):
        self.dfc_service = DFCService()
        self.score_service = ScoreLabService()
        self.sherlock_service = SherlockService()
        self.sentinela_service = SentinelaService()
        self.analysis_collection: Optional[AsyncIOMotorCollection] = None

    def _get_collection(self) -> AsyncIOMotorCollection:
        if self.analysis_collection is None:
            self.analysis_collection = get_collection("cryptopix_analysis")
        return self.analysis_collection

    async def analyze_cryptopix_transaction(self, input_data: CryptoPixTransactionInput) -> CryptoPixAnalysisResult:
        # 1. Sherlock: Validate crypto sender address 
        sherlock_input = SherlockValidationInput(
            entity_id=input_data.crypto_details.from_address,
            entity_type="wallet_address"
        )
        sherlock_result = await self.sherlock_service.validate_entity(sherlock_input)

        # 2. DFC: Apply dynamic flags 
        dfc_metadata = {
            "amount_fiat": input_data.pix_details.amount_fiat,
            "amount_crypto": input_data.crypto_details.amount_crypto,
            "blockchain": input_data.crypto_details.blockchain,
            "pix_key_type": input_data.pix_details.pix_key_type,
            "receiver_document": input_data.pix_details.receiver_document,
            "bank_ispb": input_data.pix_details.bank_ispb,
            "ip_address": input_data.ip_address,
            "device_fingerprint": input_data.device_fingerprint,
            **input_data.crypto_details.model_dump(exclude_unset=True),
            **input_data.pix_details.model_dump(exclude_unset=True),
            "sherlock_sanction_status": sherlock_result.overall_sanction_status.value,
            "sherlock_risk_score": sherlock_result.overall_risk_score,
        }
        dfc_apply_result = await self.dfc_service.apply_flags_to_entity(input_data.transaction_id, dfc_metadata)

        # 3. ScoreLab: Calculate reputation score 
        score_flags: List[FlagWithValue] = [FlagWithValue(**f.model_dump()) for f in dfc_apply_result.evaluated_flags if f.is_active]
        if sherlock_result.overall_sanction_status in [SanctionStatus.SANCTIONED, SanctionStatus.HIGH_RISK]:
            score_flags.append(FlagWithValue(
                name=f"sherlock_sanction_flag_{sherlock_result.overall_sanction_status.value.lower()}",
                value=True,
                weight=sherlock_result.overall_risk_score,
                is_active=True
            ))
        score_input = ScoreInput(
            entity_id=input_data.transaction_id,
            flags=score_flags,
            metadata=dfc_metadata
        )
        score_result = await self.score_service.calculate_score(score_input)

        # 4. Sentinela: Assess overall risk 
        risk_assessment_input = RiskAssessmentInput(
            entity_id=input_data.transaction_id,
            score_id=str(score_result.id),
            additional_context={
                "sherlock_overall_sanction_status": sherlock_result.overall_sanction_status.value,
                "sherlock_overall_risk_score": sherlock_result.overall_risk_score,
                "dfc_active_flags_summary": dfc_apply_result.active_flags_summary,
                "original_user_id": input_data.user_id,
                "original_ip_address": input_data.ip_address,
                **input_data.crypto_details.model_dump(exclude_unset=True),
                **input_data.pix_details.model_dump(exclude_unset=True),
            }
        )
        sentinela_result = await self.sentinela_service.assess_entity_risk(
            risk_assessment_input.entity_id,
            risk_assessment_input.score_id,
            risk_assessment_input.additional_context
        )

        # 5. Determine Suggested Action and Final Message 
        overall_risk_level = sentinela_result.overall_risk_level
        suggested_action = "APPROVE"
        message = "Transaction appears low risk."
        if overall_risk_level == RiskLevel.CRITICAL: [cite: 28]
            suggested_action = "REJECT"
            message = "Transaction rejected due to critical risk factors."
        elif overall_risk_level == RiskLevel.HIGH: [cite: 29]
            suggested_action = "REVIEW_MANUAL"
            message = "Transaction requires manual review due to high risk factors."
        elif overall_risk_level == RiskLevel.MEDIUM:
            suggested_action = "REVIEW_MANUAL"
            message = "Transaction flagged for manual review due to medium risk." [cite: 30]
        
        if sherlock_result.suggested_action == "block": [cite: 31]
            suggested_action = "REJECT"
            overall_risk_level = RiskLevel.CRITICAL
            message = "Transaction rejected: Crypto address is sanctioned or highly illicit."
        elif sherlock_result.suggested_action == "review_manual" and suggested_action == "APPROVE": [cite: 32]
            suggested_action = "REVIEW_MANUAL"
            message = "Transaction flagged for manual review: Crypto address needs further check."

        # Prepare summary results 
        score_summary = {
            "probability_score": score_result.probability_score,
            "raw_score": score_result.raw_score,
            "flags_used_count": len(score_result.flags_used),
            "summary": score_result.summary
        }
        sherlock_summary = {
            "overall_sanction_status": sherlock_result.overall_sanction_status.value,
            "overall_risk_score": sherlock_result.overall_risk_score,
            "sherlock_flags_count": len(sherlock_result.sherlock_flags)
        }
        triggered_rules_summary = [{"trigger_name": tr.trigger_name, "risk_level": tr.risk_level.value, "reason": tr.reason} for tr in sentinela_result.triggered_rules]

        final_result = CryptoPixAnalysisResult(
            transaction_id=input_data.transaction_id,
            overall_risk_level=overall_risk_level.value,
            suggested_action=suggested_action,
            score_result_summary=score_summary,
            sherlock_result_summary=sherlock_summary,
            triggered_rules=triggered_rules_summary,
            message=message
        )

        # Save to DB
        collection = self._get_collection()
        await collection.insert_one(final_result.model_dump(by_alias=True, exclude_none=True))

        return final_result
