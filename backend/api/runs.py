"""
FastAPI router for /api/runs

Handles run lifecycle: creation, event delivery, instructions,
interrupt/resume/terminate, and state queries.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from temporalio.client import WorkflowHandle
from temporalio.service import RPCError

from backend.api.schemas import (
    ActivityLogResponse,
    AddInstructionRequest,
    EventSignalRequest,
    RunCreate,
    RunResponse,
)
from backend.database import crud
from backend.database.db import get_db

# Inline classify logic — reuse the same rule tables from activities.py
# without going through Temporal (no activity context available here).
from backend.temporal.activities import _AGGRESSIVENESS_RANK, _WAKE_RULES
from backend.temporal.client import get_temporal_client
from backend.temporal.workflows import (
    EventSignal,
    OrderSupervisorWorkflow,
    WorkflowInput,
)
from backend.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/runs", tags=["runs"])


# ---------------------------------------------------------------------------
# Serialisation helpers
# ---------------------------------------------------------------------------


def _serialize_run(run) -> dict:
    return RunResponse(
        id=str(run.id),
        supervisor_id=str(run.supervisor_id),
        order_id=run.order_id,
        order_context=run.order_context,
        status=run.status,
        temporal_workflow_id=run.temporal_workflow_id,
        memory_summary=run.memory_summary or "",
        next_wake_up=run.next_wake_up.isoformat() if run.next_wake_up else None,
        final_output=run.final_output,
        created_at=run.created_at.isoformat() if run.created_at else "",
        updated_at=run.updated_at.isoformat() if run.updated_at else "",
    ).model_dump()


def _serialize_log(entry) -> dict:
    return ActivityLogResponse(
        id=str(entry.id),
        run_id=str(entry.run_id),
        activity_type=entry.activity_type,
        payload=entry.payload,
        created_at=entry.created_at.isoformat() if entry.created_at else "",
    ).model_dump()


# ---------------------------------------------------------------------------
# Inline event classifier (mirrors classify_event_activity logic)
# ---------------------------------------------------------------------------


def _classify_event(event_type: str, wake_aggressiveness: str) -> bool:
    """Return True if this event should wake the workflow immediately."""
    rule = _WAKE_RULES.get(event_type)

    if event_type not in _WAKE_RULES:
        # Unknown event — safe default: wake.
        return True

    if rule is None:
        return True  # Always-wake event.

    if rule == "never":
        return False

    required_rank = _AGGRESSIVENESS_RANK.get(rule, 0)
    current_rank = _AGGRESSIVENESS_RANK.get(wake_aggressiveness, 1)
    return current_rank >= required_rank


# ---------------------------------------------------------------------------
# Shared workflow-handle helper
# ---------------------------------------------------------------------------


async def _get_handle(workflow_id: str) -> WorkflowHandle:
    """Return a workflow handle, raising 404 if the workflow_id is missing."""
    if not workflow_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No Temporal workflow associated with this run.",
        )
    client = await get_temporal_client()
    return client.get_workflow_handle(workflow_id)


# ---------------------------------------------------------------------------
# POST /api/runs
# ---------------------------------------------------------------------------


@router.post("", status_code=status.HTTP_201_CREATED, summary="Start a new supervised run")
async def create_run(
    body: RunCreate,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    # 1. Resolve supervisor (404 if missing).
    try:
        sup_uuid = uuid.UUID(body.supervisor_id)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid supervisor_id UUID: {body.supervisor_id!r}")

    supervisor = await crud.get_supervisor(db, sup_uuid)
    if supervisor is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Supervisor {body.supervisor_id!r} not found.",
        )

    # 2. Create run in DB.
    run = await crud.create_run(
        db,
        {
            "supervisor_id": sup_uuid,
            "order_id": body.order_id,
            "order_context": body.order_context.model_dump(),
            "status": "active",
        },
    )

    # 3. Build workflow input.
    workflow_input = WorkflowInput(
        run_id=str(run.id),
        supervisor_id=str(supervisor.id),
        supervisor_name=supervisor.name,
        base_instruction=supervisor.base_instruction,
        available_actions=supervisor.available_actions or [],
        wake_up_interval_minutes=supervisor.wake_up_interval_minutes,
        wake_aggressiveness=supervisor.wake_aggressiveness,
        model=supervisor.model,
        order_id=body.order_id,
        order_context=body.order_context.model_dump(),
    )

    # 4. Start the Temporal workflow.
    workflow_id = f"order-supervisor-{run.id}"
    try:
        client = await get_temporal_client()
        await client.start_workflow(
            OrderSupervisorWorkflow.run,
            workflow_input,
            id=workflow_id,
            task_queue=settings.task_queue,
        )
    except Exception as exc:
        logger.exception("Failed to start Temporal workflow for run %s", run.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to start Temporal workflow: {exc}",
        )

    # 5. Persist workflow_id to DB.
    run = await crud.update_run(db, run.id, temporal_workflow_id=workflow_id)

    # get_db() commits on return.
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=_serialize_run(run),
    )


# ---------------------------------------------------------------------------
# GET /api/runs
# ---------------------------------------------------------------------------


@router.get("", summary="List all runs")
async def list_runs(
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    runs = await crud.list_runs(db)
    return JSONResponse(content=[_serialize_run(r) for r in runs])


# ---------------------------------------------------------------------------
# GET /api/runs/{run_id}
# ---------------------------------------------------------------------------


@router.get("/{run_id}", summary="Get run details including activity log and live workflow state")
async def get_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        uid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid run_id UUID: {run_id!r}")

    run = await crud.get_run(db, uid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run {run_id!r} not found.")

    # Fetch activity log.
    logs = await crud.get_activities(db, uid)
    serialised_logs = [_serialize_log(e) for e in logs]

    # Query live workflow state — may fail if workflow is already completed/terminated.
    workflow_state: dict[str, Any] | None = None
    if run.temporal_workflow_id:
        try:
            handle = await _get_handle(run.temporal_workflow_id)
            workflow_state = await handle.query(OrderSupervisorWorkflow.get_state)
        except RPCError as exc:
            # Workflow not found or completed — not fatal.
            logger.warning("Could not query workflow state for run %s: %s", run_id, exc)
            workflow_state = None
        except Exception as exc:
            logger.warning("Unexpected error querying workflow state for run %s: %s", run_id, exc)
            workflow_state = None

    content = {
        **_serialize_run(run),
        "activity_log": serialised_logs,
        "workflow_state": workflow_state,
    }
    return JSONResponse(content=content)


# ---------------------------------------------------------------------------
# POST /api/runs/{run_id}/events
# ---------------------------------------------------------------------------


@router.post("/{run_id}/events", summary="Send an event signal to the workflow")
async def send_event(
    run_id: str,
    body: EventSignalRequest,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        uid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid run_id UUID: {run_id!r}")

    run = await crud.get_run(db, uid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run {run_id!r} not found.")

    # 2. Inline classify — no Temporal round-trip needed.
    # To classify we need the supervisor's aggressiveness level.
    supervisor = await crud.get_supervisor(db, run.supervisor_id)
    wake_aggressiveness = supervisor.wake_aggressiveness if supervisor else "moderate"
    will_wake = _classify_event(body.event_type, wake_aggressiveness)

    # 3. Persist event_received log entry.
    await crud.log_activity(
        db,
        uid,
        "event_received",
        {
            "event_type": body.event_type,
            "payload": body.payload,
            "will_wake": will_wake,
        },
    )
    # get_db() will commit on return; flush now so the log entry gets an id.
    await db.flush()

    # 4-6. Signal the Temporal workflow.
    try:
        handle = await _get_handle(run.temporal_workflow_id)
        await handle.signal(
            OrderSupervisorWorkflow.receive_event,
            EventSignal(event_type=body.event_type, payload=body.payload),
        )
    except RPCError as exc:
        logger.error("Failed to signal workflow for run %s: %s", run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to signal Temporal workflow: {exc}",
        )

    return JSONResponse(content={"success": True, "event_type": body.event_type, "will_wake": will_wake})


# ---------------------------------------------------------------------------
# POST /api/runs/{run_id}/instructions
# ---------------------------------------------------------------------------


@router.post("/{run_id}/instructions", summary="Add a runtime instruction to the workflow")
async def add_instruction(
    run_id: str,
    body: AddInstructionRequest,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        uid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid run_id UUID: {run_id!r}")

    run = await crud.get_run(db, uid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run {run_id!r} not found.")

    # 1. Log before signalling so the entry is always persisted.
    await crud.log_activity(db, uid, "instruction_added", {"instruction": body.instruction})
    await db.flush()

    # 2. Signal workflow.
    try:
        handle = await _get_handle(run.temporal_workflow_id)
        await handle.signal(OrderSupervisorWorkflow.add_instruction, body.instruction)
    except RPCError as exc:
        logger.error("Failed to add instruction for run %s: %s", run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to signal Temporal workflow: {exc}",
        )

    return JSONResponse(content={"success": True})


# ---------------------------------------------------------------------------
# POST /api/runs/{run_id}/interrupt
# ---------------------------------------------------------------------------


@router.post("/{run_id}/interrupt", summary="Pause the workflow for manual review")
async def interrupt_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        uid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid run_id UUID: {run_id!r}")

    run = await crud.get_run(db, uid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run {run_id!r} not found.")

    # 1. Update DB status.
    await crud.update_run(db, uid, status="interrupted")
    await db.flush()

    # 2. Signal workflow.
    try:
        handle = await _get_handle(run.temporal_workflow_id)
        await handle.signal(OrderSupervisorWorkflow.interrupt_workflow)
    except RPCError as exc:
        logger.error("Failed to interrupt workflow for run %s: %s", run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to signal Temporal workflow: {exc}",
        )

    return JSONResponse(content={"success": True})


# ---------------------------------------------------------------------------
# POST /api/runs/{run_id}/resume
# ---------------------------------------------------------------------------


@router.post("/{run_id}/resume", summary="Resume a previously interrupted workflow")
async def resume_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        uid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid run_id UUID: {run_id!r}")

    run = await crud.get_run(db, uid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run {run_id!r} not found.")

    # 1. Update DB status.
    await crud.update_run(db, uid, status="active")
    await db.flush()

    # 2. Signal workflow.
    try:
        handle = await _get_handle(run.temporal_workflow_id)
        await handle.signal(OrderSupervisorWorkflow.resume_workflow)
    except RPCError as exc:
        logger.error("Failed to resume workflow for run %s: %s", run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to signal Temporal workflow: {exc}",
        )

    return JSONResponse(content={"success": True})


# ---------------------------------------------------------------------------
# POST /api/runs/{run_id}/terminate
# ---------------------------------------------------------------------------


@router.post("/{run_id}/terminate", summary="Cleanly terminate the workflow")
async def terminate_run(
    run_id: str,
    db: AsyncSession = Depends(get_db),
) -> JSONResponse:
    try:
        uid = uuid.UUID(run_id)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid run_id UUID: {run_id!r}")

    run = await crud.get_run(db, uid)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Run {run_id!r} not found.")

    # 1. Update DB status.
    await crud.update_run(db, uid, status="terminated")
    await db.flush()

    # 2. Signal workflow.
    try:
        handle = await _get_handle(run.temporal_workflow_id)
        await handle.signal(OrderSupervisorWorkflow.terminate_workflow)
    except RPCError as exc:
        logger.error("Failed to terminate workflow for run %s: %s", run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to signal Temporal workflow: {exc}",
        )

    return JSONResponse(content={"success": True})
