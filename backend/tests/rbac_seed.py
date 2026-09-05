"""Test-only helper for granting a permission to an account. The real
seeding/assignment story is OD-19 (still open) — this just gives tests
a quick way to set up "this account can do X" without caring how.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from src.modules.rbac.models import AccountRole, Permission, Role


def grant_permission(db: Session, *, account_id: UUID, role_name: str, permission_code: str) -> None:
    role = db.query(Role).filter_by(name=role_name).one_or_none()
    if role is None:
        role = Role(name=role_name)
        db.add(role)
        db.flush()

    permission = db.query(Permission).filter_by(code=permission_code).one_or_none()
    if permission is None:
        permission = Permission(code=permission_code)
        db.add(permission)
        db.flush()

    from src.modules.rbac.models import RolePermission

    if not db.query(RolePermission).filter_by(role_id=role.id, permission_id=permission.id).first():
        db.add(RolePermission(role_id=role.id, permission_id=permission.id))

    if not db.query(AccountRole).filter_by(account_id=account_id, role_id=role.id).first():
        db.add(AccountRole(account_id=account_id, role_id=role.id))

    db.commit()
