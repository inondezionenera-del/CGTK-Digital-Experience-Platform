from pydantic import BaseModel


class ScanRequest(BaseModel):
    credential_value: str


class ScanResponse(BaseModel):
    result: str  # SUCCESS | ALREADY_SCANNED | INVALID_QR
    display_name: str | None = None
