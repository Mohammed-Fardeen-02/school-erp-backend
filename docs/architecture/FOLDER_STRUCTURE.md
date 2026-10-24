# Backend Folder Structure Reference

This document serves as the authoritative, definitive reference for the backend directory layout, code placement, layer responsibilities, and structural boundaries.

---

## 1. Root-Level Directories

```text
erp-backend/
├── .github/          # CI/CD workflows and automated repository checks
├── docs/             # Technical architecture, conventions, and operational guides
│   ├── architecture/ # Architectural standards and decision records
│   ├── api/          # API specifications and endpoint guides
│   └── development/  # Local setup, environment config, and contribution guides
├── prisma/           # Database schema, migration history, and baseline seed scripts
├── scripts/          # Operational, migration, and automation shell/node scripts
├── src/              # Application source code
├── Dockerfile        # Multi-stage production container specification
├── docker-compose.yml# Local container setup (PostgreSQL, Redis, App)
├── package.json      # Dependencies and execution scripts
├── tsconfig.json     # Strict TypeScript compiler options
├── vitest.config.ts  # Test runner configuration
├── eslint.config.js  # Linter configuration
├── .prettierrc       # Code formatter settings
├── .editorconfig     # Cross-editor formatting consistency
├── .env.example      # Safe template of environment variables
├── AGENTS.md         # Mandatory instruction rules for AI coding agents
└── README.md         # Main project documentation and quickstart
```

---

## 2. Source Code Directories (`src/`)

```text
src/
├── app.ts            # Express application creation, middleware pipeline, global handlers
├── server.ts         # HTTP listener, port binding, and graceful shutdown lifecycle
├── config/           # Validated environment configuration and runtime constants
├── core/             # Framework plumbing, middleware, base errors, and HTTP helpers
├── shared/           # Domain-agnostic utility functions, general enums, common types
├── modules/          # Business domain modules (Modular Monolith boundaries)
├── integrations/     # Adapters and SDK wrappers for external third-party services
├── jobs/             # BullMQ background queues, scheduled tasks, and worker processors
├── events/           # Application domain events, event bus, and event subscribers
├── routes/           # Central API route registration and system endpoints
└── tests/            # Test suite setup, integration tests, e2e tests, fixtures
```

---

## 3. Layer Responsibilities & Distinction Matrix

| Layer               | Responsibility                                                                                  | Examples                                                             | Prohibited                                                     |
| :------------------ | :---------------------------------------------------------------------------------------------- | :------------------------------------------------------------------- | :------------------------------------------------------------- |
| **`config/`**       | Validating environment variables, reading `.env`, exposing static constants.                    | `env.ts`, `database.ts`, `constants.ts`                              | Business logic, direct database queries.                       |
| **`core/`**         | Application infrastructure plumbing, Express middleware, base error classes, response builders. | `prisma-client.ts`, `authenticate.ts`, `app-error.ts`, `response.ts` | Business domain rules (e.g. no student enrollment logic).      |
| **`shared/`**       | Domain-agnostic reusable helpers, shared types, general enums, common Zod schemas.              | `slugify()`, `uuidSchema`, `paginationQuerySchema`                   | Framework-specific Express middleware, direct database access. |
| **`modules/`**      | Business domains owning their own routes, controllers, services, repositories, and models.      | `students/`, `fees/`, `attendance/`, `admissions/`                   | Importing another module's repository directly.                |
| **`integrations/`** | Adapters wrapping external vendor APIs and SDKs behind uniform interfaces.                      | `email/`, `sms/`, `payment-gateway/`, `file-storage/`                | ERP domain business logic; leaking vendor SDKs into modules.   |
| **`jobs/`**         | BullMQ background queue definitions, worker processors, and scheduled tasks.                    | `queues/`, `workers/`, `schedulers/`                                 | Synchronous HTTP handling; holding open HTTP request cycles.   |
| **`events/`**       | Decoupled cross-module domain event definitions and in-memory event bus.                        | `event-bus.ts`, `event-types.ts`                                     | Direct synchronous RPC-style coupled calls.                    |
| **`routes/`**       | Central router mount-point aggregating system routes and module routers.                        | `index.ts`, `health.routes.ts`                                       | Inlining business logic inside route callbacks.                |
| **`tests/`**        | Test setup, shared mocks, global test fixtures, integration & e2e suites.                       | `setup.ts`, `integration/health.test.ts`                             | Production application exports.                                |

### Critical Distinction: `core/` vs `shared/`

- **`core/`** is tightly coupled to the application runtime and framework infrastructure (Express, Pino, Prisma Client, JWT tokens, HTTP response objects). It cannot be extracted to a frontend or generic library without bringing along Node.js/Express infrastructure.
- **`shared/`** is purely functional, domain-agnostic, and framework-free. It contains pure utilities (string manipulation, dates, basic types, common validations).

### Critical Distinction: `modules/` vs `integrations/`

- **`modules/`** represent **internal business domains** of the School ERP (e.g. `students`, `admissions`, `fees`, `attendance`). They contain business rules, persist state to the core PostgreSQL database, and enforce school tenant isolation.
- **`integrations/`** represent **external third-party providers** (e.g. Stripe, AWS S3, Twilio, SendGrid). They wrap third-party SDKs, handle vendor authentication, and map external vendor responses to internal application interfaces.

---

## 4. Business Module Anatomy

Each business domain resides inside `src/modules/<module-name>/`.

### Standard Module Structure (e.g., `students/`)

