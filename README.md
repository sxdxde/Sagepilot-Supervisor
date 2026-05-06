# Order Supervisor

A monorepo containing the **backend** (FastAPI + Temporal + PostgreSQL) and **frontend** (Next.js 14) for the Order Supervisor application.

## Project Structure

```
order-supervisor/
├── backend/
│   ├── api/          # FastAPI route handlers
│   ├── database/     # SQLAlchemy models & Alembic migrations
│   ├── temporal/     # Temporal workflows & activities
│   ├── config.py     # Pydantic-settings configuration
│   ├── main.py       # FastAPI application
│   └── worker.py     # Temporal worker entrypoint
├── frontend/         # Next.js 14 (App Router, TypeScript, Tailwind)
├── Makefile
└── .gitignore
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- A running Temporal server (`temporal server start-dev`)
- A PostgreSQL database (e.g. Supabase)

## Quick Start

### 1. Install dependencies

```bash
make install
```

### 2. Configure environment variables

```bash
cp backend/.env.example backend/.env
# Fill in DATABASE_URL, GROQ_API_KEY, etc.

cp frontend/.env.example frontend/.env.local
# Set NEXT_PUBLIC_API_URL if needed
```

### 3. Run database migrations

```bash
make migrate
```

### 4. Start services

```bash
# In separate terminals:
make api       # FastAPI on http://localhost:8000
make worker    # Temporal worker
make frontend  # Next.js on http://localhost:3000
```

## Available Make Commands

| Command         | Description                                  |
|-----------------|----------------------------------------------|
| `make install`  | Install backend (pip) and frontend (npm) deps |
| `make api`      | Run FastAPI with uvicorn (hot-reload)         |
| `make worker`   | Run the Temporal worker                       |
| `make frontend` | Run the Next.js dev server                   |
| `make migrate`  | Run Alembic database migrations               |
