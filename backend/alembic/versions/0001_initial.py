"""initial

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # supervisors                                                          #
    # ------------------------------------------------------------------ #
    op.create_table(
        "supervisors",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("base_instruction", sa.Text, nullable=False),
        sa.Column("available_actions", sa.JSON, nullable=False),
        sa.Column("wake_up_interval_minutes", sa.Integer, nullable=False, server_default="60"),
        sa.Column("wake_aggressiveness", sa.String(50), nullable=False, server_default="moderate"),
        sa.Column("model", sa.String(100), nullable=False, server_default="llama-3.3-70b-versatile"),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # ------------------------------------------------------------------ #
    # runs                                                                 #
    # ------------------------------------------------------------------ #
    op.create_table(
        "runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "supervisor_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("supervisors.id"),
            nullable=False,
        ),
        sa.Column("order_id", sa.String(255), nullable=False),
        sa.Column("order_context", sa.JSON, nullable=True),
        sa.Column("status", sa.String(50), nullable=False, server_default="active"),
        sa.Column("temporal_workflow_id", sa.String(255), nullable=True),
        sa.Column("memory_summary", sa.Text, nullable=False, server_default=""),
        sa.Column("next_wake_up", sa.DateTime, nullable=True),
        sa.Column("final_output", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )

    # ------------------------------------------------------------------ #
    # activity_log                                                         #
    # ------------------------------------------------------------------ #
    op.create_table(
        "activity_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "run_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("runs.id"),
            nullable=False,
        ),
        sa.Column("activity_type", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("activity_log")
    op.drop_table("runs")
    op.drop_table("supervisors")