```text
students/
├── students.routes.ts       # Express router definitions and route-level middleware
├── students.controller.ts   # HTTP controller mapping requests to service calls
├── students.service.ts      # Pure business rules, validations, and workflow orchestration
├── students.repository.ts   # Database queries (Prisma) and data access encapsulation
├── students.validation.ts   # Zod request validation schemas (body, query, params)
├── students.types.ts        # Domain-specific DTOs, parameters, and internal types
├── students.mapper.ts       # Mappers converting DB entities to client response DTOs
├── students.constants.ts    # Domain-specific constants (status lists, limits)
└── students.test.ts         # Module unit and integration tests
```

### Organizing Small vs. Large Modules

- **Small Modules** (e.g. `branches`, `academic-years`): Keep flat files directly within `src/modules/<name>/`. Do not introduce subdirectories until file size or feature complexity requires it.
- **Large Modules** (e.g. `fees`, `examinations`, `students`): When a module handles complex sub-workflows (e.g., fees having invoices, receipts, waivers, and discounts), organize into explicit subdirectories:
  ```text
  fees/
  ├── controllers/
  │   ├── invoices.controller.ts
  │   └── payments.controller.ts
  ├── services/
  │   ├── invoices.service.ts
  │   └── waivers.service.ts
  ├── repositories/
  │   └── fees.repository.ts
  ├── schemas/
  │   └── fees.validation.ts
  ├── dto/
  │   └── fees.dto.ts
  └── __tests__/
      ├── invoices.test.ts
      └── payments.test.ts
  ```

---

## 5. Naming Conventions

Consistency across files, functions, and symbols is mandatory:

| Item                    | Convention             | Example                                         |
| :---------------------- | :--------------------- | :---------------------------------------------- |
| **Directory names**     | `kebab-case`           | `academic-years/`, `classes-sections/`          |
| **File names**          | `kebab-case.<type>.ts` | `students.service.ts`, `health.routes.ts`       |
| **Classes**             | `PascalCase`           | `StudentsService`, `AppError`, `ResponseHelper` |
| **Interfaces & Types**  | `PascalCase`           | `AuthenticatedUser`, `CreateStudentDto`         |
| **Functions & Methods** | `camelCase`            | `findStudentById()`, `calculateGradePoint()`    |
| **Variables**           | `camelCase`            | `studentList`, `activeSession`                  |
| **Constants & Enums**   | `UPPER_SNAKE_CASE`     | `DEFAULT_PAGE_SIZE`, `UserStatus.ACTIVE`        |
| **Database Tables**     | `snake_case` (plural)  | `students`, `audit_logs`, `fee_invoices`        |
| **Database Columns**    | `snake_case`           | `school_id`, `created_at`, `first_name`         |

---

## 6. Import Rules & Dependency Restrictions

To enforce the architecture automatically and prevent circular dependencies:

### Allowed Imports:

- `modules/*` may import from `core/*`, `shared/*`, `config/*`, `events/*`.
- `modules/*` may import from another module's **public service** or **exported types only**.
- `integrations/*` may import from `core/errors`, `core/logger`, `config/*`, `shared/*`.
- `jobs/*` may import from `modules/*` services, `core/*`, `config/*`.

### Strictly Prohibited Imports:

- ❌ **Controllers importing Repositories**: Controllers must NEVER import or invoke repository methods.
- ❌ **Controllers querying Prisma**: Controllers must NEVER import `prisma` directly.
- ❌ **Module A importing Module B's Repository**: `fees.service.ts` must never import `students.repository.ts`.
- ❌ **Core importing Modules**: `core/*` must NEVER import anything from `modules/*`.
- ❌ **Shared importing Core or Modules**: `shared/*` must remain self-contained.
- ❌ **Circular Dependencies**: Module A importing Module B while Module B imports Module A. Use domain events to break the cycle.

---

## 7. Examples of Correct vs Incorrect File Placement

### Scenario 1: Reusable Date Formatter

- ❌ **Incorrect**: `src/modules/students/format-date.ts`
- ✅ **Correct**: `src/shared/utils/date.util.ts` or `src/shared/helpers/index.ts`

### Scenario 2: Sending a Welcome Email on Student Enrollment

- ❌ **Incorrect**: Calling AWS SES SDK directly inside `students.controller.ts`.
- ❌ **Incorrect**: Instantiating Nodemailer inside `students.service.ts`.
- ✅ **Correct**: `students.service.ts` publishes `DomainEvent.STUDENT_ENROLLED`. An event handler in `src/events/handlers/` or `src/modules/notifications/` intercepts this and queues a job to `src/jobs/queues/email.queue.ts`, which uses `src/integrations/email/`.

### Scenario 3: Checking if a User has Permission to Edit Fees

- ❌ **Incorrect**: Querying permissions table manually inside `fees.controller.ts`.
- ✅ **Correct**: Attaching `authorizePermissions('fees:update')` middleware from `src/core/middleware/authorize.ts` to `fees.routes.ts`.

---

## 8. Developer Pull Request Checklist

Before submitting any code change or adding a new file, verify:

- [ ] File is placed in the correct directory per this document.
- [ ] File follows the naming convention (`kebab-case.<role>.ts`).
- [ ] All input data from HTTP requests is validated via Zod schemas.
- [ ] Controller contains zero SQL queries or business rules; all business logic is in the service.
- [ ] Module repositories do not leak Prisma internals to other modules.
- [ ] Multi-tenant scoping (`school_id`) is strictly enforced on tenant-owned entities.
- [ ] All errors use `AppError` with standard `ErrorCode`.
- [ ] Sensitive data (passwords, tokens) is not logged in console or Pino.
- [ ] Unit or integration tests cover the new logic.
- [ ] `npm run lint`, `npm run typecheck`, and `npm run test` pass with zero errors.
