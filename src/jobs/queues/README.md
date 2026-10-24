# Job Queues (`src/jobs/queues/`)

Hosts BullMQ queue definitions and queue connection configurations.

## Responsibilities

- Define Redis-backed queues (e.g. `emailQueue`, `reportGenerationQueue`, `feeReminderQueue`).
- Centralize default retry options, backoff strategies, and dead-letter queue bindings.
- Introduce actual queue definitions only when background asynchronous processing is implemented for a domain.
