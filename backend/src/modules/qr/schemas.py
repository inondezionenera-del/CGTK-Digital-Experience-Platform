from pydantic import BaseModel


class QRCredentialResponse(BaseModel):
    credential_value: str
