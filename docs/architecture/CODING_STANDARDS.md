# Coding Standards & Engineering Guidelines

This document specifies mandatory coding standards, TypeScript practices, and clean code principles for the School ERP backend.

---

## 1. TypeScript Strictness & Type Safety

1. **Strict Mode Enabled**: `strict: true`, `noImplicitAny: true`, `strictNullChecks: true`, and `noUncheckedIndexedAccess: true` are enforced by `tsconfig.json`.
2. **Zero Unjustified `any`**:
   - The use of `any` is strictly prohibited in application code.
   - Use `unknown` when incoming data type is uncertain, and validate with Zod or TypeScript type guards before consumption.
   - If a third-party library has broken or missing type declarations, isolate the type assertion with an explanatory comment (`// eslint-disable-next-line @typescript-eslint/no-explicit-any`).
3. **Explicit Function Return Types**:
   - All exported functions, service methods, and repository methods should have explicit return type annotations to guarantee interface contracts.
4. **Prefer Interfaces for Extensible Models, Types for Unions/Transformations**:
   - Use `interface` for entity models and service contracts.
   - Use `type` for unions, intersections, utility types, and mapped types.

---

## 2. Naming Conventions

- **Files & Folders**: `kebab-case` (e.g. `academic-years.service.ts`, `validate-request.ts`).
- **Classes**: `PascalCase` (e.g. `AttendanceService`, `AppError`).
- **Interfaces & Types**: `PascalCase` (e.g. `StudentDto`, `PaginationParams`).
- **Functions & Methods**: `camelCase` (e.g. `calculateTermGrade()`, `verifyToken()`).
- **Variables**: `camelCase` (e.g. `totalFeesDue`, `activeStudents`).
- **Constants & Enums**: `UPPER_SNAKE_CASE` (e.g. `MAX_FILE_SIZE_BYTES`, `SystemRole.TEACHER`).
- **Boolean Variables**: Prefix with indicative verbs (`isActive`, `hasPermission`, `isDeleted`, `canEnroll`).

---

## 3. Error Handling Principles

1. **Always Use `AppError`**:
   - Never throw raw string literals or generic `new Error('Something failed')`.
   - Always throw `AppError` with an explicit HTTP status code and `ErrorCode` enum:
     ```typescript
     throw AppError.notFound('Student record not found', ErrorCode.NOT_FOUND);
     ```
2. **Distinguish Operational vs Programming Errors**:
   - _Operational Errors_: Expected runtime issues (validation failed, student not found, invalid password, expired token). Handled cleanly with `AppError` and logged at `warn` level.
   - _Programming Errors_: Bugs or infrastructure failures (syntax errors, unhandled promise rejections, database connection lost). Caught by `globalErrorHandler` and logged at `error`/`fatal` level.
3. **Never Swallow Errors**:
   - Catching an error and ignoring it (`catch (e) {}`) without re-throwing or logging is strictly forbidden.
   - If catching an error to enrich it, preserve the original error context:
     ```typescript
     try {
       await externalApiCall();
     } catch (error) {
       throw new AppError(
         'Payment processing failed',
         502,
         ErrorCode.EXTERNAL_SERVICE_ERROR,
         true,
         error
       );
     }
     ```

---

## 4. Clean Code & Single Responsibility

1. **Small, Focused Functions**: Each function should do exactly one thing. Functions exceeding 40 lines should be evaluated for decomposition.
2. **No Deep Nesting**: Keep indentation depth under 3 levels. Use guard clauses / early returns:
   ```typescript
   // Recommended: Early return
   if (!user) {
     throw AppError.unauthorized();
   }
   if (!user.isActive) {
     throw AppError.forbidden('User account is deactivated');
   }
   return this.processUser(user);
   ```
3. **Dependency Injection & Inversion**:
   - Services should accept dependencies (such as repositories or other services) via constructor arguments rather than hardcoding static singletons. This facilitates mocking during unit testing.
4. **Immutability by Default**: Prefer `readonly`, `const`, and pure transformations over mutating shared arguments or global objects.

---

## 5. Logging Standards

1. **Use Centralized Pino Logger**: Never use `console.log()` or `console.error()`. Use `logger.info()`, `logger.warn()`, `logger.error()`.
2. **Structured Log Context**: Pass objects first, then message:
   ```typescript
   logger.info({ studentId, schoolId, action: 'enrollment' }, 'Student enrolled successfully');
   ```
3. **Never Log Sensitive Information**: Passwords, plain text tokens, credit card details, and personal identification numbers must be redacted or omitted.
