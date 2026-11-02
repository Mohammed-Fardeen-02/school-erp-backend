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

## [ADR-002] Multi-Schema PostgreSQL Partitioning, Decoupled Session Lifecycle, and Real-Time Token Invalidation

- **Date**: 2026-11-01
- **Status**: Accepted & Implemented (Phase 1)
- **Architect**: Senior Security & Platform Architect

### Context & Problem Statement

The ERP requires true multi-tenant scaling with clean domain isolation, reliable refresh token reuse/theft detection, instant access token invalidation upon password reset, and separation of device sessions from individual rotated tokens.

### Decision

1. Enable PostgreSQL multi-schema partitioning via Prisma `multiSchema` feature (`auth`, `organization`, `platform`, `audit`).
2. Separate device sessions (`auth.sessions`) from refresh token rotation chains (`auth.refresh_tokens`). On token replay, terminate the entire `familyId`.
3. Introduce `tokenVersion` on `auth.users` validated in real time by `authenticate` middleware, allowing instantaneous invalidation of access tokens across all devices on password changes or administrative lockouts.
4. Adopt Argon2id (OWASP recommended parameters) for password hashing with transparent backward compatibility.
5. Provide dedicated endpoints for session inspection and remote revocation (`/auth/sessions`).
6. Apply atomic database updates for failed login tracking to prevent race conditions during concurrent brute-force attacks.

### Consequences

- **Positive**: Zero risk of refresh token replay attacks going undetected; instantaneous access token revocation without waiting for 15-minute expiration; multi-schema isolation; OWASP-compliant password security.
- **Negative**: Requires database query or Redis cache check during access token authentication to verify `tokenVersion`.

---

## Process for Documenting Future Architectural Decisions

When proposing an architectural change (e.g. adding a new top-level layer, integrating a new message broker, or changing database strategy):

1. Submit an RFC (Request for Comments) outlining the motivation, alternatives considered, and impact.
2. Once approved by the Technical Lead, append a new numbered entry to this file (`[ADR-00X]`).
3. Update `docs/architecture/FOLDER_STRUCTURE.md` and `docs/architecture/MODULE_BOUNDARIES.md` accordingly.
