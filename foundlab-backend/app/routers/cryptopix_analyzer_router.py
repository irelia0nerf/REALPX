from fastapi import APIRouter, HTTPException, status
from app.models.cryptopix import CryptoPixTransactionInput, CryptoPixAnalysisResult
from app.services.cryptopix_analyzer_service import CryptoPixAnalyzerService

router = APIRouter()
cryptopix_analyzer_service = CryptoPixAnalyzerService()

@router.post(
    "/analyze",
    response_model=CryptoPixAnalysisResult,
    status_code=status.HTTP_200_OK,
    summary="Analyze a Crypto-to-Pix transaction for reputation and risk",
    response_description="Detailed analysis of a Crypto-to-Pix transaction, including suggested action."
)
async def analyze_cryptopix_transaction_endpoint(input_data: CryptoPixTransactionInput):
    """
    Analyzes a given cryptocurrency-to-Pix transaction to assess its reputation and risk level.
    
    This involves:
    1. **Sherlock Validation**: Checking the reputation of the originating crypto address. 
    2. **Dynamic Flag Application (DFC)**: Applying flags based on combined crypto and Pix metadata. 
    3. **ScoreLab Scoring**: Calculating an overall reputation score for the transaction/entity. 
    4. **Sentinela Risk Assessment**: Evaluating the score and flags against predefined risk triggers. 
    
    Returns a suggested action (APPROVE, REVIEW_MANUAL, REJECT) and a detailed analysis summary. 
    """
    try:
        result = await cryptopix_analyzer_service.analyze_cryptopix_transaction(input_data)
        return result
    except HTTPException as e:
        raise e  # Re-raise known HTTP exceptions
    except Exception as e:
        # Log the full exception here in a real application
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to analyze Crypto-Pix transaction: {e}"
        )
