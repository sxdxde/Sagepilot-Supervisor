.PHONY: install worker api frontend migrate seed

install:
	@echo ">>> Installing backend dependencies..."
	pip3 install -e backend/
	@echo ">>> Installing frontend dependencies..."
	cd frontend && npm install

worker:
	@echo ">>> Starting Temporal worker..."
	python3 -m backend.worker

api:
	@echo ">>> Starting FastAPI server..."
	python3 -m uvicorn backend.main:app --reload --port 8000

frontend:
	@echo ">>> Starting Next.js dev server..."
	cd frontend && npm run dev

migrate:
	@echo ">>> Running Alembic migrations..."
	cd backend && alembic upgrade head

seed:
	@echo ">>> Seeding default supervisor config..."
	python3 -m backend.seed

dev:
	@echo ">>> Starting everything at once..."
	npx concurrently -n "TEMPORAL,API,WORKER,FRONTEND" -c "blue,green,yellow,magenta" \
		"temporal server start-dev" \
		"make api" \
		"make worker" \
		"make frontend"
