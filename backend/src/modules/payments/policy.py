"""Pricing (OD-8) and expiry-duration (OD-9) policies, isolated behind
small interfaces so neither undecided OPEN Decision blocks Phase C.
Swapping the implementation later must not require touching
service.py/confirmation.py callers.
"""

from datetime import datetime, timedelta, timezone
from typing import Protocol

from src.modules.payments.models import PaymentMethod


class PricingPolicy(Protocol):
    def amount_for(self, method: PaymentMethod) -> float: ...


class FlatPricingPolicy:
    """OD-8 placeholder: one flat amount regardless of method, category,
    or early-bird timing. NOT a settled business decision.
    """

    def __init__(self, flat_amount: float = 150_000.0) -> None:
        self._flat_amount = flat_amount

    def amount_for(self, method: PaymentMethod) -> float:
        return self._flat_amount


class ExpiryPolicy(Protocol):
    def expires_at_for(self, method: PaymentMethod) -> datetime: ...


class FixedWindowExpiryPolicy:
    """OD-9 placeholder durations. Different window per method mirrors
    the settled reasoning (QRIS short, CASH long) from Phase 2 — the
    exact numbers below are NOT settled facts.
    """

    def __init__(self, qris_hours: int = 2, cash_days: int = 5) -> None:
        self._qris_hours = qris_hours
        self._cash_days = cash_days

    def expires_at_for(self, method: PaymentMethod) -> datetime:
        now = datetime.now(timezone.utc)
        if method == PaymentMethod.QRIS:
            return now + timedelta(hours=self._qris_hours)
        return now + timedelta(days=self._cash_days)
