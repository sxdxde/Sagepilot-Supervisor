"""
FastAPI router for /api/supervisors
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.schemas import SupervisorCreate, SupervisorResponse
from backend.database import crud
from backend.database.db import get_db

router = APIRouter(prefix="/api/supervisors", tags=["supervisors"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_supervisor(supervisor) -> dict:
    """Convert a Supervisor ORM object to a plain JSON-safe dict."""
    return SupervisorResponse(
        id=str(supervisor.id),
        name=supervisor.name,
        base_instruction=supervisor.base_instruction,
        available_actions=supervisor.available_actions or [],
        wake_up_interval_minutes=supervisor.wake_up_interval_minutes,
        wake_aggressiveness=supervisor.wake_aggressiveness,
        model=supervisor.model,
        created_at=supervisor.created_at.isoformat() if supervisor.created_at else "",
    ).model_dump()


# ---------------------------------------------------------------------------
# POST /api/supervisors
# ---------------------------------------------------------------------------


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="Create a new supervisor",
)
async def create_supervisor(
    body: SupervisorCreate,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    supervisor = await crud.create_supervisor(db, body.model_dump())
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=_serialize_supervisor(supervisor),
    )


# ---------------------------------------------------------------------------
# GET /api/supervisors
# ---------------------------------------------------------------------------


@router.get(
    "",
    summary="List all supervisors",
)
async def list_supervisors(
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    supervisors = await crud.list_supervisors(db)
    return JSONResponse(content=[_serialize_supervisor(s) for s in supervisors])


# ---------------------------------------------------------------------------
# GET /api/supervisors/{supervisor_id}
# ---------------------------------------------------------------------------


@router.get(
    "/{supervisor_id}",
    summary="Get a single supervisor by ID",
)
async def get_supervisor(
    supervisor_id: str,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        uid = uuid.UUID(supervisor_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid UUID: {supervisor_id!r}",
        )

    supervisor = await crud.get_supervisor(db, uid)
    if supervisor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supervisor {supervisor_id!r} not found.",
        )

    return JSONResponse(content=_serialize_supervisor(supervisor))
