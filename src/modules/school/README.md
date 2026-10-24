# School Tenant Module (`src/modules/school/`)

## Domain Scope

Manages school institution profiles, multi-tenant administrative settings, school branding, contact details, and institutional configuration.

## Planned Responsibilities

- School institution profile registration and management
- Institutional settings (currency, timezone, grading scale defaults)
- School subscription/license limits and feature flags

## Target Structure When Implemented

```text
school/
├── school.routes.ts
├── school.controller.ts
├── school.service.ts
├── school.repository.ts
├── school.validation.ts
├── school.types.ts
└── school.test.ts
```
