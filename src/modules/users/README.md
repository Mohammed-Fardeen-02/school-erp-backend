# Users Module (`src/modules/users/`)

## Domain Scope

Manages application user identities, basic profile records, activation states, and account status across the ERP platform.

## Planned Responsibilities

- User account creation and onboarding
- Profile updates, avatar association
- Account status (Active, Inactive, Suspended)
- Tenant association linking users to school tenants

## Target Structure When Implemented

```text
users/
├── users.routes.ts
├── users.controller.ts
├── users.service.ts
├── users.repository.ts
├── users.validation.ts
├── users.types.ts
└── users.test.ts
```
