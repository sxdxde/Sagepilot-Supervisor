"""
Temporal activities for the Order Supervisor.

Activities are plain async functions (no workflow context). They interact
directly with the database and external APIs (Groq).

Call-signature notes
--------------------
* ``run_agent_activity`` receives a single flat dict because the workflow
  passes all context as one serialised payload via ``args=[{...}]``.
* All other activities receive positional primitive arguments.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from groq import AsyncGroq
from temporalio import activity

from backend.config import settings
from backend.database import crud
from backend.database.db import AsyncSessionLocal


# ---------------------------------------------------------------------------
# Shared Groq client (instantiated once per worker process)
# ---------------------------------------------------------------------------

_groq_client: AsyncGroq | None = None


def _get_groq() -> AsyncGroq:
    global _groq_client
    if _groq_client is None:
        _groq_client = AsyncGroq(api_key=settings.groq_api_key)
    return _groq_client


# ---------------------------------------------------------------------------
# Activity 1 — update_run_status_activity
# ---------------------------------------------------------------------------


@activity.defn
async def update_run_status_activity(run_id: str, status: str) -> None:
    """Persist a new status value to the runs table."""
    async with AsyncSessionLocal() as db:
        await crud.update_run(db, uuid.UUID(run_id), status=status)
        await db.commit()


# ---------------------------------------------------------------------------
# Activity 2 — log_activity_activity
# ---------------------------------------------------------------------------


@activity.defn
async def log_activity_activity(
    run_id: str, activity_type: str, payload: dict
) -> None:
    """Write a single entry to the activity_log table."""
    async with AsyncSessionLocal() as db:
        await crud.log_activity(db, uuid.UUID(run_id), activity_type, payload)
        await db.commit()


# ---------------------------------------------------------------------------
# Activity 3 — run_agent_activity
# ---------------------------------------------------------------------------

# Tools available to the agent.
_AGENT_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "message_fulfillment_team",
            "description": "Send a message to the fulfillment team",
            "parameters": {
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "message_payments_team",
            "description": "Send a message to the payments team",
            "parameters": {
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "message_logistics_team",
            "description": "Send a message to the logistics team",
            "parameters": {
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "message_customer",
            "description": "Send a message to the customer",
            "parameters": {
                "type": "object",
                "properties": {"message": {"type": "string"}},
                "required": ["message"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_internal_note",
            "description": "Create an internal note for this order",
            "parameters": {
                "type": "object",
                "properties": {"note": {"type": "string"}},
                "required": ["note"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "update_memory",
            "description": "Update the compact memory summary",
            "parameters": {
                "type": "object",
                "properties": {"new_summary": {"type": "string"}},
                "required": ["new_summary"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "record_reasoning",
            "description": "Record your reasoning and decision for this wake cycle",
            "parameters": {
                "type": "object",
                "properties": {"outcome": {"type": "string"}},
                "required": ["outcome"],
            },
        },
    },
]

# Tools that count as "actions taken" for metrics.
_ACTION_TOOLS = frozenset(
    {
        "message_fulfillment_team",
        "message_payments_team",
        "message_logistics_team",
        "message_customer",
        "create_internal_note",
    }
)


@activity.defn
async def run_agent_activity(ctx: dict) -> dict:
    """
    Main AI agent activity.

    Receives a single flat dict (``ctx``) containing all supervisor config,
    order context, trigger info, and current memory.  Returns a result dict
    consumed by the workflow to update its in-memory state.

    Parameters inside ``ctx``
    -------------------------
    run_id, supervisor_id, supervisor_name, base_instruction,
    available_actions, wake_aggressiveness, model, order_id,
    order_context, trigger, events_to_process, memory_summary,
    additional_instructions
    """
    run_id: str = ctx["run_id"]
    base_instruction: str = ctx["base_instruction"]
    available_actions: list[str] = ctx["available_actions"]
    wake_aggressiveness: str = ctx["wake_aggressiveness"]
    model: str = ctx["model"]
    order_id: str = ctx["order_id"]
    order_context: dict = ctx["order_context"]
    trigger: str = ctx["trigger"]
    events_to_process: list[dict] = ctx.get("events_to_process", [])
    memory_summary: str = ctx.get("memory_summary", "")
    additional_instructions: list[str] = ctx.get("additional_instructions", [])

    run_uuid = uuid.UUID(run_id)
    activity_log_entries_written = 0
    actions_taken: list[dict] = []
    new_memory_summary = memory_summary

    async with AsyncSessionLocal() as db:
        # ------------------------------------------------------------------ #
        # Step 1: log initial reasoning trigger                               #
        # ------------------------------------------------------------------ #
        await crud.log_activity(
            db,
            run_uuid,
            "agent_reasoning",
            {"trigger": trigger, "events_count": len(events_to_process)},
        )
        await db.commit()
        activity_log_entries_written += 1

        # ------------------------------------------------------------------ #
        # Step 2: system prompt                                               #
        # ------------------------------------------------------------------ #
        system_prompt = f"""You are an AI order supervisor. Your job is to oversee order {order_id} and take appropriate actions.

