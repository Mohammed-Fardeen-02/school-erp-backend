# Event Handlers Directory

This directory hosts asynchronous domain event subscribers and handlers.

## Guidelines

1. **Decoupling**: Handlers in this folder subscribe to events published by domain services (e.g. `eventBus.subscribe(DomainEvent.STUDENT_ENROLLED, handler)`).
2. **Idempotence**: All handlers must be idempotent to prevent duplicate processing on retries or replay.
3. **Error Handling**: Handlers must log failures and, when appropriate, delegate background retry workloads to BullMQ workers instead of blocking in-memory event loops.
