# Order Supervisor — Architecture

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User (Browser)                           │
│                     http://localhost:3000                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ REST / JSON
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI  (port 8000)                        │
│                                                                 │
│  POST /api/runs          →  start_workflow()                    │
│  POST /api/runs/:id/events  →  handle.signal(receive_event)     │
│  GET  /api/runs/:id      →  DB + handle.query(get_state)        │
│  POST /api/runs/:id/interrupt|resume|terminate                  │
└──────────┬──────────────────────────────┬───────────────────────┘
           │  SQLAlchemy (asyncpg)         │  Temporal gRPC (SDK)
           ▼                              ▼
┌──────────────────┐           ┌──────────────────────────────────┐
│   PostgreSQL     │           │      Temporal Server             │
│                  │           │                                  │
│  supervisors     │           │  OrderSupervisorWorkflow         │
│  runs            │◄──────────│  (one per order, durable)        │
│  activity_log    │           │                                  │
└──────────────────┘           └──────────────┬───────────────────┘
                                              │  task queue
                                              ▼
                               ┌──────────────────────────────────┐
                               │         Temporal Worker          │
                               │                                  │
                               │  run_agent_activity              │
                               │    └─► Groq LLM (tool loop)      │
                               │  update_run_status_activity      │
                               │  log_activity_activity           │
                               │  classify_event_activity         │
                               │  generate_final_output_activity  │
                               └──────────────────────────────────┘
```

---

## Why Temporal?

### The core problem

A long-running order supervisor needs to:

- **Sleep** for hours or days between checks without holding open a thread or database poll
- **Wake immediately** when an important event arrives (payment failure, customer message)
- **Survive** process restarts, crashes, and deploys without losing state
- **Be paused** by a human and resumed cleanly

None of this is trivially solvable with `asyncio.sleep` + queues. Temporal provides it as primitives.

### Durable sleep

`workflow.wait_condition(..., timeout=timedelta(minutes=N))` persists the workflow's intent to the Temporal server. The worker process can be killed and restarted — when it reconnects, Temporal replays the workflow history to restore exact state and the timer resumes from where it left off.

### Signal handling

External events are delivered as **signals** — messages that arrive in the workflow's inbox even while it is sleeping. The signal handler appends the event to `pending_events` and sets `new_event_arrived = True`, which wakes `wait_condition` early.

### Replay safety

Temporal replays the entire workflow history on restart. This means:

- All workflow code **must be deterministic** — the same inputs produce the same sequence of calls
- Non-deterministic operations (DB access, HTTP calls, `datetime.utcnow()`) must be wrapped in **activities**
- Non-workflow-safe Python modules are imported inside `workflow.unsafe.imports_passed_through()` to prevent the sandbox from intercepting them

---

## The Wake / Sleep Loop

```
workflow.run()
│
├── activity: update_run_status("active")
├── activity: run_agent(trigger="start")          ← initial assessment
│
└── while not terminated and not terminal_event:
    │
    ├── current_status = "sleeping"
    ├── activity: update_run_status("sleeping")
    ├── record next_wake_up timestamp
    ├── new_event_arrived = False
    │
    ├── wait_condition(
    │     fn  = new_event_arrived
    │           OR should_terminate
    │           OR terminal_event_received
    │           OR is_interrupted,
    │     timeout = wake_up_interval_minutes
    │   )
    │       ├── timeout fires   →  trigger = "scheduled"
    │       └── condition true  →  trigger = "signal"
    │
    ├── [if interrupted]
    │     wait_condition(not interrupted OR should_terminate)
    │     trigger = "resumed"
    │
    ├── current_status = "active"
    ├── events_to_process = pending_events.copy(); pending_events.clear()
    ├── activity: run_agent(trigger, events_to_process)
    │
    └── [if activity_log_count > 100] → continue_as_new(input)
        (restarts workflow with clean history, reads state from DB)
```

**Key design choices:**
- `pending_events` is a list on the workflow object — it accumulates events that arrive while the agent is running or while sleeping. They are batch-delivered to the agent on the next wake.
- `new_event_arrived` is a simple bool flag, not a reference to the list — safe to capture in a `wait_condition` lambda (Temporal replays are deterministic over bool flags).
- `continue_as_new` is the Temporal-idiomatic way to handle long-running workflows without unbounded history growth.

---

## Agent Design (Groq Tool-Use Loop)

`run_agent_activity` implements a standard **ReAct-style tool-use loop**:

```
system prompt
  + order context
  + memory summary
  + recent events
  + current time + trigger
        │
        ▼
   Groq (llama-3.3-70b)
        │
        ├── tool_calls present?
        │     YES → execute each tool → append result → call Groq again
        │     NO  → agent is done for this cycle
        │
        └── return {actions_taken, new_memory_summary}
