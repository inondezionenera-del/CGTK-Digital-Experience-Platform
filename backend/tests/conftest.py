import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from src.database import Base, get_db
from src.main import create_app

# Import every module's models so Base.metadata is fully populated for
# the in-memory test DB, mirroring alembic/env.py.
from src.modules.registration import models as registration_models  # noqa: F401
from src.modules.payments import models as payments_models  # noqa: F401
from src.modules.accounts import models as accounts_models  # noqa: F401
from src.modules.participants import models as participants_models  # noqa: F401
from src.modules.qr import models as qr_models  # noqa: F401
from src.modules.audit import models as audit_models  # noqa: F401
from src.modules.rbac import models as rbac_models  # noqa: F401
from src.modules.attendance import models as attendance_models  # noqa: F401


@pytest.fixture
def db() -> Session:
    """Fresh SQLite in-memory DB per test. Good for domain-logic
    correctness; NOT a substitute for a Postgres integration test when
    verifying true concurrent row-locking behavior (Phase G).
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = session_local()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session) -> TestClient:
    """TestClient wired to the same `db` session as whatever the test
    sets up directly, so seeding via service functions and hitting the
    API see the same data.
    """
    app = create_app()
    app.dependency_overrides[get_db] = lambda: db
    return TestClient(app)
