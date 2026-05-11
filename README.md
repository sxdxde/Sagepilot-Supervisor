# Sagepilot — AI Order Supervisor (Assignment)

## Demo Video
https://drive.google.com/file/d/1Jm6PuNkZq9S6JsAO_pGZ16BBBjxYSt9q/view?usp=sharing

Sagepilot is a proof-of-concept **long-running AI agent platform** for e-commerce order supervision. Each order gets its own persistent [Temporal](https://temporal.io) workflow that sleeps between check-ins, wakes immediately on important events, runs a Groq-powered LLM agent to reason and take action, and completes when the order reaches a terminal state.

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Architecture overview](#architecture-overview)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [How it works — deep dive](#how-it-works--deep-dive)
   - [The wake / sleep loop](#the-wake--sleep-loop)
   - [The AI agent — ReAct tool loop](#the-ai-agent--react-tool-loop)
   - [Forced memory update guarantee](#forced-memory-update-guarantee)
   - [Event classification](#event-classification)
   - [Rolling memory](#rolling-memory)
   - [Workflow completion and final report](#workflow-completion-and-final-report)
6. [Database schema](#database-schema)
7. [REST API reference](#rest-api-reference)
8. [Prerequisites](#prerequisites)
9. [First-time setup](#first-time-setup)
10. [Running the application](#running-the-application)
11. [Critical startup order](#critical-startup-order)
12. [Environment variables](#environment-variables)
13. [Make commands](#make-commands)
14. [Using the application](#using-the-application)
15. [Troubleshooting](#troubleshooting)
16. [Resetting to a clean state](#resetting-to-a-clean-state)
17. [Known limitations](#known-limitations)
18. [Production considerations](#production-considerations)

---

## What it does

- **Supervisor configs** — Reusable templates that define the agent's base instruction, wake schedule, aggressiveness level, allowed actions, and LLM model.
- **Supervised runs** — Attach a supervisor to a specific order. This creates a database row and immediately starts a durable Temporal workflow.
- **Event injection** — Send real-world order events (`payment_failed`, `shipment_delayed`, `delivered`, etc.) into a live workflow. The classifier decides in under a millisecond whether the event wakes the agent immediately or queues it for the next scheduled check-in.
- **Live dashboard** — Polls every 3–5 seconds showing run status, memory summaries, and activity logs in near-real time.
- **Human-in-the-loop controls** — Interrupt a run for manual review, resume it, inject ad-hoc instructions mid-flight, or terminate cleanly.
- **Final report** — On completion the agent generates a structured JSON summary: what happened, key actions taken, lessons learned, and recommendations.

---

## Architecture overview

```
┌───────────────────────────────────────────────────────────┐
│                    Browser (port 3000)                    │
│               Next.js 15 + React 19 frontend              │
└──────────────────────────┬────────────────────────────────┘
                           │  REST / JSON
                           ▼
┌───────────────────────────────────────────────────────────┐
│              FastAPI (port 8000) — Python 3.11+           │
│                                                           │
│  POST /api/runs              →  start_workflow()          │
│  POST /api/runs/:id/events   →  signal(receive_event)     │
│  GET  /api/runs/:id          →  DB read + query(get_state)│
│  POST /api/runs/:id/interrupt|resume|terminate|instructions│
└─────────────┬─────────────────────────────┬───────────────┘
              │  SQLAlchemy asyncpg          │  Temporal gRPC (port 7233)
              ▼                             ▼
┌─────────────────────┐       ┌─────────────────────────────┐
│  PostgreSQL          │       │    Temporal Server           │
│  (Supabase)          │       │    (in-memory dev mode)      │
│                     │       │                             │
│  supervisors        │       │  OrderSupervisorWorkflow     │
│  runs               │◄──────│  (one per order, durable)   │
│  activity_log       │       │                             │
└─────────────────────┘       └──────────────┬──────────────┘
                                             │  task queue
                                             ▼
                              ┌─────────────────────────────┐
                              │       Temporal Worker        │
                              │                             │
                              │  run_agent_activity          │
                              │    ├─ Groq LLM tool loop    │
                              │    └─ forced memory update  │
                              │  update_run_status_activity  │
                              │  log_activity_activity       │
                              │  classify_event_activity     │
                              │  generate_final_output_activity│
                              └─────────────────────────────┘
```

---

## Tech stack

| Layer | Technology | Version |
|---|---|---|
| Frontend | Next.js (App Router), React, Tailwind CSS, TypeScript | Next 15, React 19 |
| Backend API | FastAPI, uvicorn | latest |
| Workflow engine | Temporal Python SDK | latest |
| AI agent | Groq API — `llama-3.3-70b-versatile` | configurable |
| Database | PostgreSQL via SQLAlchemy async + asyncpg | Python 3.11+ |
| Migrations | Alembic | latest |
| Config | Pydantic Settings | latest |

---

## Project structure

```
Sagepilot/
├── Start_Supervisor.command        # macOS double-click launcher
├── README.md
└── order-supervisor/
    ├── Makefile                    # Task runner (worker / api / frontend / dev)
    ├── ARCHITECTURE.md             # Detailed design notes
    ├── backend/
    │   ├── pyproject.toml          # Python package + dependencies
    │   ├── alembic.ini             # Migration config
    │   ├── main.py                 # FastAPI app, CORS, startup hooks
    │   ├── config.py               # Pydantic-settings (reads .env)
    │   ├── worker.py               # Temporal worker entrypoint
    │   ├── seed.py                 # Seeds a default supervisor config
    │   ├── .env                    # Your secrets (not committed)
    │   ├── .env.example            # Template
    │   ├── api/
    │   │   ├── runs.py             # /api/runs — full run lifecycle
    │   │   ├── supervisors.py      # /api/supervisors — CRUD
    │   │   └── schemas.py          # Pydantic request/response models
    │   ├── database/
    │   │   ├── models.py           # SQLAlchemy ORM (Supervisor, Run, ActivityLog)
    │   │   ├── db.py               # Async engine, session factory, init_db()
    │   │   └── crud.py             # Async CRUD helpers
    │   └── temporal/
    │       ├── workflows.py        # OrderSupervisorWorkflow (signals, queries, loop)
    │       ├── activities.py       # All five Temporal activities + Groq agent
    │       └── client.py           # Singleton Temporal client
    └── frontend/
        ├── package.json
        ├── app/
        │   ├── layout.tsx          # Root layout + global nav
        │   ├── page.tsx            # Dashboard (runs list + supervisor cards)
        │   ├── not-found.tsx
        │   ├── supervisors/
        │   │   └── new/page.tsx    # Create supervisor form
        │   └── runs/
        │       ├── new/page.tsx    # Create run form
        │       └── [id]/
        │           ├── page.tsx    # Run detail, activity log, live controls
        │           └── components.tsx  # Card, FinalOutput, re-exports
        ├── components/
        │   ├── ActivityEntry.tsx   # Expandable log entry with colour coding
        │   ├── StatusBadge.tsx     # Animated status pill
        │   ├── ErrorBoundary.tsx
        │   └── LoadingSpinner.tsx
        └── lib/
            └── api.ts              # Fully typed fetch wrappers for all endpoints
```

---

## How it works — deep dive

### The wake / sleep loop

Every run maps 1-to-1 to an `OrderSupervisorWorkflow` instance. The workflow is durable — it can sleep for minutes or hours without holding a thread. Temporal persists all state to its own store (in-memory in dev mode).

```
workflow.run()
│
├── activity: update_run_status("active")
├── activity: run_agent(trigger="start")       ← immediate first assessment
│
└── while not terminated and not terminal_event:
    ├── update_run_status("sleeping")
    ├── record next_wake_up timestamp
    ├── new_event_arrived = False
    │
    ├── wait_condition(
    │     fn  = new_event_arrived
    │           OR should_terminate
    │           OR terminal_event_received
    │           OR is_interrupted
    │     timeout = wake_up_interval_minutes      ← default 2 min
    │   )
    │       ├── timeout → trigger = "scheduled"
    │       └── condition met → trigger = "signal"
    │
    ├── [if interrupted] → wait until resumed, trigger = "resumed"
    │
    ├── consume pending_events, clear buffer
    ├── activity: run_agent(trigger, events)
    │
    └── [if activity_log_count > 100] → continue_as_new
```

**Key design points:**

- `workflow.wait_condition(..., timeout=...)` is a durable timer stored by Temporal. Killing and restarting the worker process does not reset the countdown.
- `pending_events` accumulates every event that arrives while the agent is busy or sleeping. All are batch-delivered on the next wake — no event is ever silently dropped.
- `continue_as_new` is Temporal's mechanism for preventing unbounded history growth. At >100 activity log entries the workflow restarts with a clean history, reading its state from the database.

### The AI agent — ReAct tool loop

`run_agent_activity` is the core AI agent. It runs as a Temporal activity (plain async function, no workflow context). It implements a standard **ReAct tool-use loop** against the Groq chat completions API:

```
System prompt
  • base_instruction from supervisor config
  • aggressiveness level + description
  • list of communication tools available
  • explicit requirement: call record_reasoning AND update_memory every cycle
        │
        ▼
User message
  • order context (customer, items, amount, notes)
  • rolling memory from previous cycles
  • events since last wake (or "no new events")
  • additional runtime instructions
  • current UTC time + wake trigger
        │
        ▼
   Groq (llama-3.3-70b-versatile, tool_choice="auto")
        │
        ├── tool_calls present?
        │     YES → execute each → append result → call Groq again (max 10 iterations)
        │     NO (text response) → break loop
        │
        └── after loop → memory update guarantee (see below)
```

**Available tools:**

| Tool | Side effect in DB | Counts as action? |
|---|---|---|
| `message_fulfillment_team(message)` | `action_executed` log entry | Yes |
| `message_payments_team(message)` | `action_executed` log entry | Yes |
| `message_logistics_team(message)` | `action_executed` log entry | Yes |
| `message_customer(message)` | `action_executed` log entry | Yes |
| `create_internal_note(note)` | `action_executed` log entry | Yes |
| `update_memory(new_summary)` | Updates `runs.memory_summary` | No |
| `record_reasoning(outcome)` | `agent_reasoning` log entry | No |

In production, the messaging tools would call real APIs (email, SMS, internal ticketing). In this POC they write to the database so every decision is fully auditable.

**Wake aggressiveness** shapes how the system prompt instructs the agent:

| Level | Agent behaviour |
|---|---|
| `conservative` | Only act on payment failures, refund requests, or direct customer complaints |
| `moderate` | Act on delays and problems; check in periodically on scheduled wakes |
| `aggressive` | Proactively communicate on every significant order event |

### Forced memory update guarantee

With `tool_choice="auto"` the model sometimes returns a plain text response without calling `update_memory` (e.g., "The order looks fine, no action needed."). When this happens the main loop exits and memory would never update.

The activity handles this in three layers:

1. **Main loop** — model calls `update_memory` voluntarily. `memory_was_updated = True`. ✓
2. **Forced call** — if `memory_was_updated` is still False after the loop, one more Groq call is made with `tool_choice={"type": "function", "function": {"name": "update_memory"}}`. This forces the model to write a real, context-aware summary using the full conversation history accumulated in the loop. This is the primary guarantee.
3. **Static fallback** — only reached if the forced Groq call itself throws (network error etc.). Writes `"Wake trigger: X. Events: N. Actions: N. (check worker logs)"` so the memory field always shows something.

### Event classification

The event classifier is a **pure rule table** — no LLM call, sub-millisecond latency. It lives in both `activities.py` (for the Temporal activity) and inlined in `runs.py` (for the API endpoint response, to avoid a Temporal round-trip):

| Event type | Wake threshold |
|---|---|
| `payment_failed` | Always wake |
| `refund_requested` | Always wake |
| `customer_message_received` | Always wake |
| `delivered` | Always wake (also terminal) |
| `shipment_delayed` | Wake if aggressiveness ≥ `moderate` |
| `no_update_for_n_hours` | Wake only if `aggressive` |
| `payment_confirmed` | Never wake early |
| `shipment_created` | Never wake early |
| `order_created` | Never wake early |
| *(unknown event)* | Wake (safe default) |

The result `will_wake: bool` is:
- Returned in the `POST /api/runs/:id/events` response so the frontend can show "agent waking now" vs "queued for next scheduled wake"
- Written to `activity_log` alongside the event for the audit trail

### Rolling memory

Each agent cycle ends with `update_memory(new_summary)`. The summary is:

1. Persisted to `runs.memory_summary` in PostgreSQL
2. Returned to the workflow to update `self.memory_summary` in Temporal state
3. Passed back into the next cycle's prompt as `=== YOUR MEMORY FROM PREVIOUS CYCLES ===`

This is a **compressed rolling context window** — the agent decides what is worth carrying forward. It prevents the prompt from growing unboundedly while preserving decision continuity across many wake cycles.

### Workflow completion and final report

The main loop exits when any of these is true:

| Condition | Set by |
|---|---|
| `terminal_event_received` | `receive_event` signal when type is `delivered` or `refund_requested` |
| `should_terminate` | `terminate_workflow` signal from the API |

On exit, `generate_final_output_activity` fetches the full activity log, sends it to Groq, and returns:

```json
{
  "final_summary": "End-to-end description of what happened",
  "important_actions_taken": ["..."],
  "key_learnings": ["..."],
  "recommendations": ["..."]
}
```

This is persisted to `runs.final_output` and displayed in the Final Summary panel at the bottom of the run detail page.

---

## Database schema

```
supervisors
──────────────────────────────────────────────────────────
id                  UUID  PK  (auto-generated)
name                VARCHAR(255)
base_instruction    TEXT
available_actions   JSON array  e.g. ["message_customer", ...]
wake_up_interval_minutes  INTEGER  default 2
wake_aggressiveness VARCHAR(50)  conservative | moderate | aggressive
model               VARCHAR(100)  Groq model ID
created_at          TIMESTAMP

runs
──────────────────────────────────────────────────────────
id                   UUID  PK
supervisor_id        UUID  FK → supervisors.id
order_id             VARCHAR(255)
order_context        JSON  {customer_name, items[], amount, notes}
status               VARCHAR(50)
                       active | sleeping | interrupted | terminated | completed
temporal_workflow_id VARCHAR(255)  "order-supervisor-{run.id}"
memory_summary       TEXT  rolling agent memory (updated each cycle)
next_wake_up         TIMESTAMP
final_output         JSON  structured end-of-run report
created_at           TIMESTAMP
updated_at           TIMESTAMP

activity_log
──────────────────────────────────────────────────────────
id            UUID  PK
run_id        UUID  FK → runs.id
activity_type VARCHAR(100)  — see table below
payload       JSON
created_at    TIMESTAMP
```

**Activity types written to `activity_log`:**

| Type | Written when |
|---|---|
| `agent_reasoning` | Start of each wake cycle AND when agent calls `record_reasoning` |
| `action_executed` | Agent calls any messaging/note tool |
| `event_received` | External event arrives via `POST /api/runs/:id/events` |
| `instruction_added` | Runtime instruction added via `POST /api/runs/:id/instructions` |
| `wake_decision` | Classifier logs whether the event triggers immediate wake |
| `sleep_decision` | Workflow records going to sleep |
| `final_output` | Final report generated |
| `system` | Errors, Groq failures, any unexpected condition |

---

## REST API reference

Base URL: `http://localhost:8000`  
Interactive docs: `http://localhost:8000/docs`  
ReDoc: `http://localhost:8000/redoc`

### Supervisors

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/supervisors` | List all supervisor configs |
| `POST` | `/api/supervisors` | Create a new supervisor config |
| `GET` | `/api/supervisors/{id}` | Get a single supervisor by UUID |

**Create supervisor — request body:**
```json
{
  "name": "Standard Order Bot",
  "base_instruction": "Monitor orders and escalate issues promptly.",
  "available_actions": ["message_customer", "message_fulfillment_team", "create_internal_note"],
  "wake_up_interval_minutes": 2,
  "wake_aggressiveness": "moderate",
  "model": "llama-3.3-70b-versatile"
}
```

All fields except `name` and `base_instruction` are optional and have sensible defaults.

### Runs

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/runs` | List all runs (newest first) |
| `POST` | `/api/runs` | Start a new supervised run |
| `GET` | `/api/runs/{id}` | Full run detail — DB state + activity log + live Temporal query |
| `POST` | `/api/runs/{id}/events` | Inject an event signal into the workflow |
| `POST` | `/api/runs/{id}/instructions` | Add a runtime instruction for the next agent cycle |
| `POST` | `/api/runs/{id}/interrupt` | Pause the workflow (human review) |
| `POST` | `/api/runs/{id}/resume` | Resume a paused workflow |
| `POST` | `/api/runs/{id}/terminate` | Clean-terminate the workflow |

**Create run — request body:**
```json
{
  "supervisor_id": "uuid-of-supervisor",
  "order_id": "ORD-12345",
  "order_context": {
    "customer_name": "Jane Smith",
    "items": ["Blue Widget x2", "Red Widget x1"],
    "amount": 149.99,
    "notes": "Customer requested gift wrapping"
  }
}
```

**Send event — request body:**
```json
{
  "event_type": "shipment_delayed",
  "payload": { "reason": "Weather disruption", "new_eta": "2026-05-12" }
}
```

**Send event — response:**
```json
{
  "success": true,
  "event_type": "shipment_delayed",
  "will_wake": true
}
```

`will_wake: true` means the agent is waking immediately. `will_wake: false` means the event is queued and will be processed at the next scheduled wake.

**Supported event types:**

| Event | Wakes agent? |
|---|---|
| `payment_failed` | Always |
| `refund_requested` | Always |
| `customer_message_received` | Always |
| `delivered` | Always (ends the run) |
| `shipment_delayed` | If aggressiveness ≥ moderate |
| `no_update_for_n_hours` | If aggressiveness = aggressive |
| `payment_confirmed` | Never (queued only) |
| `shipment_created` | Never (queued only) |
| `order_created` | Never (queued only) |

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Temporal CLI | latest | `brew install temporal` |
| PostgreSQL | any | Supabase free tier works perfectly |
| Groq API key | — | [console.groq.com](https://console.groq.com) — free tier available |

---

## First-time setup

### 1. Clone and enter the project

```bash
git clone <repo-url>
cd Sagepilot/order-supervisor
```

### 2. Backend dependencies

```bash
pip install -e backend/
```

### 3. Backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres
GROQ_API_KEY=gsk_xxxx
TEMPORAL_HOST=localhost:7233
TEMPORAL_NAMESPACE=default
TASK_QUEUE=order-supervisor
```

**Getting the DATABASE_URL from Supabase:**
1. Go to your Supabase project → Settings → Database
2. Under "Connection string", select **URI**
3. Change the scheme from `postgresql://` to `postgresql+asyncpg://`
4. Fill in your password

**Getting the GROQ_API_KEY:**
1. Go to [console.groq.com](https://console.groq.com)
2. API Keys → Create API Key
3. Copy and paste the full key (starts with `gsk_`)

> **Important:** Do not add extra spaces or newlines around the key. The app reads it raw from `.env`.

### 4. Run database migrations

```bash
make migrate
```

Or seed the default supervisor config immediately:

```bash
python -m backend.seed
```

### 5. Frontend dependencies

```bash
cd frontend && npm install && cd ..
```

### 6. Frontend environment

```bash
cp frontend/.env.example frontend/.env.local
```

The default value `NEXT_PUBLIC_API_URL=http://localhost:8000` is correct for local development.

---

## Running the application

Open **four separate terminal windows**, all from the `order-supervisor/` directory.

### Terminal 1 — Temporal server

```bash
temporal server start-dev
```

Wait until you see:
```
Temporal server is running at 0.0.0.0:7233
Temporal UI is running at http://localhost:8233
```

### Terminal 2 — Temporal worker

```bash
make worker
```

You should see:
```
Starting worker on task queue 'order-supervisor' (namespace: default)
```

### Terminal 3 — FastAPI backend

```bash
make api
```

You should see:
```
Uvicorn running on http://127.0.0.1:8000
Application startup complete.
Temporal client connected to localhost:7233
```

### Terminal 4 — Next.js frontend

```bash
make frontend
```

Visit **[http://localhost:3000](http://localhost:3000)**

---

## Critical startup order

**Always start services in this order: Temporal → Worker → API → Frontend.**

If you start the worker before Temporal it will fail to connect and exit.  
If you start the API before Temporal it will log a warning but still start (it retries on the first request).

**When resetting / restarting after a crash:**

You must restart Temporal AND wipe the database together. `temporal server start-dev` is in-memory — if you wipe the database without restarting Temporal, Temporal will keep replaying old workflow histories pointing to deleted run IDs, causing `ForeignKeyViolationError` on every activity attempt. See [Resetting to a clean state](#resetting-to-a-clean-state).

**Never run two worker processes at the same time.** If two workers are running, Temporal distributes tasks between them. If one is stale (old code, old Groq key), some activities will fail and some will succeed randomly, making debugging nearly impossible.

Check for stale workers before starting:
```bash
ps aux | grep "backend.worker" | grep -v grep
```

Kill any you find:
```bash
pkill -f "backend.worker"
```

---

## Environment variables

### `backend/.env`

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Full asyncpg connection string to PostgreSQL |
| `GROQ_API_KEY` | Yes | Groq API key starting with `gsk_`. Get one free at console.groq.com |
| `TEMPORAL_HOST` | No | Temporal gRPC address. Default: `localhost:7233` |
| `TEMPORAL_NAMESPACE` | No | Temporal namespace. Default: `default` |
| `TASK_QUEUE` | No | Task queue name. Default: `order-supervisor` |

### `frontend/.env.local`

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | No | Backend base URL. Default: `http://localhost:8000` |

---

## Make commands

All commands run from `order-supervisor/`:

| Command | What it does |
|---|---|
| `make worker` | Start the Temporal worker (processes workflow activities) |
| `make api` | Start FastAPI with uvicorn hot-reload on port 8000 |
| `make frontend` | Start the Next.js dev server on port 3000 |
| `make dev` | Start all four services (Temporal + worker + API + frontend) concurrently via `npx concurrently` |
| `make migrate` | Run `alembic upgrade head` to apply pending DB migrations |
| `make install` | Install all backend (pip) and frontend (npm) dependencies |
| `make seed` | Create the default supervisor config (skips if supervisors already exist) |

> **Note on `make dev`:** Running all four in one terminal makes it hard to read per-service logs. For debugging, prefer four separate terminals so you can watch the worker output independently.

---

## Using the application

### Creating a supervisor config

1. Go to `http://localhost:3000`
2. Click **New Supervisor**
3. Fill in:
   - **Name** — a label for this configuration
   - **Base instruction** — the core system prompt. Be specific about when to escalate, when to stay quiet, and what good supervision looks like
   - **Wake interval** — how often the agent checks in (default 2 minutes). Use a short interval for testing
   - **Aggressiveness** — controls which events wake the agent early
   - **Model** — Groq model ID. `llama-3.3-70b-versatile` is the best for tool use
   - **Available actions** — which messaging tools the agent can call
4. Click **Create Supervisor**

### Starting a run

1. Click **New Run** (or "Use this supervisor" on a supervisor card)
2. Fill in the order details: order ID, customer name, items, amount, notes
3. Click **Start Supervisor Run**
4. You are redirected to the run detail page

The agent runs immediately on the start trigger. Within a few seconds you should see `agent_reasoning` log entries appear in the Activity Log panel.

### Sending events

On the run detail page, use the **Send Event** dropdown.

After sending, the feedback badge tells you:
- 🟢 **"[Event] sent — agent waking now"** — the classifier determined this event warrants immediate action
- 🟡 **"[Event] sent — queued for next scheduled wake"** — the event is buffered and will be processed at the next scheduled check-in

Events that always wake the agent: `payment_failed`, `refund_requested`, `customer_message_received`, `delivered`.

Events that never wake early (with moderate/conservative aggressiveness): `payment_confirmed`, `shipment_created`, `order_created`.

### Sending runtime instructions

Use the **Add Instruction** panel to inject a directive mid-flight:

```
If the shipment is more than 24 hours late, escalate to the logistics team immediately regardless of aggressiveness level.
```

Instructions are appended to the agent's prompt on the next wake cycle and remain active for the lifetime of the run.

### Completing a run

Send a `delivered` or `refund_requested` event. The workflow enters its completion path, generates the final report, and updates the run status to `completed`. The **Final Summary** panel appears at the bottom of the page.

---

## Troubleshooting

### Agent wakes but nothing appears in the activity log

**Cause:** The worker is running but the DB write fails.  
**Check:** Worker terminal for `ForeignKeyViolationError` or `IntegrityError`. This means Temporal has a stale workflow history for a run ID that was deleted. Fix: [reset to clean state](#resetting-to-a-clean-state).

### `Invalid API Key` (Groq 401)

**Cause:** The worker process is using a cached or outdated Groq key.  
**Fix:**
1. Verify the key in `backend/.env` is correct and starts with `gsk_`
2. Kill all worker processes: `pkill -f "backend.worker"`
3. Start a fresh worker: `make worker`

The Groq client is now created fresh for each activity call, so no restart is needed after updating the key — but an existing process must still be killed if it was started before the fix was deployed.

### `temporal server not running` / worker exits immediately

**Cause:** Worker started before Temporal server.  
**Fix:** Start `temporal server start-dev` first and wait for it to print "server running" before starting the worker.

### Run stays in `active` or `sleeping` forever with no logs

**Cause:** Most likely one of:
- Worker is not running
- Two workers running (one stale, one fresh — Temporal sends tasks to the stale one)
- Groq API call failing (check worker terminal for error logs)

**Check:**
```bash
ps aux | grep "backend.worker" | grep -v grep
cat /tmp/worker.log   # if started with nohup
```

### Memory summary shows static text

**Cause:** All three memory-update attempts failed (main loop, forced call, fallback).  
If you see `"(Memory update failed — check worker logs for errors)"` it means Groq calls are failing. Check the `system` log entries in the Activity Log panel — they contain the raw error message.

### `ForeignKeyViolationError` in worker logs

**Cause:** Temporal's in-memory state has workflow history for run IDs that no longer exist in the DB (e.g. after truncating tables without restarting Temporal). See [reset](#resetting-to-a-clean-state).

---

## Resetting to a clean state

When you need a completely fresh start — clear both the database **and** Temporal's in-memory state together:

```bash
# 1. Kill everything
pkill -f "temporal server"
pkill -f "backend.worker"
pkill -f "uvicorn"
pkill -f "next"

# 2. Wipe the database
python3 -c "
import asyncio
from backend.database.db import AsyncSessionLocal
from sqlalchemy import text

async def clear():
    async with AsyncSessionLocal() as db:
        await db.execute(text('TRUNCATE TABLE activity_log, runs, supervisors RESTART IDENTITY CASCADE'))
        await db.commit()
        print('DB cleared')

asyncio.run(clear())
"

# 3. Seed a fresh default supervisor
python3 -m backend.seed

# 4. Restart everything in order (four separate terminals)
#    Terminal 1:  temporal server start-dev
#    Terminal 2:  make worker
#    Terminal 3:  make api
#    Terminal 4:  make frontend
```

**Why both must be reset together:** `temporal server start-dev` stores all workflow history in memory. If you wipe the database but leave Temporal running, Temporal will replay stale workflows against run IDs that no longer exist, producing FK violations on every activity attempt. Resetting both simultaneously keeps them in sync.

---

## Known limitations

1. **Tools don't do real work** — `message_customer` writes a log entry, not an email. Wiring to real APIs (SendGrid, Twilio, Slack) is the next step.

2. **No authentication** — the API has no auth. Anyone with network access can read and modify all runs.

3. **`temporal server start-dev` is in-memory** — all workflow state is lost when the process stops. Use Temporal Cloud or a properly persisted deployment for anything beyond local testing.

4. **Single Temporal namespace** — all orders share one namespace and task queue. In production you would namespace by tenant.

5. **Memory depends on the LLM** — the rolling summary is generated by the model. The forced-call mechanism guarantees *something* is written, but the quality depends on the model's output.

6. **No retry policy on activities** — `start_to_close_timeout` is set but no explicit `retry_policy`. The Temporal default is up to 10 retries with exponential backoff, but permanent failures (e.g. invalid Groq key) will exhaust all retries and fail the workflow.

7. **`init_db()` on startup** — convenient for dev but dangerous if multiple replicas start simultaneously. Use Alembic migrations only in production.

8. **No deduplication on events** — the same event can be signalled multiple times and will be processed multiple times.

---

## Production considerations

| Concern | POC approach | Production approach |
|---|---|---|
| **Temporal persistence** | `start-dev` (in-memory, lost on restart) | Temporal Cloud or self-hosted with PostgreSQL backend |
| **Authentication** | None | JWT on FastAPI; Temporal mTLS between worker and server |
| **Tool execution** | Writes to DB only | Real API calls: SendGrid, Twilio, Slack, internal REST |
| **Event idempotency** | Events appended on every signal | Deduplicate by event ID before signalling |
| **Memory quality** | Plain text rolling summary | Structured JSON + vector search for semantic recall |
| **Worker scaling** | Single worker process | Multiple worker replicas; separate task queues per tenant |
| **History size** | `continue_as_new` at 100 log entries | Use Temporal history size metrics; trigger earlier |
| **DB migrations** | `init_db()` creates tables on startup | Alembic only; remove `init_db()` |
| **Model selection** | Fixed per supervisor config | Dynamic routing by event severity (e.g., GPT-4 for critical events) |
| **Observability** | Activity log in DB | OpenTelemetry traces → Jaeger/Datadog; Temporal metrics dashboard |
| **Wake interval** | 2 minutes (dev default) | Configurable per supervisor; production orders may use 30–60 min |
| **Multi-tenancy** | One namespace, all orders shared | Namespace per tenant; per-tenant task queues and worker pools |
