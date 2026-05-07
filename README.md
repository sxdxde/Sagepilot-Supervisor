# Order Supervisor

A long-running AI supervisor built with **Temporal**, **FastAPI**, and **Next.js**.

Each order gets its own persistent Temporal workflow that sleeps between wake cycles, wakes on external events, calls a Groq-powered agent to reason and act, and completes when the order reaches a terminal state.

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Python | 3.11+ | |
| Node.js | 18+ | |
| Temporal CLI | latest | `brew install temporal` |
| PostgreSQL | any | Supabase free tier works |
| Groq API key | — | [console.groq.com](https://console.groq.com) — free |

---

## Setup

### Step 1 — Start Temporal

```bash
temporal server start-dev
```

Leave this running. The Temporal UI will be available at `http://localhost:8233`.

### Step 2 — Backend

```bash
cd backend
cp .env.example .env
# Edit .env — fill in DATABASE_URL and GROQ_API_KEY
pip install -e .
alembic upgrade head
```

### Step 3 — Frontend

```bash
cd frontend
cp .env.example .env.local
npm install
```

### Step 4 — Run everything (3 separate terminals)

```bash
# Terminal 1 — Temporal worker (processes workflows + activities)
make worker

# Terminal 2 — FastAPI backend
make api

# Terminal 3 — Next.js frontend
make frontend
```

Visit **http://localhost:3000**

---

## Quick Start

1. Go to `http://localhost:3000`
2. Click **New Supervisor** → create a supervisor config (name, base instruction, wake aggressiveness)
3. Click **New Run** → select your supervisor and fill in order details
4. On the run detail page, use the **Send Event** dropdown to inject events
5. Watch the agent wake up, reason, and take actions in the **Activity Log**
6. Inject a `delivered` event to complete the workflow

---

## Available Make Commands

| Command | What it does |
|---|---|
| `make install` | Install backend (pip) and frontend (npm) dependencies |
| `make api` | Run FastAPI with uvicorn hot-reload on port 8000 |
| `make worker` | Run the Temporal worker |
| `make frontend` | Run the Next.js dev server on port 3000 |
| `make migrate` | Run `alembic upgrade head` inside `backend/` |

---

## Project Structure

```
order-supervisor/
├── backend/
│   ├── api/
│   │   ├── runs.py          # Run lifecycle endpoints
│   │   ├── supervisors.py   # Supervisor CRUD
│   │   └── schemas.py       # Pydantic request/response models
│   ├── database/
│   │   ├── models.py        # SQLAlchemy ORM models
│   │   ├── db.py            # Async engine, session, init_db()
│   │   └── crud.py          # Async CRUD + serialize_model()
│   ├── temporal/
│   │   ├── workflows.py     # OrderSupervisorWorkflow
│   │   ├── activities.py    # run_agent, classify_event, etc.
│   │   └── client.py        # Singleton Temporal client
│   ├── config.py            # Pydantic-settings env vars
│   ├── main.py              # FastAPI app
│   └── worker.py            # Temporal worker entrypoint
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  # Dashboard
│   │   ├── supervisors/new/page.tsx  # Create supervisor form
│   │   └── runs/
│   │       ├── new/page.tsx          # Create run form
│   │       └── [id]/page.tsx         # Run detail + live controls
│   └── lib/api.ts                    # Typed API client
├── Makefile
└── .gitignore
```

---

## Environment Variables

### `backend/.env`

```env
DATABASE_URL=postgresql+asyncpg://postgres:PASSWORD@db.xxxx.supabase.co:5432/postgres
GROQ_API_KEY=gsk_xxxx
TEMPORAL_HOST=localhost:7233
TEMPORAL_NAMESPACE=default
TASK_QUEUE=order-supervisor
```

### `frontend/.env.local`

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```
# Sagepilot-Supervisor
