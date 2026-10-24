# Architecture Decision Log & Changelog

All major architectural decisions, foundational shifts, and structural conventions must be recorded in this document following an Architecture Decision Record (ADR) format.

---

## [ADR-001] Initial Backend Architecture: Modular Monolith

- **Date**: 2026-10-24
- **Status**: Accepted & Implemented
- **Architect**: Senior Backend Architect & Technical Lead

### Context & Problem Statement

The School ERP system needs to support multi-school tenant operations across 25+ complex business domains (Admissions, Students, Academics, Grading, Fees, Inventory, Payroll, etc.). We need an architecture that balances developer productivity, data integrity, strict module boundaries, and high testability without the operational overhead of microservices.

### Decision

1. Adopt a **Modular Monolith** architecture implemented in TypeScript and Express.js.
2. Structure business domains into autonomous modules inside `src/modules/` with private repositories, thin controllers, and dedicated services.
3. Centralize application infrastructure in `src/core/` and domain-agnostic helpers in `src/shared/`.
4. Wrap third-party external services in `src/integrations/`.
5. Adopt PostgreSQL as the primary database with Prisma ORM and schema-level multi-tenant indexing.
6. Enforce request validation with Zod at API boundaries.
7. Establish an asynchronous event bus (`src/events/event-bus.ts`) for decoupled inter-module side effects.
8. Enforce security via JWT access/refresh token rotation, RBAC, and tenant scope middleware (`requireTenantScope`).

### Consequences

- **Positive**: Single codebase, straightforward local development and containerization, transactional consistency, clear domain boundaries, testable isolated layers.
- **Negative**: Requires strict discipline to prevent cross-module repository imports (enforced via `docs/architecture/MODULE_BOUNDARIES.md` and `AGENTS.md`).

---

## Process for Documenting Future Architectural Decisions

When proposing an architectural change (e.g. adding a new top-level layer, integrating a new message broker, or changing database strategy):

1. Submit an RFC (Request for Comments) outlining the motivation, alternatives considered, and impact.
2. Once approved by the Technical Lead, append a new numbered entry to this file (`[ADR-00X]`).
3. Update `docs/architecture/FOLDER_STRUCTURE.md` and `docs/architecture/MODULE_BOUNDARIES.md` accordingly.
