"""
OrderSupervisorWorkflow — core Temporal workflow for order supervision.

All non-deterministic imports (asyncio, third-party libs) are wrapped in
workflow.unsafe.imports_passed_through() so Temporal's sandbox doesn't
intercept them.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    # Activity functions referenced by the workflow.
    # These live outside the deterministic sandbox.
    from backend.temporal.activities import (
        generate_final_output_activity,
        run_agent_activity,
        update_run_status_activity,
    )


# ---------------------------------------------------------------------------
# Data-transfer objects
# ---------------------------------------------------------------------------


@dataclass
class WorkflowInput:
    """All data needed to start an OrderSupervisorWorkflow run."""

    run_id: str
    supervisor_id: str
    supervisor_name: str
    base_instruction: str
    available_actions: list[str]
    wake_up_interval_minutes: int
    wake_aggressiveness: str
    model: str
    order_id: str
    order_context: dict


@dataclass
class EventSignal:
    """Payload delivered via the receive_event signal."""

    event_type: str
    payload: dict


# ---------------------------------------------------------------------------
# Workflow definition
# ---------------------------------------------------------------------------


@workflow.defn
class OrderSupervisorWorkflow:
    """
    Long-running Temporal workflow that supervises a single order.

    Lifecycle
    ---------
    1. Activate → run first agent pass (trigger="start").
    2. Sleep for wake_up_interval_minutes (or until a signal wakes it early).
    3. On wake: run agent with accumulated events.
    4. Repeat until a terminal event (delivered / refund_requested) is received
       or an explicit terminate signal is sent.
    5. Generate final output and complete.
    """

    # ------------------------------------------------------------------
    # Initialiser — instance state
    # ------------------------------------------------------------------

    def __init__(self) -> None:
        self.pending_events: list[dict] = []
        self.additional_instructions: list[str] = []
        self.is_interrupted: bool = False
        self.should_terminate: bool = False
        self.terminal_event_received: bool = False
        self.new_event_arrived: bool = False
        self.current_status: str = "active"
        self.memory_summary: str = ""
        self.next_wake_up_str: str = ""
        self.actions_taken_count: int = 0

        # Local counter used to decide when to call continue_as_new.
        self._activity_log_count: int = 0

    # ------------------------------------------------------------------
    # Signal handlers
    # ------------------------------------------------------------------

    @workflow.signal
    def receive_event(self, signal: EventSignal) -> None:
        """Deliver an external order event into the workflow."""
        workflow.logger.info("Signal receive_event: type=%s", signal.event_type)
        self.pending_events.append(
            {
                "event_type": signal.event_type,
                "payload": signal.payload,
                "received_at": str(workflow.now()),
            }
        )
        self.new_event_arrived = True

        # Terminal events that should end the supervision loop.
        if signal.event_type in ("delivered", "refund_requested"):
            self.terminal_event_received = True

    @workflow.signal
    def add_instruction(self, instruction: str) -> None:
        """Append a runtime instruction to guide the agent's next pass."""
        self.additional_instructions.append(instruction)

    @workflow.signal
    def interrupt_workflow(self) -> None:
        """Pause the supervision loop (e.g. human review required)."""
        workflow.logger.info("Signal interrupt_workflow received")
        self.is_interrupted = True
        self.current_status = "interrupted"

    @workflow.signal
    def resume_workflow(self) -> None:
        """Resume a previously interrupted workflow."""
        workflow.logger.info("Signal resume_workflow received")
        self.is_interrupted = False
        self.current_status = "active"

    @workflow.signal
    def terminate_workflow(self) -> None:
        """Request a clean, early termination of the workflow."""
        workflow.logger.info("Signal terminate_workflow received")
        self.should_terminate = True

    # ------------------------------------------------------------------
    # Query handlers
    # ------------------------------------------------------------------

    @workflow.query
    def get_state(self) -> dict:
        """Return a snapshot of the current workflow state (safe to call anytime)."""
        return {
            "current_status": self.current_status,
            "memory_summary": self.memory_summary,
            "next_wake_up_str": self.next_wake_up_str,
            "actions_taken_count": self.actions_taken_count,
            "pending_events_count": len(self.pending_events),
            "additional_instructions": list(self.additional_instructions),
        }

    # ------------------------------------------------------------------
    # Main entrypoint
    # ------------------------------------------------------------------

    @workflow.run
    async def run(self, input: WorkflowInput) -> dict:
        """
        Core supervision loop.

        Returns a minimal completion dict; full output is persisted to the
        DB by generate_final_output_activity.
        """
        # 1. Mark run as active in the database.
        await workflow.execute_activity(
            update_run_status_activity,
            args=[input.run_id, "active"],
            start_to_close_timeout=timedelta(minutes=2),
            schedule_to_close_timeout=timedelta(minutes=10),
        )

        # 2. First agent pass on workflow start.
        await self._run_agent(input, trigger="start", events_to_process=[])

        # 3. Main supervision loop.
        while not self.should_terminate and not self.terminal_event_received:
            # --- a) Mark as sleeping and record next wake-up time -----------
            self.current_status = "sleeping"
            await workflow.execute_activity(
                update_run_status_activity,
                args=[input.run_id, "sleeping"],
                start_to_close_timeout=timedelta(minutes=2),
                schedule_to_close_timeout=timedelta(minutes=10),
            )

            # --- b) Record expected next wake-up ----------------------------
            wake_at = workflow.now() + timedelta(minutes=input.wake_up_interval_minutes)
            self.next_wake_up_str = str(wake_at)

            # --- c) Reset event-arrival flag --------------------------------
            self.new_event_arrived = False

            # --- d) Sleep until an event / signal / timeout -----------------
            try:
                await workflow.wait_condition(
                    lambda: (
                        self.new_event_arrived
                        or self.should_terminate
                        or self.terminal_event_received
                        or self.is_interrupted  # wake immediately if interrupted
                    ),
                    timeout=timedelta(minutes=input.wake_up_interval_minutes),
                )
                trigger = "signal"
            except asyncio.TimeoutError:
                trigger = "scheduled"

            # --- e) Hard-stop requested -------------------------------------
            if self.should_terminate:
                break

            # --- f) Interrupted — wait until resumed ------------------------
            if self.is_interrupted:
                self.current_status = "interrupted"
                await workflow.execute_activity(
                    update_run_status_activity,
                    args=[input.run_id, "interrupted"],
                    start_to_close_timeout=timedelta(minutes=2),
                    schedule_to_close_timeout=timedelta(minutes=10),
                )
                await workflow.wait_condition(
                    lambda: not self.is_interrupted or self.should_terminate
                )
                if self.should_terminate:
                    break
                trigger = "resumed"

            # --- g) Back to active ------------------------------------------
            self.current_status = "active"

            # --- h) Consume and clear the pending event buffer --------------
            events_to_process = list(self.pending_events)
            self.pending_events.clear()

            # --- i) Run the agent with the accumulated events ---------------
            await self._run_agent(input, trigger=trigger, events_to_process=events_to_process)

            # --- j) Continue-as-new to avoid history size limits ------------
            if self._activity_log_count > 100:
                workflow.continue_as_new(input)
                return  # continue_as_new raises internally; this is defensive

        # 4. Generate and persist final output.
        final_output = await workflow.execute_activity(
            generate_final_output_activity,
            args=[input.run_id, self.memory_summary, self.current_status],
            start_to_close_timeout=timedelta(minutes=5),
            schedule_to_close_timeout=timedelta(minutes=10),
        )

        await workflow.execute_activity(
            update_run_status_activity,
            args=[input.run_id, "completed"],
            start_to_close_timeout=timedelta(minutes=2),
            schedule_to_close_timeout=timedelta(minutes=10),
        )

        # 5. Return completion summary.
        return {"status": "completed", "run_id": input.run_id}

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    async def _run_agent(
        self,
        input: WorkflowInput,
        trigger: str,
        events_to_process: list[dict],
    ) -> None:
        """
        Execute the agent activity and update local state from the result.

        The activity is responsible for:
        - Calling Groq with the current context
        - Deciding which actions to take
        - Persisting activity-log entries to the DB
        - Returning an updated memory summary and list of actions taken
        """
        result: dict[str, Any] = await workflow.execute_activity(
            run_agent_activity,
            args=[
                {
                    "run_id": input.run_id,
                    "supervisor_id": input.supervisor_id,
                    "supervisor_name": input.supervisor_name,
                    "base_instruction": input.base_instruction,
                    "available_actions": input.available_actions,
                    "wake_aggressiveness": input.wake_aggressiveness,
                    "model": input.model,
                    "order_id": input.order_id,
                    "order_context": input.order_context,
                    "trigger": trigger,
                    "events_to_process": events_to_process,
                    "memory_summary": self.memory_summary,
                    "additional_instructions": list(self.additional_instructions),
                }
            ],
            start_to_close_timeout=timedelta(minutes=5),
            schedule_to_close_timeout=timedelta(minutes=10),
        )

        # Merge state updates returned by the activity.
        self.memory_summary = result.get("memory_summary", self.memory_summary)

        actions_taken: list = result.get("actions_taken", [])
        self.actions_taken_count += len(actions_taken)

        # Track total activity-log entries for continue_as_new decision.
        self._activity_log_count += result.get("activity_log_entries_written", 1)
