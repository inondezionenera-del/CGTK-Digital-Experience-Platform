from pydantic import BaseModel, model_validator

from src.modules.registration.models import RegistrationStatus


class RegistrationCreateRequest(BaseModel):
    full_name: str
    contact_email: str | None = None
    contact_phone: str | None = None

    @model_validator(mode="after")
    def require_a_contact(self):
        if not self.contact_email and not self.contact_phone:
            raise ValueError("Provide at least an email or a phone number")
        return self


class RegistrationCreateResponse(BaseModel):
    registration_code: str
    status: RegistrationStatus


class RegistrationStatusResponse(BaseModel):
    registration_code: str
    status: RegistrationStatus
    full_name: str


class RegistrationCancelResponse(BaseModel):
    registration_code: str
    status: RegistrationStatus
