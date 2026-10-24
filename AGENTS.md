# Mandatory Instructions for AI Coding Agents & LLMs

**Applies to**: Antigravity, GitHub Copilot, Claude, Cursor, and all automated coding agents working in this repository.

You are acting on an enterprise-grade School ERP codebase designed as a **Modular Monolith**. You must adhere strictly to established architectural boundaries, coding standards, and safety guidelines.

---

## The 10 Core Directives for AI Agents

1. **Mandatory Documentation Inspection First**:
   - Before creating, moving, or refactoring files, read [`docs/architecture/FOLDER_STRUCTURE.md`](docs/architecture/FOLDER_STRUCTURE.md).
   - Before implementing a new module or editing cross-module logic, read [`docs/architecture/MODULE_BOUNDARIES.md`](docs/architecture/MODULE_BOUNDARIES.md) and [`docs/architecture/CODING_STANDARDS.md`](docs/architecture/CODING_STANDARDS.md).
2. **Strict Module Boundary Enforcement**:
   - Each business module owns its logic and data access.
   - Controllers must never query repositories or Prisma directly.
   - A module must NEVER import another module's private repository or internal classes. Cross-module communication must use explicitly exposed services or asynchronous domain events (`eventBus`).
3. **Reuse Infrastructure & Shared Code**:
   - Never create duplicate utility functions or parallel error handling systems.
   - Use `src/core/errors/app-error.ts` and `ErrorCode` for errors.
   - Use `src/core/http/response.ts` (`ResponseHelper`) for API responses.
   - Use `src/core/logger/app-logger.ts` for logging.
   - Use `src/shared/validators/index.ts` for common Zod validations.
4. **Follow Strict Conventions**:
   - Maintain `kebab-case.<role>.ts` file naming.
   - Validate all API inputs via Zod schemas at route boundaries.
   - Enforce TypeScript strictness with zero unjustified `any`.
5. **Enforce Tenant Isolation**:
   - For all school-scoped entities, always enforce `schoolId` scoping in queries, routes, and services using `requireTenantScope()`.
   - Never query tenant-owned models by primary key alone.
6. **No Arbitrary Architecture Changes**:
   - Never introduce new top-level directories under `src/` or change architectural boundaries without explicit approval and documentation.
   - Do not prematurely split the monolith into microservices or introduce unnecessary design patterns (e.g. fake microservice brokers, unnecessary factories).
7. **Keep Documentation in Sync**:
   - Whenever you implement a new module, update `src/modules/<name>/README.md` and `docs/api/README.md`.
   - Whenever an architectural rule or structure is altered, update `docs/architecture/ARCHITECTURE_CHANGELOG.md`.
8. **Follow the 11-Step Future Module Creation Standard**:
   - Follow the step-by-step procedure detailed in [`docs/development/CONTRIBUTING.md`](docs/development/CONTRIBUTING.md) when generating any new ERP domain module.
9. **No Silent Rule Bypassing**:
   - Never disable lint rules, silence typecheck errors, bypass authentication, or bypass tenant isolation just to complete a task faster.
10. **Report Architectural Conflicts Proactively**:

- If you encounter existing code that conflicts with the documented architecture, report the discrepancy clearly before making structural changes.

---

## Mandatory Verification Commands

Before concluding any code generation, refactoring, or feature implementation, you MUST run:

```bash
npm run format      # Prettier formatting check
npm run lint        # ESLint analysis
npm run typecheck   # Strict TypeScript compilation check (tsc --noEmit)
npm run test        # Vitest test suite execution
npm run build       # Production build validation
```

All five commands must exit with code 0. Fix any errors or regressions caused by your changes immediately.
