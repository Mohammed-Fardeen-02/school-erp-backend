# Database Conventions & Prisma Guidelines

This document details database architecture, modeling standards, schema design, migrations, and tenant isolation rules using PostgreSQL and Prisma ORM.

---

## 1. Naming & Identification Standards

### Model & Table Naming

- Prisma model names: `PascalCase` singular (e.g. `Student`, `FeeInvoice`, `AuditLog`).
- PostgreSQL physical table names: `snake_case` plural mapped via `@@map("table_names")` (e.g. `@@map("students")`, `@@map("fee_invoices")`).
- Database column names: `snake_case` mapped via `@map("column_name")` (e.g. `schoolId String @map("school_id")`).

### Primary Keys

- Use UUIDv4 for all primary keys to prevent ID enumeration attacks and simplify distributed data ingestion:
  ```prisma
  id String @id @default(uuid())
  ```

### Timestamps

- Every business table must include created and updated timestamps:
  ```prisma
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")
  ```

---

## 2. Multi-Tenant Scoping & Entity Categorization

In a multi-school ERP, entity ownership falls into three distinct architectural categories:

### 1. School-Scoped Entities (Tenant-Owned)

Entities that strictly belong to an individual school institution.

- **Rule**: Must include a `schoolId` column with a foreign key relation to the `schools` table and an index.
- **Examples**: `Student`, `Staff`, `Class`, `Section`, `Attendance`, `FeeStructure`, `FeeInvoice`, `TimetablePeriod`.
- **Enforcement**: Must include `@@index([schoolId])` and unique constraints scoped to the tenant (e.g., student admission numbers are unique _within_ a school, not across the entire planet):
  ```prisma
  @@unique([schoolId, admissionNumber])
  @@index([schoolId])
  ```

### 2. Globally Shared Platform Entities

Entities that exist platform-wide and are not scoped to any single school tenant.

- **Rule**: Do NOT add `schoolId` to globally shared models.
- **Examples**: `PlatformAdmin`, `SystemPermission`, `GlobalSubscriptionPlan`, `CurrencyCatalog`.

### 3. Indirectly Scoped (Child) Entities

Entities whose tenant scope is established through a parent entity relation.

- **Rule**: For deeply nested entities (e.g. `InvoiceItem` belonging to `FeeInvoice`, or `ExamQuestion` belonging to `Exam`), scoping through the parent foreign key is acceptable, provided cascade rules and parent ownership checks are enforced. For query performance, adding a denormalized indexed `schoolId` is recommended when high-volume filtering is required.

---

## 3. Indexes & Constraints

1. **Foreign Key Indexes**: Every foreign key column must have an explicit `@@index` in Prisma schema, as PostgreSQL does not automatically create indexes on foreign keys.
2. **Compound Filter Indexes**: Add composite indexes for frequently paired query filters:
   - `@@index([schoolId, status])` on students and staff tables.
   - `@@index([schoolId, academicYearId])` on class and enrollment tables.
   - `@@index([schoolId, date])` on attendance tables.
3. **Unique Constraints**: Guard business uniqueness at the database level rather than relying solely on application code.

---

## 4. Soft Deletion & Auditability

### When to Use Soft Deletion

- Use soft deletion (`isDeleted Boolean @default(false) @map("is_deleted")`, `deletedAt DateTime? @map("deleted_at")`) only for primary core business entities where regulatory compliance or relational history demands preservation (e.g. `Student`, `Staff`, `FeeInvoice`).
- Do NOT use soft deletion for transactional logs, transient tokens, or join tables.

### Auditability

- Core mutations affecting financial ledgers, grades, security permissions, and student statuses must create an immutable entry in the `audit_logs` table containing the actor ID, school tenant ID, entity ID, previous state, and action timestamp.

---

## 5. Migrations & Seeding Workflow

1. **Creating Migrations**:
   - Never edit the database directly with raw DDL statements in staging or production.
   - In development: update `prisma/schema.prisma` and execute:
     ```bash
     npm run prisma:migrate:dev -- --name add_students_table
     ```
2. **Reviewing SQL Output**: Always inspect the generated SQL file in `prisma/migrations/` before committing.
3. **Seeding Strategy**:
   - Baseline seed (`prisma/seed.ts`) populates initial system permissions, default roles, and super admin accounts.
   - Test fixture seeds should reside in `src/tests/fixtures/` and run within dedicated test transactions.
