.PHONY: install worker api frontend migrate

install:
	@echo ">>> Installing backend dependencies..."
	pip install -e backend/
	@echo ">>> Installing frontend dependencies..."
	cd frontend && npm install

worker:
	@echo ">>> Starting Temporal worker..."
	python -m backend.worker

api:
	@echo ">>> Starting FastAPI server..."
	uvicorn backend.main:app --reload --port 8000

frontend:
	@echo ">>> Starting Next.js dev server..."
	cd frontend && npm run dev

migrate:
	@echo ">>> Running Alembic migrations..."
	cd backend && alembic upgrade head
