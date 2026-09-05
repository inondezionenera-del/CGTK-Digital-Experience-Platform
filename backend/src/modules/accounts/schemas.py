from uuid import UUID

from pydantic import BaseModel


class LoginRequest(BaseModel):
    registration_code: str
    contact: str


class LoginResponse(BaseModel):
    access_token: str
    account_id: UUID


class MeResponse(BaseModel):
    account_id: UUID
    registration_code: str
    full_name: str
    registration_status: str
    participant_status: str | None
    has_qr: bool
