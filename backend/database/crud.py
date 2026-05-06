"""Async CRUD helpers for all database models."""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.models import ActivityLog, Run, Supervisor


# ---------------------------------------------------------------------------
# Supervisor
# ---------------------------------------------------------------------------


async def create_supervisor(db: AsyncSession, data: dict[str, Any]) -> Supervisor:
    supervisor = Supervisor(**data)
    db.add(supervisor)
    await db.flush()
    await db.refresh(supervisor)
    return supervisor


async def get_supervisor(db: AsyncSession, id: uuid.UUID) -> Supervisor | None:
    result = await db.execute(select(Supervisor).where(Supervisor.id == id))
    return result.scalar_one_or_none()


async def list_supervisors(db: AsyncSession) -> list[Supervisor]:
    result = await db.execute(select(Supervisor).order_by(Supervisor.created_at.desc()))
    return list(result.scalars().all())


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


async def create_run(db: AsyncSession, data: dict[str, Any]) -> Run:
    run = Run(**data)
    db.add(run)
    await db.flush()
    await db.refresh(run)
    return run


async def get_run(db: AsyncSession, id: uuid.UUID) -> Run | None:
    result = await db.execute(select(Run).where(Run.id == id))
    return result.scalar_one_or_none()


async def list_runs(db: AsyncSession) -> list[Run]:
    result = await db.execute(select(Run).order_by(Run.created_at.desc()))
    return list(result.scalars().all())


async def update_run(db: AsyncSession, id: uuid.UUID, **kwargs: Any) -> Run | None:
    run = await get_run(db, id)
    if run is None:
        return None
    for key, value in kwargs.items():
        setattr(run, key, value)
    await db.flush()
    await db.refresh(run)
    return run


# ---------------------------------------------------------------------------
# ActivityLog
# ---------------------------------------------------------------------------


async def log_activity(
    db: AsyncSession,
    run_id: uuid.UUID,
    activity_type: str,
    payload: dict[str, Any] | None = None,
) -> ActivityLog:
    entry = ActivityLog(run_id=run_id, activity_type=activity_type, payload=payload)
    db.add(entry)
    await db.flush()
    await db.refresh(entry)
    return entry


async def get_activities(db: AsyncSession, run_id: uuid.UUID) -> list[ActivityLog]:
    result = await db.execute(
        select(ActivityLog)
        .where(ActivityLog.run_id == run_id)
        .order_by(ActivityLog.created_at.asc())
    )
    return list(result.scalars().all())
