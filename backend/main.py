import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
# CORS — must be added BEFORE routers
# ---------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers — imported after middleware so CORS applies to all routes
# ---------------------------------------------------------------------------

from backend.api.runs import router as runs_router  # noqa: E402
from backend.api.supervisors import router as supervisors_router  # noqa: E402

app.include_router(supervisors_router)
app.include_router(runs_router)


# ---------------------------------------------------------------------------
# Startup
# ---------------------------------------------------------------------------


@app.on_event("startup")
async def on_startup() -> None:
    # 1. Create DB tables if they don't exist.
    await init_db()
    logger.info("Database initialized.")

    # 2. Pre-warm the Temporal client so the first request isn't slow.
    #    Errors here are logged but don't prevent the API from starting —
    #    individual endpoints will retry the connection when needed.
    try:
        from backend.temporal.client import get_temporal_client
        await get_temporal_client()
        logger.info("Temporal client connected to %s", settings.temporal_host)
    except Exception as exc:
        logger.warning("Could not pre-connect Temporal client: %s", exc)

    logger.info("Server started — docs at /docs")


# ---------------------------------------------------------------------------
# Root routes
# ---------------------------------------------------------------------------


@app.get("/", tags=["meta"], summary="API root")
async def root():
    return {"message": "Order Supervisor API", "docs": "/docs"}


@app.get("/health", tags=["meta"], summary="Health check")
async def health_check():
    return {"status": "ok", "temporal_host": settings.temporal_host}
