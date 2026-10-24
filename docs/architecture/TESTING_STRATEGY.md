# Backend Testing Strategy & Standards

This document establishes the testing philosophy, pyramid distribution, execution procedures, and data isolation strategies for the School ERP backend.

---

## 1. The Testing Pyramid

Our testing strategy follows the standard testing pyramid with Vitest as the primary test runner and Supertest for HTTP assertions:

```text
       ▲
      / \        End-to-End Tests (Smoke & Multi-Domain Flows)
     /   \       Location: src/tests/e2e/
    /─────\
   /       \     Integration Tests (API Endpoints, Middleware, DB)
  /         \    Location: src/tests/integration/ & src/modules/**/
 /───────────\
/             \  Unit Tests (Pure Services, Domain Rules, Utilities)
/───────────────\ Location: Colocated in src/modules/**/<name>.test.ts
```

---

## 2. Test Types & Placement

### 1. Unit Tests

- **Focus**: Pure business logic, edge conditions, calculations, and domain validators.
- **Location**: Colocated inside the module next to the subject under test (e.g., `src/modules/fees/fees.service.test.ts`).
- **Dependencies**: External dependencies (database repositories, third-party clients) must be mocked using `vi.fn()` or `vi.spyOn()`.

### 2. Integration Tests

- **Focus**: HTTP request handling, middleware pipelines (auth, rate limiting, validation), database persistence, and route wiring.
- **Location**: `src/tests/integration/` or module-level integration tests.
- **Execution**: Uses Supertest against the Express `app` instance.

### 3. End-to-End (E2E) Tests

- **Focus**: Multi-step business lifecycles spanning multiple modules.
- **Location**: `src/tests/e2e/`.
- **Examples**:
  - Admission application -> Approval -> Student record creation -> Class assignment -> Initial fee invoice generation -> Payment receipt issuance.

---

## 3. High-Risk Workflow Expectations

Modules managing sensitive financial or academic operations require mandatory high-coverage integration tests:

1. **Admissions & Student Enrollment**: Must verify that applicant conversion is atomic and triggers the appropriate `STUDENT_ENROLLED` event.
2. **Attendance**: Must verify that duplicate attendance submissions for the same student on the same date are rejected.
3. **Fees & Invoicing**: Must verify discount calculations, tax allocations, and partial payment balance deductions under concurrent operations.
4. **Payments & Ledgers**: Must verify that payments cannot exceed outstanding balances and that ledger records are immutable.

---

## 4. Test Database Isolation & Fixtures

1. **Test Environment**:
   - Tests execute with `NODE_ENV=test`.
   - Rate limiting is bypassed in test mode to prevent artificial 429 errors during test execution.
2. **Database Isolation Strategy**:
   - Unit tests mock the Prisma client (`vi.mock('../../core/database/prisma-client')`).
   - Integration tests utilizing a live test PostgreSQL database must run in an isolated test schema or rollback transactions (`prisma.$transaction`) at test completion.
3. **Fixtures**:
   - Reusable mock datasets and builder factories reside in `src/tests/fixtures/`.
   - Prefer factory functions (e.g. `createMockStudent(overrides)`) over static hardcoded JSON objects.

---

## 5. Test Commands

```bash
# Run test suite once
npm run test

# Run tests in watch mode during development
npm run test:watch

# Generate code coverage report
npm run test:coverage
```