Base instruction: {base_instruction}

Available actions: {available_actions}

Wake aggressiveness: {wake_aggressiveness}
- conservative: only act on critical issues (payment failed, refund, customer complaints)
- moderate: act on delays and issues, check in periodically
- aggressive: proactively communicate on all significant events

You will be given the current order context, recent events, and your memory summary.
You must decide what actions to take and call the appropriate tools.
After taking actions, update your memory summary.
Always call record_reasoning to document your decision even if you take no action."""

        # ------------------------------------------------------------------ #
        # Step 3: user message                                                #
        # ------------------------------------------------------------------ #
        user_message = f"""Order Context: {json.dumps(order_context, default=str)}
Memory Summary: {memory_summary}
Recent Events: {json.dumps(events_to_process, default=str)}
Additional Instructions: {additional_instructions}
Current Time: {datetime.utcnow().isoformat()}
Trigger: {trigger}

Review the situation and take appropriate actions using the available tools."""

        messages: list[dict] = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ]

        # ------------------------------------------------------------------ #
        # Steps 4 & 5: agentic tool-call loop                                #
        # ------------------------------------------------------------------ #
        groq = _get_groq()

        while True:
            response = await groq.chat.completions.create(
                model=model,
                messages=messages,
                tools=_AGENT_TOOLS,
                tool_choice="auto",
            )

            assistant_message = response.choices[0].message

            # No tool calls → agent is done.
            if not assistant_message.tool_calls:
                # Append final assistant turn so callers have full history.
                messages.append(
                    {"role": "assistant", "content": assistant_message.content or ""}
                )
                break

            # Append assistant turn with tool_calls for the next iteration.
            messages.append(assistant_message)  # type: ignore[arg-type]

            # Execute each tool call and collect results.
            for tool_call in assistant_message.tool_calls:
                tool_name: str = tool_call.function.name
                try:
                    tool_args: dict[str, Any] = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    tool_args = {}

                tool_result = "done"

                # ── Messaging / note tools ──────────────────────────────── #
                if tool_name in _ACTION_TOOLS:
                    action_record = {"tool_name": tool_name, "args": tool_args}
                    actions_taken.append(action_record)
                    await crud.log_activity(
                        db,
                        run_uuid,
                        "action_executed",
                        action_record,
                    )
                    await db.commit()
                    activity_log_entries_written += 1

                # ── Memory update ───────────────────────────────────────── #
                elif tool_name == "update_memory":
                    new_memory_summary = tool_args.get("new_summary", memory_summary)
                    await crud.update_run(
                        db, run_uuid, memory_summary=new_memory_summary
                    )
                    await db.commit()

                # ── Record reasoning ────────────────────────────────────── #
                elif tool_name == "record_reasoning":
                    await crud.log_activity(
                        db,
                        run_uuid,
                        "agent_reasoning",
                        {"outcome": tool_args.get("outcome", "")},
                    )
                    await db.commit()
                    activity_log_entries_written += 1

                # Append tool result so Groq continues the conversation.
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": tool_result,
                    }
                )

    # ------------------------------------------------------------------ #
    # Step 6: return result dict consumed by the workflow                 #
    # ------------------------------------------------------------------ #
    return {
        "actions_taken": actions_taken,
        "memory_summary": new_memory_summary,
        "trigger": trigger,
        "activity_log_entries_written": activity_log_entries_written,
    }


# ---------------------------------------------------------------------------
# Activity 4 — classify_event_activity
# ---------------------------------------------------------------------------

# Rule table: event_type → minimum aggressiveness required to wake immediately.
# None means "always wake"; "never" means never wake early.
_WAKE_RULES: dict[str, str | None] = {
    # Always wake
    "payment_failed": None,
    "refund_requested": None,
    "customer_message_received": None,
    "delivered": None,
    # Wake if moderate or aggressive
    "shipment_delayed": "moderate",
    # Wake only if aggressive
    "no_update_for_n_hours": "aggressive",
    # Never wake early
    "payment_confirmed": "never",
    "shipment_created": "never",
    "order_created": "never",
}

_AGGRESSIVENESS_RANK = {"conservative": 0, "moderate": 1, "aggressive": 2}


@activity.defn
async def classify_event_activity(
    event_type: str,
    wake_aggressiveness: str,
) -> bool:
    """
    Rule-based classifier: should this event wake the workflow immediately?

    No LLM call — intentionally fast and deterministic.
    Returns True if the event warrants an immediate wake, False otherwise.

    Note: DB logging is skipped here because no run_id is available in the
    activity signature. Callers that need logging should use
    log_activity_activity separately.
    """
    rule = _WAKE_RULES.get(event_type)

    if rule is None:
        # Always-wake event.
        should_wake = True
    elif rule == "never":
        should_wake = False
    else:
        # Wake if the supervisor's aggressiveness meets or exceeds the threshold.
        required_rank = _AGGRESSIVENESS_RANK.get(rule, 0)
        current_rank = _AGGRESSIVENESS_RANK.get(wake_aggressiveness, 1)
        should_wake = current_rank >= required_rank

    if rule is None and event_type not in _WAKE_RULES:
        # Unknown event → safe default: wake.
        should_wake = True

    activity.logger.info(
        "classify_event: event_type=%s aggressiveness=%s → wake=%s",
        event_type,
        wake_aggressiveness,
        should_wake,
    )
    return should_wake


# ---------------------------------------------------------------------------
# Activity 5 — generate_final_output_activity
# ---------------------------------------------------------------------------


@activity.defn
async def generate_final_output_activity(
    run_id: str,
    memory_summary: str,
    status: str,
    order_context: dict | None = None,
    supervisor_config: dict | None = None,
) -> dict:
    """
    Generate a structured final report for a completed run.

    Fetches all activity-log entries from the DB, asks Groq to synthesise a
    final summary, persists it to ``runs.final_output``, and returns the dict.
    """
    run_uuid = uuid.UUID(run_id)
    groq = _get_groq()

    async with AsyncSessionLocal() as db:
        # Fetch the full activity log for this run.
        logs = await crud.get_activities(db, run_uuid)

        # Build a compact action timeline for the prompt.
        action_lines: list[str] = []
        for entry in logs:
            ts = entry.created_at.isoformat() if entry.created_at else "?"
            payload_str = json.dumps(entry.payload or {}, default=str)
            action_lines.append(f"[{ts}] {entry.activity_type}: {payload_str}")

        action_log_text = "\n".join(action_lines) if action_lines else "(no actions logged)"

        prompt = f"""You are summarising the supervision of an order.

