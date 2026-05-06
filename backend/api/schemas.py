"""
Pydantic schemas for request validation and response serialisation.

All response schemas use plain Python types (str, int, list) rather than
UUID / datetime so that JSONResponse serialisation is trivial — no custom
encoders needed.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Shared constants
# ---------------------------------------------------------------------------

_DEFAULT_ACTIONS: list[str] = [
    "send_email",
    "send_sms",
    "update_order",
    "escalate",
    "notify_customer",
]

# ---------------------------------------------------------------------------
# Supervisor schemas
# ---------------------------------------------------------------------------


class SupervisorCreate(BaseModel):
    name: str
    base_instruction: str
    available_actions: list[str] = Field(default_factory=lambda: list(_DEFAULT_ACTIONS))
    wake_up_interval_minutes: int = 60
    wake_aggressiveness: str = "moderate"
    model: str = "llama-3.3-70b-versatile"


class SupervisorResponse(BaseModel):
    id: str
    name: str
    base_instruction: str
    available_actions: list[str]
    wake_up_interval_minutes: int
    wake_aggressiveness: str
    model: str
    created_at: str


# ---------------------------------------------------------------------------
# Run schemas
# ---------------------------------------------------------------------------


class OrderContext(BaseModel):
    customer_name: str
    items: list[str] = Field(default_factory=list)
    amount: float
    notes: str = ""


class RunCreate(BaseModel):
    supervisor_id: str
    order_id: str
    order_context: OrderContext


class RunResponse(BaseModel):
    id: str
    supervisor_id: str
    order_id: str
    order_context: dict | None
    status: str
    temporal_workflow_id: str | None
    memory_summary: str
    next_wake_up: str | None
    final_output: dict | None
    created_at: str
    updated_at: str


# ---------------------------------------------------------------------------
# ActivityLog schemas
# ---------------------------------------------------------------------------


class ActivityLogResponse(BaseModel):
    id: str
    run_id: str
    activity_type: str
    payload: dict | None
    created_at: str


# ---------------------------------------------------------------------------
# Signal / instruction schemas
# ---------------------------------------------------------------------------


class EventSignalRequest(BaseModel):
    event_type: str
    payload: dict = Field(default_factory=dict)


class AddInstructionRequest(BaseModel):
    instruction: str
