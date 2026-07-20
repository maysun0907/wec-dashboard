import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool, text

# Make `app` importable when alembic runs from the backend directory.
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings  # noqa: E402
from app.db import Base, _normalize_db_url  # noqa: E402
from app import models  # noqa: F401, E402  -- registers models with Base.metadata

config = context.config
config.set_main_option(
    "sqlalchemy.url", _normalize_db_url(settings.database_url)
)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
MIGRATION_LOCK_ID = 24_575_701_880_542_025


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
        is_postgres = connection.dialect.name == "postgresql"
        locked = False
        try:
            if is_postgres:
                # Both Railway services run the same pre-deploy command. A
                # session-level lock serializes Alembic before it reads the
                # current revision, so the waiter sees the new head instead of
                # attempting the same DDL concurrently. SELECT starts an
                # implicit transaction; commit it before Alembic begins its
                # own, while the session lock remains held.
                connection.execute(
                    text("SELECT pg_advisory_lock(:lock_id)"),
                    {"lock_id": MIGRATION_LOCK_ID},
                )
                connection.commit()
                locked = True

            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
        finally:
            if locked and not connection.invalidated:
                if connection.in_transaction():
                    connection.rollback()
                connection.execute(
                    text("SELECT pg_advisory_unlock(:lock_id)"),
                    {"lock_id": MIGRATION_LOCK_ID},
                )
                connection.commit()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
