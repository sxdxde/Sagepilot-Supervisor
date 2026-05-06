"""
Temporal client singleton.

Call ``get_temporal_client()`` from FastAPI route handlers or anywhere outside
a Temporal worker context to obtain a shared, lazily-initialised client.

The client is safe to share across async tasks — the Temporal Python SDK
client is internally thread/task-safe.
"""
from __future__ import annotations

import asyncio
import logging

from temporalio.client import Client

from backend.config import settings

logger = logging.getLogger(__name__)

# Module-level cache — None until first call to get_temporal_client().
_client: Client | None = None
_client_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    """Return the module-level lock, creating it lazily inside the running loop."""
    global _client_lock
    if _client_lock is None:
        _client_lock = asyncio.Lock()
    return _client_lock


async def get_temporal_client() -> Client:
    """
    Return a cached Temporal ``Client``, connecting on the first call.

    Subsequent calls return the same instance without re-connecting.
    Thread-safe via an ``asyncio.Lock`` so concurrent startup tasks
    don't race to create two connections.
    """
    global _client

    # Fast path — already connected.
    if _client is not None:
        return _client

    async with _get_lock():
        # Re-check inside the lock in case another coroutine connected first.
        if _client is not None:
            return _client

        logger.info(
            "Connecting to Temporal at %s (namespace: %s)",
            settings.temporal_host,
            settings.temporal_namespace,
        )
        _client = await Client.connect(
            settings.temporal_host,
            namespace=settings.temporal_namespace,
        )
        logger.info("Temporal client connected.")

    return _client


async def close_temporal_client() -> None:
    """
    Close the cached client and clear the singleton.

    Call this during application shutdown (e.g. FastAPI ``lifespan`` teardown).
    """
    global _client
    if _client is not None:
        # The Temporal Python SDK Client does not expose an explicit close()
        # method — connections are managed by gRPC internally.  Clearing the
        # reference allows the connection to be GC'd.
        _client = None
        logger.info("Temporal client reference cleared.")
