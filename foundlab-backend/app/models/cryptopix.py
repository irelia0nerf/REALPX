from datetime import datetime
from typing import Optional, Dict, Any, Literal, List

from pydantic import BaseModel, Field

class CryptoChainDetails(BaseModel):
    """Details about the cryptocurrency transaction."""
    transaction_hash: str = Field(description="Hash of the cryptocurrency transaction.")
    blockchain: str = Field(description="Name of the blockchain (e.g., 'Ethereum', 'Bitcoin', 'Polygon').")
    from_address: str = Field(description="Sender's cryptocurrency address.")
    to_address: str = Field(description="Receiver's cryptocurrency address (often an exchange/bridge address).")
    asset_ticker: str = Field(description="Cryptocurrency ticker (e.g., 'USDT', 'ETH', 'BTC').")
    amount_crypto: float = Field(gt=0, description="Amount of cryptocurrency transacted.")
    timestamp: datetime = Field(description="Timestamp of the crypto transaction.")
    contract_address: Optional[str] = Field(None, description="Contract address for tokens.")
    transaction_type: Optional[str] = Field(None, description="Type of crypto transaction (e.g., 'ERC20 Transfer', 'Liquidity Provision').")

class PixDetails(BaseModel):
    """Details about the Pix transaction."""
    pix_key: str = Field(description="Pix key of the receiver (CPF, CNPJ, email, phone).")
    pix_key_type: Literal["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] = Field(description="Type of Pix key.")
    receiver_name: str = Field(description="Full name of the Pix receiver.")
    receiver_document: Optional[str] = Field(None, description="CPF or CNPJ of the Pix receiver.")
    bank_name: str = Field(description="Name of the bank of the Pix receiver.")
    bank_ispb: str = Field(description="ISPB of the bank of the Pix receiver.")
    amount_fiat: float = Field(gt=0, description="Amount of fiat (BRL) to be received via Pix.")
    pix_transaction_id: Optional[str] = Field(None, description="Unique identifier for the Pix transaction.")

class CryptoPixTransactionInput(BaseModel):
    """Input model for a Crypto-to-Pix transaction analysis."""
    transaction_id: str = Field(description="Unique ID for this specific Crypto-Pix operation.")
    crypto_details: CryptoChainDetails
    pix_details: PixDetails
    user_id: Optional[str] = Field(None, description="Internal user ID initiating the transaction.")
    ip_address: Optional[str] = Field(None, description="IP address of the user initiating the transaction.")
    device_fingerprint: Optional[str] = Field(None, description="Device fingerprint of the user.")

class CryptoPixAnalysisResult(BaseModel):
    """Result of the Crypto-to-Pix transaction analysis."""
    transaction_id: str = Field(description="Unique ID for the analyzed operation.")
    overall_risk_level: str = Field(description="Overall risk level (e.g., LOW, MEDIUM, HIGH, CRITICAL).")
    suggested_action: Literal["APPROVE", "REVIEW_MANUAL", "REJECT", "PENDING"] = Field(description="Suggested action based on the analysis.")
    score_result_summary: Optional[Dict[str, Any]] = Field(None, description="Summary of the ScoreLab result.")
    sherlock_result_summary: Optional[Dict[str, Any]] = Field(None, description="Summary of the Sherlock validation.")
    triggered_rules: List[Dict[str, Any]] = Field(default_factory=list, description="List of risk rules that were triggered.")
    analysis_timestamp: datetime = Field(default_factory=datetime.utcnow)
    message: str = Field(description="A human-readable message summarizing the analysis.")
