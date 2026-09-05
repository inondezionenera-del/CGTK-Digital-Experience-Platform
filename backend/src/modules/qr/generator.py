"""QR credential generation, isolated behind an interface so OD-6 (random
opaque vs signed payload) can be resolved later without touching the
confirmation cascade that calls this.
"""

import secrets
from typing import Protocol


class QRCredentialGenerator(Protocol):
    def generate(self) -> str: ...


class RandomOpaqueQRCredentialGenerator:
    """Default/placeholder implementation for OD-6: a random opaque
    token, validated by DB lookup. Non-sequential, no embedded PII.
    """

    def generate(self) -> str:
        return secrets.token_urlsafe(32)


def get_qr_credential_generator() -> QRCredentialGenerator:
    return RandomOpaqueQRCredentialGenerator()
