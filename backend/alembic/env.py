"""Alembic environment — sync connection for migrations."""
import asyncio
from logging.config import fileConfig

from sqlalchemy import create_engine, pool
from sqlalchemy.engine import Connection

from alembic import context

# ---------------------------------------------------------------------------
# Load alembic.ini logging config
# ---------------------------------------------------------------------------
config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Import models so Base.metadata is fully populated
# ---------------------------------------------------------------------------
from backend.database.db import Base  # noqa: E402
import backend.database.models  # noqa: E402, F401

target_metadata = Base.metadata

# ---------------------------------------------------------------------------
# Build a SYNC database URL from settings
# Alembic runs synchronously via psycopg2; asyncpg is only for FastAPI.
# configparser treats % as an interpolation char — double any % signs.
# ---------------------------------------------------------------------------
from backend.config import settings  # noqa: E402

_sync_url = (
    settings.database_url
    .replace("+asyncpg", "")          # postgresql+asyncpg → postgresql
    .replace("%", "%%")               # escape % for configparser
)
config.set_main_option("sqlalchemy.url", _sync_url)


# ---------------------------------------------------------------------------
# Offline migrations (SQL output only — no live DB connection)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Online migrations (sync psycopg2 connection)
# ---------------------------------------------------------------------------

def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    # Build the real (un-doubled) URL directly for the engine — configparser
    # interpolation doesn't apply here.
    raw_url = settings.database_url.replace("+asyncpg", "")
    connectable = create_engine(raw_url, poolclass=pool.NullPool)
    with connectable.connect() as connection:
        do_run_migrations(connection)
    connectable.dispose()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
