from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.modules.rbac.models import AccountRole, Permission, Role, RolePermission


def has_permission(db: Session, *, account_id: UUID, permission_code: str) -> bool:
    """Default deny: True only if this exact account has a role that's
    been explicitly granted this exact permission. No hierarchy, no
    inheritance — SUPER_ADMIN gets nothing for free that isn't in
    role_permissions.
    """
    stmt = (
        select(Permission.id)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(Role, Role.id == RolePermission.role_id)
        .join(AccountRole, AccountRole.role_id == Role.id)
        .where(AccountRole.account_id == account_id, Permission.code == permission_code)
    )
    return db.execute(stmt).first() is not None


def get_role_names(db: Session, *, account_id: UUID) -> list[str]:
    stmt = (
        select(Role.name)
        .join(AccountRole, AccountRole.role_id == Role.id)
        .where(AccountRole.account_id == account_id)
    )
    return [row[0] for row in db.execute(stmt).all()]
