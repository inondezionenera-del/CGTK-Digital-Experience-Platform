"""Smoke test: the full domain model graph (all modules) must import and
create cleanly against a throwaway SQLite DB. This is NOT a substitute
for real Postgres migrations — SQLite is only good enough to catch
import errors, FK typos, and constraint syntax mistakes cheaply and
fast. Row-level locking / partial-unique-index concurrency behavior
must still be verified against Postgres (Phase C/G).
"""

from sqlalchemy import create_engine

from src.database import Base

# Import every module's models so Base.metadata is fully populated,
# mirroring alembic/env.py.
from src.modules.registration import models as registration_models  # noqa: F401
from src.modules.payments import models as payments_models  # noqa: F401
from src.modules.accounts import models as accounts_models  # noqa: F401
from src.modules.participants import models as participants_models  # noqa: F401
from src.modules.qr import models as qr_models  # noqa: F401
from src.modules.audit import models as audit_models  # noqa: F401
from src.modules.rbac import models as rbac_models  # noqa: F401
from src.modules.attendance import models as attendance_models  # noqa: F401


def test_all_domain_models_create_cleanly():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)

    table_names = set(Base.metadata.tables.keys())
    assert {
        "registrations",
        "payments",
        "accounts",
        "participants",
        "qr_credentials",
        "audit_events",
        "webhook_dedup_records",
        "api_request_idempotency_records",
        "roles",
        "permissions",
        "role_permissions",
        "account_roles",
    }.issubset(table_names)
