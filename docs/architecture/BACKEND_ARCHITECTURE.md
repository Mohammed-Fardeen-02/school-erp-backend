# School ERP Backend Architecture Overview

## 1. Architectural Philosophy: The Modular Monolith

The School ERP backend is architected as a **Modular Monolith**.

A modular monolith combines the deployment, testing, and operational simplicity of a unified codebase with the rigorous logical separation, domain boundaries, and maintainability of microservices.

### Why Modular Monolith for School ERP?

1. **Domain Complexity over Scale Initially**: School ERP spans over 25 distinct business domains (Admissions, Academics, Grading, Fees, Inventory, Payroll, etc.) that share complex relational boundaries (e.g. a Student links to Class, Guardian, Attendance, Fee Invoice, Exam Results, and Transport). Breaking this prematurely into 25 microservices creates catastrophic distributed transaction latency, partial failure states, and devops overhead.
2. **Unified Data Integrity**: Relational integrity and ACID transactions are critical when processing financial records (fee payments, invoices) and academic promotions.
3. **Painless Future Decomposition**: Because each domain module enforces strict isolation (internal repository, private services, explicit public contracts, domain events), any high-scale module (such as Notifications, Biometric Attendance, or Exam Results) can be seamlessly extracted into a standalone microservice later without architectural refactoring.

---

## 2. Layered Architecture Pattern

Within every business module and across the core framework, the application enforces a strict unidirectional layered flow:

```
┌────────────────────────────────────────────────────────┐
│                   HTTP / Transport                     │
│  (Express Router, Controller, Zod Request Validation)  │
└──────────────────────────┬─────────────────────────────┘
                           │ Invokes DTOs
                           ▼
┌────────────────────────────────────────────────────────┐
│                   Application Service                  │
│  (Business Rules, Domain Logic, Orchestration, Events) │
└─────────────┬────────────────────────────┬─────────────┘
              │ Direct DB access           │ Emits Async
              ▼                            ▼
┌───────────────────────────┐  ┌─────────────────────────┐
│     Module Repository     │  │    Domain Event Bus     │
│   (Prisma Query Isolation)│  │ (Async Decoupled Hooks) │
└─────────────┬─────────────┘  └─────────────────────────┘
              │ SQL queries
              ▼
┌────────────────────────────────────────────────────────┐
│              PostgreSQL Database Engine                │
└────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

1. **HTTP / Transport Layer (`*.routes.ts`, `*.controller.ts`)**:
   - Thin, dumb controllers.
   - Extracts validated parameters from `req.body`, `req.query`, and `req.params`.
   - Delegates business execution to domain services.
   - Converts service returns to standard JSON HTTP envelopes using `ResponseHelper`.
   - Never contains SQL queries or raw Prisma calls.

2. **Validation Layer (`*.validation.ts`)**:
   - Executes at API boundaries before controllers execute.
   - Powered by Zod schemas.
   - Prevents unvalidated data from entering the application memory.

3. **Application Service Layer (`*.service.ts`)**:
   - Contains pure business logic and workflow rules.
   - Coordinates repository calls and cross-module public service contracts.
   - Publishes domain events to `eventBus` for asynchronous background side-effects.
   - Enforces authorization constraints and tenant scoping invariants.

4. **Data Access Layer (`*.repository.ts`)**:
   - Encapsulates database querying, Prisma models, transaction blocks, and indexing hints.
   - Returns typed domain entities or plain data structures.
   - Never leaks Prisma query builders into controllers or external modules.

5. **Infrastructure & Shared Layers (`core/`, `shared/`, `integrations/`)**:
   - `core/`: Application runtime infrastructure (logging, error handling, auth middleware, database client).
   - `shared/`: Domain-agnostic reusable helpers, common validators, and enums.
   - `integrations/`: Third-party adapter clients (Email, SMS, Payment Gateway, Object Storage).

---

## 3. Multi-School Multi-Tenant Architecture

The system is designed for multi-school enterprise deployments with strict logical tenant isolation.

### Tenant Isolation Model

- **Shared Database, Shared Schema with Tenant Scoping**: All schools share the PostgreSQL database instance with data segregation enforced by strict `school_id` foreign keys and application-level scoping middleware.
- **Tenant Context (`req.schoolId`)**: Populated through authenticated JWT claims and validated against incoming route parameters or headers.
- **Tenant Scope Middleware (`requireTenantScope`)**: Rejects any request attempting to access or mutate records belonging to a different `school_id`.
- **Global vs Scoped Entities**:
  - _School-Scoped_: Students, Classes, Fees, Timetables, Staff, Attendance, Invoices, Exams.
  - _Platform-Global_: System Users, Super Admins, Global System Roles, Platform Audit Logs.

---

## 4. Communication Contracts Between Modules

To prevent the monolith from devolving into a "Big Ball of Mud", inter-module communication is governed by two strict rules:

### 1. Synchronous Queries: Public Service Interface Only

A module needing information from another module MUST NOT query the other module's repository directly. It must import the other module's public service contract:

- _Allowed_: `FeesService` calling `StudentService.getStudentSummary(studentId, schoolId)`.
- _Prohibited_: `FeesService` importing `StudentRepository` or running `prisma.student.findUnique(...)`.

### 2. Asynchronous Side-Effects: Domain Events (`eventBus`)

Workflows that produce side-effects across independent domains should be decoupled via domain events:

- When a student application is approved in `admissions`, the admissions service emits `DomainEvent.STUDENT_ENROLLED`.
- The `notifications` module listens to `STUDENT_ENROLLED` and queues a welcome SMS to parents.
- The `fees` module listens to `STUDENT_ENROLLED` and generates the admission fee ledger item.
- Neither `admissions` nor `fees` directly couple to each other's codebase.

---

## 5. Scalability and Asynchronous Job Processing

- **Stateless App Nodes**: Express instances are strictly stateless; authentication relies on cryptographically signed JWTs and database/Redis refresh tokens.
- **BullMQ and Redis**: Long-running computational tasks (bulk report card PDF generation, email/SMS blasts, timetable auto-generation) are offloaded to Redis-backed BullMQ workers, ensuring HTTP request/response loops remain sub-100ms.
- **Database Connection Pooling**: Prisma manages connection pooling with PostgreSQL; connection parameters are configured through environment variables.
