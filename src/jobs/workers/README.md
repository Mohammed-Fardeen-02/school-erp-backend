# Job Workers (`src/jobs/workers/`)

Hosts background task processors consuming jobs from BullMQ queues.

## Responsibilities

- Process background jobs (e.g. sending bulk SMS/emails, processing uploaded Excel files, rendering PDF report cards).
- Maintain worker lifecycle and graceful shutdown hooks.
