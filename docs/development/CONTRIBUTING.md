# Developer Contribution & Workflow Guide

Thank you for contributing to the School ERP backend. To maintain high architectural consistency across all modules and teams, all engineers and automated agents must adhere to the workflows detailed below.

---

## 1. Future Module Creation Standard

When introducing a new business module (for example, `attendance/`), follow this exact 11-step procedure:

### Step 1: Confirm Business Requirements & Module Boundaries

- Read `docs/architecture/FOLDER_STRUCTURE.md` and `docs/architecture/MODULE_BOUNDARIES.md`.
- Identify the domain scope, entity ownership, and whether entities are school-scoped or platform-global.
- Ensure the module does not duplicate responsibilities of an existing module.

### Step 2: Create the Module Directory & Necessary Files

- Create `src/modules/<module-name>/`.
- Introduce only the files strictly needed for the initial feature set:
  ```text
  attendance/
  ├── attendance.routes.ts
  ├── attendance.controller.ts
  ├── attendance.service.ts
  ├── attendance.repository.ts
  ├── attendance.validation.ts
  ├── attendance.types.ts
  └── attendance.test.ts
  ```
- Avoid premature subdirectories unless file count exceeds 10.

### Step 3: Define Request Schemas & Types

- In `<module-name>.validation.ts`, define strict Zod schemas for HTTP body, query, and params.
- In `<module-name>.types.ts`, export TypeScript types inferred from the Zod schemas using `z.infer<typeof schema>`.

### Step 4: Define Prisma Models & Migrations

- If the module requires database persistence, add the model to `prisma/schema.prisma`.
- Ensure school-scoped entities include `schoolId` with foreign keys and compound indexes: `@@index([schoolId])`.
- Run `npm run prisma:migrate:dev -- --name add_<module_name>_table`.
- Run `npm run prisma:generate`.

### Step 5: Implement Repository, Service & Controller

- **Repository (`<module-name>.repository.ts`)**: Implement database queries using `prisma`. Never expose Prisma queries to external modules.
- **Service (`<module-name>.service.ts`)**: Implement business logic, permission rules, and event triggers.
- **Controller (`<module-name>.controller.ts`)**: Keep controllers thin. Extract validated input, invoke service methods, and return standard responses using `ResponseHelper.ok()` or `ResponseHelper.created()`.

### Step 6: Define Routes & Attach Middlewares

- In `<module-name>.routes.ts`, define endpoints and attach appropriate middlewares:
  - `authenticate`: Enforce valid JWT token.
  - `requireTenantScope()`: Enforce multi-tenant isolation.
  - `authorizeRoles(...)` or `authorizePermissions(...)`: Check RBAC.
  - `validateRequest({ body, query, params })`: Validate incoming payload.

### Step 7: Register in the Central Route Registry

- Open `src/routes/index.ts`.
- Import `<module-name>.routes.ts` and mount it:
  ```typescript
  import { attendanceRoutes } from '../modules/attendance/attendance.routes';
  apiRouter.use('/attendance', attendanceRoutes);
  ```

### Step 8: Write Unit & Integration Tests

- In `<module-name>.test.ts`, write unit tests covering service business logic and edge cases.
- Add integration tests covering route endpoints, authorization barriers, and validation rejections.

### Step 9: Update OpenAPI / Swagger Documentation

- Document the new endpoints and payloads in OpenAPI format or annotate routes with JSDoc OpenAPI comments.

### Step 10: Update Architecture Documentation

- Update `src/modules/<module-name>/README.md` reflecting the implemented features.
- If structural changes or cross-module event patterns were introduced, update `docs/architecture/ARCHITECTURE_CHANGELOG.md`.

### Step 11: Execute Verification Suite

Before opening a pull request, verify all automated checks pass cleanly:

```bash
npm run format
npm run lint
npm run typecheck
npm run test
npm run build
```

---

## 2. Standard Pull Request Requirements

1. **Branch Naming**:
   - `feature/<module-name>-<short-description>`
   - `bugfix/<module-name>-<short-description>`
   - `refactor/<module-name>-<short-description>`
2. **Commit Messages**: Follow Conventional Commits:
   - `feat(students): implement student enrollment endpoint`
   - `fix(auth): correct refresh token expiry calculation`
   - `docs(architecture): update module boundary documentation`
3. **No Direct Master/Main Pushes**: All changes must go through a pull request with passing CI status.
