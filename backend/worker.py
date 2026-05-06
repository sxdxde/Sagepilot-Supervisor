import asyncio
import logging

from temporalio.client import Client
from temporalio.worker import Worker

from backend.config import settings
from backend.temporal.activities import (
    classify_event_activity,
    generate_final_output_activity,
    log_activity_activity,
    run_agent_activity,
    update_run_status_activity,
)
from backend.temporal.workflows import OrderSupervisorWorkflow

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def main():
    client = await Client.connect(
        settings.temporal_host,
        namespace=settings.temporal_namespace,
    )

    worker = Worker(
        client,
        task_queue=settings.task_queue,
        workflows=[OrderSupervisorWorkflow],
        activities=[
            update_run_status_activity,
            log_activity_activity,
            run_agent_activity,
            classify_event_activity,
            generate_final_output_activity,
        ],
    )

    logger.info(
        "Starting worker on task queue '%s' (namespace: %s)",
        settings.task_queue,
        settings.temporal_namespace,
    )
    await worker.run()


if __name__ == "__main__":
    asyncio.run(main())
