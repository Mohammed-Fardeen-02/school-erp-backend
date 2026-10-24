# Roles & Permissions Module (`src/modules/roles-permissions/`)

## Domain Scope

Provides Role-Based Access Control (RBAC) definition, dynamic permission assignment, and role hierarchical mapping.

## Planned Responsibilities

- Role definitions (System roles, School-level custom roles)
- Granular permission registry (e.g., `students:read`, `fees:write`, `reports:export`)
- Assignment of roles and permissions to users

## Target Structure When Implemented

```text
roles-permissions/
├── roles-permissions.routes.ts
├── roles-permissions.controller.ts
├── roles-permissions.service.ts
├── roles-permissions.repository.ts
├── roles-permissions.validation.ts
├── roles-permissions.types.ts
└── roles-permissions.test.ts
```
