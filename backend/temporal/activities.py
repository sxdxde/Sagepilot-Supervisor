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

import logging

from groq import AsyncGroq
from temporalio import activity

from backend.config import settings
from backend.database import crud
from backend.database.db import AsyncSessionLocal

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Groq client — created fresh each call so .env key changes take effect
# without needing a worker restart.
# ---------------------------------------------------------------------------

def _get_groq() -> AsyncGroq:
    return AsyncGroq(api_key=settings.groq_api_key)


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
    memory_was_updated = False

    logger.info(
        "Agent waking: run=%s trigger=%s events=%d",
        run_id, trigger, len(events_to_process),
    )

    try:
        async with AsyncSessionLocal() as db:
            # -------------------------------------------------------------- #
            # Step 1: log wake trigger                                         #
            # -------------------------------------------------------------- #
            await crud.log_activity(
                db,
                run_uuid,
                "agent_reasoning",
                {"trigger": trigger, "events_count": len(events_to_process)},
            )
            await db.commit()
            activity_log_entries_written += 1

            # -------------------------------------------------------------- #
            # Step 2: system prompt                                            #
            # -------------------------------------------------------------- #
            system_prompt = f"""You are an AI order supervisor. Your job is to oversee order {order_id} and take appropriate actions based on its current state and recent events.

Base instruction: {base_instruction}

Wake aggressiveness: {wake_aggressiveness}
- conservative: only act on critical issues (payment failed, refund requests, direct customer complaints)
- moderate: act on delays and problems; check in periodically on normal progress
- aggressive: proactively communicate on every significant event

=== COMMUNICATION TOOLS (use based on aggressiveness and situation) ===
These tools send messages to the relevant parties: {available_actions}

=== REQUIRED STEPS — you MUST call both of these every single wake cycle ===

1. record_reasoning — call this to document WHY you did or did not take action.
   Call it even if you decide to do nothing.

2. update_memory — call this EVERY CYCLE with an updated summary that includes:
   - Current order status and what has happened so far
   - Any issues encountered and how they were handled
   - Actions you have taken and when
   - What to watch for next
   This is your only persistent memory across wake cycles. Skipping it loses all context."""

            # -------------------------------------------------------------- #
            # Step 3: user message                                             #
            # -------------------------------------------------------------- #
            user_message = f"""=== ORDER CONTEXT ===
{json.dumps(order_context, default=str)}

=== YOUR MEMORY FROM PREVIOUS CYCLES ===
{memory_summary if memory_summary else "(no memory yet — this is your first wake cycle for this order)"}

=== EVENTS SINCE LAST WAKE ===
{json.dumps(events_to_process, default=str) if events_to_process else "(no new events — this is a scheduled check-in)"}

=== ADDITIONAL INSTRUCTIONS ===
{additional_instructions if additional_instructions else "(none)"}

Current Time: {datetime.utcnow().isoformat()}
Wake trigger: {trigger}

Instructions:
1. Review the order context, your memory, and the recent events.
2. Decide what (if any) communication actions to take based on your aggressiveness setting.
3. Call record_reasoning to document your decision.
4. Call update_memory with an updated summary — THIS IS REQUIRED EVERY CYCLE."""

            messages: list[dict] = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ]

            # -------------------------------------------------------------- #
            # Steps 4 & 5: agentic tool-call loop (max 10 iterations)        #
            # -------------------------------------------------------------- #
            groq = _get_groq()
            max_iterations = 10

            for _iteration in range(max_iterations):
                logger.debug("Agent loop iteration %d for run %s", _iteration + 1, run_id)

                try:
                    response = await groq.chat.completions.create(
                        model=model,
                        messages=messages,
                        tools=_AGENT_TOOLS,
                        tool_choice="auto",
                    )
                except Exception as groq_err:
                    logger.error(
                        "Groq API error on iteration %d for run %s: %s",
                        _iteration + 1, run_id, groq_err, exc_info=True,
                    )
                    await crud.log_activity(
                        db, run_uuid, "system",
                        {"error": f"Groq API error: {groq_err}", "iteration": _iteration + 1},
                    )
                    await db.commit()
                    activity_log_entries_written += 1
                    break

                assistant_message = response.choices[0].message

                # No tool calls → agent is done.
                if not assistant_message.tool_calls:
                    messages.append(
                        {"role": "assistant", "content": assistant_message.content or ""}
                    )
                    break

                messages.append({
                    "role": "assistant",
                    "content": assistant_message.content or "",
                    "tool_calls": [
                        {
                            "id": tc.id,
                            "type": "function",
                            "function": {
                                "name": tc.function.name,
                                "arguments": tc.function.arguments,
                            },
                        }
                        for tc in assistant_message.tool_calls
                    ],
                })

                # Execute each tool call and collect results.
                for tool_call in assistant_message.tool_calls:
                    tool_name: str = tool_call.function.name
                    try:
                        tool_args: dict[str, Any] = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError:
                        tool_args = {}

                    tool_result = "done"
                    logger.info("Tool call: run=%s tool=%s", run_id, tool_name)

                    # ── Messaging / note tools ────────────────────────────── #
                    if tool_name in _ACTION_TOOLS:
                        action_record = {"tool_name": tool_name, "args": tool_args}
                        actions_taken.append(action_record)
                        await crud.log_activity(db, run_uuid, "action_executed", action_record)
                        await db.commit()
                        activity_log_entries_written += 1

                    # ── Memory update ─────────────────────────────────────── #
                    elif tool_name == "update_memory":
                        new_memory_summary = tool_args.get("new_summary", memory_summary)
                        await crud.update_run(db, run_uuid, memory_summary=new_memory_summary)
                        await db.commit()
                        memory_was_updated = True

                    # ── Record reasoning ──────────────────────────────────── #
                    elif tool_name == "record_reasoning":
                        await crud.log_activity(
                            db, run_uuid, "agent_reasoning",
                            {"outcome": tool_args.get("outcome", "")},
                        )
                        await db.commit()
                        activity_log_entries_written += 1

                    messages.append({
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": tool_result,
                    })

            # -------------------------------------------------------------- #
            # Step 6: force a real memory update if the agent skipped it      #
            # This makes one more Groq call with tool_choice locked to        #
            # update_memory so the model writes a proper summary, not a       #
            # static template.                                                 #
            # -------------------------------------------------------------- #
            if not memory_was_updated:
                logger.warning(
                    "Agent skipped update_memory for run=%s — forcing dedicated call", run_id
                )
                try:
                    force_messages = messages + [{
                        "role": "user",
                        "content": (
                            "You have not called update_memory yet this cycle. "
                            "Call it now. Write a concise but complete summary covering: "
                            "the current order status, what events occurred, what actions "
                            "you took or decided not to take and why, and what to watch for next."
                        ),
                    }]
                    forced_resp = await groq.chat.completions.create(
                        model=model,
                        messages=force_messages,
                        tools=_AGENT_TOOLS,
                        tool_choice={"type": "function", "function": {"name": "update_memory"}},
                    )
                    forced_tcs = forced_resp.choices[0].message.tool_calls
                    if forced_tcs:
                        try:
                            args = json.loads(forced_tcs[0].function.arguments)
                        except json.JSONDecodeError:
                            args = {}
                        summary = args.get("new_summary", "").strip()
                        if summary:
                            new_memory_summary = summary
                            await crud.update_run(db, run_uuid, memory_summary=summary)
                            await db.commit()
                            memory_was_updated = True
                            logger.info("Forced memory update written for run=%s", run_id)
                except Exception as force_err:
                    logger.warning(
                        "Forced memory update Groq call failed for run=%s: %s", run_id, force_err
                    )

    except Exception as exc:
        logger.error(
            "run_agent_activity fatal error for run=%s: %s", run_id, exc, exc_info=True
        )
        try:
            async with AsyncSessionLocal() as db:
                await crud.log_activity(
                    db, run_uuid, "system",
                    {"error": f"Activity failed: {exc}", "trigger": trigger},
                )
                await db.commit()
        except Exception:
            pass
        raise

    # ------------------------------------------------------------------ #
    # Step 7: last-resort static fallback (only if forced call also fails)#
    # ------------------------------------------------------------------ #
    if not memory_was_updated:
        logger.warning("All memory update attempts failed for run=%s — writing static fallback", run_id)
        fallback = (
            f"Wake trigger: {trigger}. "
            f"Events processed: {len(events_to_process)}. "
            f"Actions taken: {len(actions_taken)}. "
            f"(Memory update failed — check worker logs for errors.)"
        )
        try:
            async with AsyncSessionLocal() as db:
                await crud.update_run(db, run_uuid, memory_summary=fallback)
                await db.commit()
        except Exception as db_err:
            logger.error("Failed to write static fallback memory for run=%s: %s", run_id, db_err)
        new_memory_summary = fallback

    # ------------------------------------------------------------------ #
    # Step 7: return result dict consumed by the workflow                 #
    # ------------------------------------------------------------------ #
    logger.info(
        "Agent sleeping: run=%s actions=%d log_entries=%d memory_updated=%s",
        run_id, len(actions_taken), activity_log_entries_written, memory_was_updated,
    )
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
    if event_type not in _WAKE_RULES:
        # Unknown event → safe default: wake.
        should_wake = True
    else:
        rule = _WAKE_RULES[event_type]
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
