"""
Seed script — creates one default supervisor config if the table is empty.

Usage:
    python -m backend.seed
"""
import asyncio
import logging

from backend.database.crud import create_supervisor, list_supervisors
from backend.database.db import AsyncSessionLocal, init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

_DEFAULT_SUPERVISOR = {
    "name": "Standard Order Supervisor",
    "base_instruction": (
        "You are an AI order supervisor responsible for monitoring the health and progress "
        "of e-commerce orders from placement through delivery.\n\n"
        "Your core responsibilities:\n"
        "1. PAYMENT ISSUES — Escalate payment failures to the payments team immediately. "
        "Do not wait for the next scheduled wake. Create an internal note documenting the "
        "failure and the action taken.\n"
        "2. SHIPPING & LOGISTICS — Notify the logistics team of shipment delays. If a delay "
        "exceeds 48 hours, also message the customer with an honest update and an apology. "
        "Always create an internal note when logistics actions are taken.\n"
        "3. CUSTOMER COMMUNICATION — Message customers only for critical updates: payment "
        "failures requiring their action, significant shipping delays, or successful delivery. "
        "Keep messages concise, professional, and solution-focused.\n"
        "4. FULFILLMENT — Alert the fulfillment team about order holds, missing items, or "
        "packing issues as soon as they are detected.\n"
        "5. INTERNAL NOTES — Create an internal note for every significant decision, even if "
        "no external action is taken. Include your reasoning so the audit trail is complete.\n\n"
        "At each wake cycle, review the order context and recent events, then take the minimum "
        "necessary actions. Avoid duplicate messages — check your memory summary before acting. "
        "Always update your memory summary to reflect what has happened and what is pending."
    ),
    "available_actions": [
        "message_fulfillment_team",
        "message_payments_team",
        "message_logistics_team",
        "message_customer",
        "create_internal_note",
    ],
    "wake_up_interval_minutes": 2,
    "wake_aggressiveness": "moderate",
    "model": "llama-3.3-70b-versatile",
}


async def seed() -> None:
    await init_db()
    async with AsyncSessionLocal() as db:
        existing = await list_supervisors(db)
        if existing:
            logger.info("Supervisors already exist (%d found) — skipping seed.", len(existing))
            return

        supervisor = await create_supervisor(db, _DEFAULT_SUPERVISOR)
        await db.commit()
        logger.info("Created default supervisor: %s (id=%s)", supervisor.name, supervisor.id)


if __name__ == "__main__":
    asyncio.run(seed())