```

### Available tools

| Tool | Side effect |
|---|---|
| `message_fulfillment_team` | Logs `action_executed` to DB |
| `message_payments_team` | Logs `action_executed` to DB |
| `message_logistics_team` | Logs `action_executed` to DB |
| `message_customer` | Logs `action_executed` to DB |
| `create_internal_note` | Logs `action_executed` to DB |
| `update_memory` | Updates `runs.memory_summary` in DB |
| `record_reasoning` | Logs `agent_reasoning` to DB |

Tools in this POC log to the database — in production they would call real APIs (email, SMS, internal ticketing).

### Wake aggressiveness

The system prompt includes an aggressiveness description that shapes how the model interprets its mandate:

- **Conservative** — only act on payment failures, refund requests, or direct complaints
- **Moderate** — act on delays and issues; check in periodically
- **Aggressive** — proactively communicate on every significant event

---

## Memory Design

Each agent cycle can call `update_memory(new_summary)` to replace the rolling text summary. This summary is:

1. Persisted to `runs.memory_summary` in the DB
2. Passed back into the workflow state via the activity result
3. Included in the next cycle's user prompt as "Memory Summary"

This implements a **rolling compressed context window** — the agent decides what is worth remembering. Over many cycles this prevents the prompt from growing unboundedly while preserving decision continuity.

---

## Event Classifier

`classify_event_activity` (and the identical inline function in `runs.py`) is a **pure rule table** — no LLM, sub-millisecond latency:

```python
_WAKE_RULES = {
    # Always wake (critical)
    "payment_failed":              None,    # → wake
    "refund_requested":            None,    # → wake
    "customer_message_received":   None,    # → wake
    "delivered":                   None,    # → wake (terminal)

    # Wake if aggressiveness ≥ threshold
    "shipment_delayed":            "moderate",
    "no_update_for_n_hours":       "aggressive",

    # Never wake early
    "payment_confirmed":           "never",
    "shipment_created":            "never",
    "order_created":               "never",
}
```

Unknown events default to **wake** (safe default — better to over-notify than miss something).

The result (`will_wake: bool`) is logged to `activity_log` alongside the event so the audit trail explains why the agent did or did not act.

---

## Workflow Completion

The main loop exits when **any** of these is true:

| Condition | Source |
|---|---|
| `terminal_event_received` | Set when `event_type` is `delivered` or `refund_requested` |
| `should_terminate` | Set by the `terminate_workflow` signal |

On exit, `generate_final_output_activity` fetches the full activity log and calls Groq to produce a structured final report with `final_summary`, `important_actions_taken`, `key_learnings`, and `recommendations`.

---

## Database Schema Rationale

```
supervisors           runs                    activity_log
─────────────         ────────────────────    ─────────────────
id (UUID PK)          id (UUID PK)            id (UUID PK)
name                  supervisor_id (FK)      run_id (FK)
base_instruction      order_id                activity_type
available_actions     order_context (JSON)    payload (JSON)
wake_interval         status                  created_at
wake_aggressiveness   temporal_workflow_id
model                 memory_summary (Text)
created_at            next_wake_up
                      final_output (JSON)
                      created_at
                      updated_at
```

**Why JSON columns?**
- `order_context` and `final_output` have flexible, evolving schemas — JSON avoids migration churn for POC iteration
- `available_actions` is a JSON array so supervisor configs can have different tool subsets without a join table

**Why UUIDs?**
- Workflow IDs are formed as `order-supervisor-{run.id}` — if `run.id` were an integer, workflow IDs would be short and predictable. UUIDs make them globally unique and non-guessable.

---

## What Would Change in Production

| Concern | POC approach | Production approach |
|---|---|---|
| **History size** | `continue_as_new` at 100 log entries | Use Temporal's built-in history size metrics; trigger earlier |
| **Auth** | None | JWT on FastAPI; Temporal mTLS between worker and server |
| **Tool execution** | Logs to DB only | Real API calls (SendGrid, Twilio, internal REST) |
| **Idempotency** | Events are appended on every signal | Deduplicate by event ID before signalling |
| **Memory** | Plain text rolling summary | Structured JSON + vector search for semantic recall |
| **Worker scaling** | Single worker process | Multiple worker replicas; separate task queues per tenant |
| **Temporal hosting** | `temporal server start-dev` (in-memory) | Temporal Cloud or self-hosted with PostgreSQL persistence |
| **DB migrations** | `init_db()` creates tables on startup | Alembic only; remove `init_db()` call |
| **Model selection** | One model per supervisor config | Dynamic model routing based on event severity |
| **Observability** | Activity log in DB | OpenTelemetry traces to Jaeger/Datadog; Temporal metrics |

---

## Known Limitations of This POC

1. **Tools don't do real work** — `message_customer` writes a log entry, not an email. Wiring to real APIs is left as the next step.

2. **No authentication** — the API and Temporal worker have no auth. Anyone with network access can read/write all runs.

3. **Single namespace** — all orders share one Temporal namespace and task queue. In production you'd namespace by tenant.

4. **Memory is LLM-quality** — the rolling summary depends on the model choosing to call `update_memory`. If it doesn't, context is lost between cycles.

5. **No retry policy on activities** — `start_to_close_timeout` is set but no explicit `retry_policy`. Transient Groq API failures will cause the activity to fail the workflow.

6. **`init_db()` on startup** — convenient for dev but dangerous in production if multiple replicas run simultaneously; use Alembic migrations instead.

7. **`temporal server start-dev` is in-memory** — workflow state is lost on restart. Use Temporal Cloud or a properly persisted server for anything beyond local testing.
