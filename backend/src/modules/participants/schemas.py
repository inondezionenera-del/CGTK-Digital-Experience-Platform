from uuid import UUID

from pydantic import BaseModel


class ParticipantUpdateRequest(BaseModel):
    reason: str
    # Deliberately narrow for now — extend as real support-editable
    # fields get identified. Never include status/activation here; that
    # stays system-only.
    display_name: str | None = None


class ParticipantResponse(BaseModel):
    id: UUID
    registration_id: UUID
    account_id: UUID
    status: str
