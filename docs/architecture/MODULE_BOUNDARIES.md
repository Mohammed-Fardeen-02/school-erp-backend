# Module Boundary & Inter-Module Interaction Rules

This document establishes enforceable boundary rules governing dependencies, data access, cross-module communication, and transactions within the Modular Monolith.

---

## 1. Domain Ownership Principles

1. **Autonomous Domain Ownership**: Each business module (e.g. `students`, `fees`, `attendance`) is the sole custodian of its domain invariants, database queries, and business rules.
2. **Encapsulation**: Internal module details (such as database query structures, internal DTOs, and private helper functions) must remain unexposed to other modules.
3. **Single Database with Logical Separation**: All modules share the primary PostgreSQL instance. We do NOT maintain multiple physical databases or microservices per module. Logical boundaries are enforced through TypeScript module exports and interface contracts.

---

## 2. The Repository Access Rule

- **Controllers Must Never Query Repositories Directly**: Controllers exist only to handle HTTP transport details (extract request params, invoke service, return response).
- **Controllers Must Never Query Prisma**: Importing `prisma` inside any controller is strictly prohibited.
- **Module Repositories are Private**: A module's repository is strictly private to that module's service layer.
  - ✅ **Allowed**: `StudentsService` calls `StudentsRepository.findActiveStudents(...)`.
  - ❌ **Prohibited**: `FeesService` imports or instantiates `StudentsRepository`.
  - ❌ **Prohibited**: `StudentsController` imports `StudentsRepository`.

---

## 3. Cross-Module Communication Standards

When Domain A requires data or actions from Domain B, use one of the two standard patterns:

### Pattern A: Synchronous Invocations via Public Service Interface

Use when an immediate return value is mandatory to satisfy the business operation.

- **Rule**: Consume only explicitly exported public methods from the foreign module's service.
- **Example**:
  ```typescript
  // src/modules/fees/fees.service.ts
  import { StudentsService } from '../students/students.service';

  export class FeesService {
    constructor(private readonly studentsService: StudentsService) {}

    async generateInvoice(studentId: string, schoolId: string) {
      // Query foreign module via its public service contract
      const student = await this.studentsService.getStudentSummary(studentId, schoolId);
      if (!student) {
        throw AppError.notFound('Student not found');
      }
      // Continue invoice calculation...
    }
  }
  ```

### Pattern B: Asynchronous Decoupling via Domain Events

Use when the triggering domain does not need the result of downstream actions to complete its own transaction.

- **Rule**: Publish an event via `eventBus.publish(DomainEvent.EVENT_NAME, payload)`.
- **Never** introduce direct synchronous module coupling for operations like sending notifications, logging audit trails, or updating non-critical statistics.
- **Example**:
  ```typescript
  // src/modules/admissions/admissions.service.ts
  import { eventBus } from '../../events/event-bus';
  import { DomainEvent } from '../../events/event-types';

  async enrollApplicant(applicationId: string, schoolId: string) {
    const student = await this.admissionsRepo.createStudentFromApplication(...);

    // Decoupled notification & ledger creation
    eventBus.publish(DomainEvent.STUDENT_ENROLLED, {
      eventId: crypto.randomUUID(),
      occurredAt: new Date(),
      schoolId,
      studentId: student.id,
      admissionNumber: student.admissionNumber,
      classId: student.classId,
    });

    return student;
  }
  ```

---

## 4. Circular Dependency Prevention

Circular dependencies (Module A importing Module B while Module B imports Module A) break module autonomy, degrade build performance, and cause runtime initialization errors.

### Mandatory Rules to Prevent Circular Imports:

1. **Unidirectional Dependency Flow**: Map module dependencies hierarchically. For instance, `admissions` depends on `classes-sections`, but `classes-sections` must NEVER depend on `admissions`.
2. **Break Cycles with Events**: If Module B needs to respond to changes in Module A, Module A must emit an event rather than importing Module B.
3. **Extract Shared Types**: If two modules merely share a common data type or interface, move that interface into `src/shared/types/` or create an explicit domain contract interface.

---

## 5. Cross-Module Transaction Ownership

In a relational database, business operations occasionally span multiple entities across modules. How should transactions be managed?

### Guideline 1: Single Module Transaction Ownership

Whenever possible, design workflows so that the primary module owns the database transaction.

```typescript
// Inside fees.service.ts
await prisma.$transaction(async tx => {
  await this.feesRepo.recordPayment(tx, paymentData);
  await this.feesRepo.updateInvoiceBalance(tx, invoiceId, amount);
});
```

### Guideline 2: Multi-Module Operations

When a business action truly spans two modules (e.g. promoting a student which updates `students` and `classes-sections` capacity):

- **Option A (Preferred: Domain Service Orchestrator)**: Pass the transactional client (`Prisma.TransactionClient`) through explicitly typed service methods.
- **Option B (Eventual Consistency)**: Commit the primary domain transaction first, then emit an event for secondary systems. If secondary systems fail, BullMQ workers handle automatic retries.

---

## 6. Placement Boundary Rules

1. **`core/` Boundary**: Only system-level plumbing (Express middlewares, Pino logger, Prisma singleton, HTTP helpers, AppError). NEVER add business logic (e.g. grade point formulas) to `core/`.
2. **`shared/` Boundary**: Only pure, domain-agnostic helpers (string slugifiers, UUID schemas, date formatters). Do not dump module-specific helpers into `shared/`.
3. **`integrations/` Boundary**: External vendor SDK wrappers (AWS, Stripe, Twilio). No business logic; simply wrap external APIs into uniform application interfaces.
4. **`modules/` Boundary**: Internal ERP business domains. Every domain model and workflow belongs inside its respective module.
