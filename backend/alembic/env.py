from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from src.config import get_settings
from src.database import Base

# Import every module's models package here so Base.metadata is fully
# populated before autogenerate runs.
from src.modules.registration import models as registration_models  # noqa
from src.modules.payments import models as payments_models  # noqa
from src.modules.accounts import models as accounts_models  # noqa
from src.modules.participants import models as participants_models  # noqa
from src.modules.qr import models as qr_models  # noqa
from src.modules.audit import models as audit_models  # noqa
from src.modules.rbac import models as rbac_models  # noqa
from src.modules.attendance import models as attendance_models  # noqa

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Single source of truth for the DB URL: app settings (.env), not
# alembic.ini, so runtime and migrations never drift apart.
config.set_main_option("sqlalchemy.url", get_settings().database_url)


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
