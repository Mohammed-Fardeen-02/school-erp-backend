# Job Schedulers (`src/jobs/schedulers/`)

Hosts cron schedule definitions and recurring task dispatchers.

## Responsibilities

- Configure repeatable jobs (e.g. daily attendance summaries, monthly fee generation, end-of-term report generation).
- Guarantee single-instance execution in multi-container deployments using Redis locks.
