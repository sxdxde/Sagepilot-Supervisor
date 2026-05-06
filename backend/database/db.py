from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from backend.config import settings

# ---------------------------------------------------------------------------
# Engine & session factory
# ---------------------------------------------------------------------------

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
)

AsyncSessionLocal: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ---------------------------------------------------------------------------
# Declarative base (shared by all models)
# ---------------------------------------------------------------------------


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an async database session.

    Commits on clean exit, rolls back on any exception, and always closes
    the session in the finally block — regardless of outcome.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ---------------------------------------------------------------------------
# Startup helper
# ---------------------------------------------------------------------------


async def init_db() -> None:
    """
    Create all tables that don't exist yet.

    Uses ``checkfirst=True`` (via ``create_all``) so the call is idempotent —
    safe to run on every startup without failing if tables already exist.

    In production, prefer Alembic migrations (``make migrate``) to track
    schema changes. ``init_db()`` is a convenience for development / first run.
    """
    # Import models so that Base.metadata is populated before create_all.
    import backend.database.models  # noqa: F401

    async with engine.begin() as conn:
        # checkfirst=True is the default for create_all; stated explicitly
        # here for clarity — it skips tables that already exist.
        await conn.run_sync(Base.metadata.create_all, checkfirst=True)
