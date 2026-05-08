import uuid
from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.database.db import Base

# ---------------------------------------------------------------------------
# Supervisor
# ---------------------------------------------------------------------------

_ALL_ACTIONS = [
    "message_fulfillment_team",
    "message_payments_team",
    "message_logistics_team",
    "message_customer",
    "create_internal_note",
]


class Supervisor(Base):
    __tablename__ = "supervisors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    base_instruction: Mapped[str] = mapped_column(Text, nullable=False)
    available_actions: Mapped[list] = mapped_column(
        JSON, nullable=False, default=lambda: list(_ALL_ACTIONS)
    )
    wake_up_interval_minutes: Mapped[int] = mapped_column(
        Integer, nullable=False, default=60
    )
    # conservative | moderate | aggressive
    wake_aggressiveness: Mapped[str] = mapped_column(
        String(50), nullable=False, default="moderate"
    )
    model: Mapped[str] = mapped_column(
        String(100), nullable=False, default="llama-3.3-70b-versatile"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    # Relationships
    runs: Mapped[list["Run"]] = relationship("Run", back_populates="supervisor")

    def __repr__(self) -> str:
        return f"<Supervisor id={self.id} name={self.name!r}>"


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------


class Run(Base):
    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    supervisor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("supervisors.id"), nullable=False
    )
    order_id: Mapped[str] = mapped_column(String(255), nullable=False)
    # e.g. {"customer_name": ..., "items": [...], "amount": ..., "notes": ...}
    order_context: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    # active | sleeping | interrupted | terminated | completed
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="active"
    )
    temporal_workflow_id: Mapped[str | None] = mapped_column(
        String(255), nullable=True
    )
    memory_summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    next_wake_up: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    final_output: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    # Relationships
    supervisor: Mapped["Supervisor"] = relationship("Supervisor", back_populates="runs")
    activity_logs: Mapped[list["ActivityLog"]] = relationship(
        "ActivityLog", back_populates="run"
    )

    def __repr__(self) -> str:
        return f"<Run id={self.id} order_id={self.order_id!r} status={self.status!r}>"


# ---------------------------------------------------------------------------
# ActivityLog
# ---------------------------------------------------------------------------


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id"), nullable=False
    )
    # event_received | wake_decision | agent_reasoning | action_executed
    # | instruction_added | sleep_decision | final_output | system
    activity_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    # Relationships
    run: Mapped["Run"] = relationship("Run", back_populates="activity_logs")

    def __repr__(self) -> str:
        return (
            f"<ActivityLog id={self.id} run_id={self.run_id}"
            f" type={self.activity_type!r}>"
        )
