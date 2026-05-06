import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.runs import router as runs_router
from backend.api.supervisors import router as supervisors_router
from backend.config import settings
from backend.database.db import init_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Order Supervisor API",
    description="AI-powered order supervision via Temporal workflows and Groq.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def on_startup() -> None:
    await init_db()
    logger.info("Database initialized.")
    logger.info("Server started — docs at /docs")


# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

app.include_router(supervisors_router)
app.include_router(runs_router)


# ---------------------------------------------------------------------------
# Root routes
# ---------------------------------------------------------------------------


@app.get("/", tags=["meta"], summary="API root")
async def root():
    return {"message": "Order Supervisor API", "docs": "/docs"}


@app.get("/health", tags=["meta"], summary="Health check")
async def health_check():
    return {"status": "ok", "temporal_host": settings.temporal_host}
