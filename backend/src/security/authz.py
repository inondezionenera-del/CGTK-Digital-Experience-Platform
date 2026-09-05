"""Permission-gate dependency for FastAPI routes.

Having a permission only means "you're allowed to ask" — it never means
the action itself is valid. Business invariants (state machine
preconditions, the confirmation cascade's own checks) still apply on
top of this, every time.
"""

from uuid import UUID

from fastapi import Depends
from sqlalchemy.orm import Session

from src.database import get_db
from src.exceptions import ForbiddenError
from src.modules.rbac.service import has_permission
from src.security.auth import get_current_account_id


def require_permission(permission_code: str):
    def dependency(
        account_id: UUID = Depends(get_current_account_id),
        db: Session = Depends(get_db),
    ) -> UUID:
        if not has_permission(db, account_id=account_id, permission_code=permission_code):
            raise ForbiddenError(f"Missing permission: {permission_code}")
        return account_id

    return dependency