Memory Summary: {memory_summary}
Final Status: {status}
Order Context: {json.dumps(order_context or {}, default=str)}
Supervisor Config: {json.dumps(supervisor_config or {}, default=str)}

Full Activity Log:
{action_log_text}

Please provide a structured JSON response with exactly these keys:
- final_summary: (string) What happened with this order end-to-end
- important_actions_taken: (list of strings) The most impactful actions taken
- key_learnings: (list of strings) What could be improved in handling similar orders
- recommendations: (list of strings) Suggestions for similar future orders

Respond with valid JSON only."""

        response = await groq.chat.completions.create(
            model=supervisor_config.get("model", "llama-3.3-70b-versatile")
            if supervisor_config
            else "llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": "You are a JSON-only responder. Output valid JSON and nothing else."},
                {"role": "user", "content": prompt},
            ],
        )

        raw = response.choices[0].message.content or "{}"

        # Strip markdown fences if Groq wraps the JSON.
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        try:
            final_output: dict = json.loads(raw)
        except json.JSONDecodeError:
            # Fallback: store the raw text so nothing is lost.
            final_output = {
                "final_summary": raw,
                "important_actions_taken": [],
                "key_learnings": [],
                "recommendations": [],
            }

        # Persist to the database.
        await crud.update_run(
            db,
            run_uuid,
            final_output=final_output,
            status="completed",
        )
        await db.commit()

    return final_output
