# Organizations Module (`src/modules/organizations`)

## Overview
The Organizations module represents the root SaaS tenant boundary for the educational ERP platform. It manages institutional identity, contact metadata, physical headquarters address, branding, SaaS quotas, lifecycle statuses, and canonical module entitlements.

## Architectural Responsibilities
- **Tenant Root Master**: Stores educational trusts, independent schools, college groups, and vocational centers.
- **Provisioning Invariants**: Atomically provisions the tenant, its initial main campus (`isMainCampus = true, isActive = true`), default module entitlements for the chosen subscription plan, and the initial tenant `OWNER` administrator.
- **Quota Management**: Maintains authoritative `maxLocations`, `maxUsers`, and `maxStudents` quotas for subscription compliance.
- **Transitive Module Entitlements**: Validates module dependency prerequisites when updating enabled modules via `validateModuleDependencies`.
- **Administrative Access Boundaries**: Distinguishes Platform Super Admin control plane actions from tenant `OWNER` profile modifications.

## Key Files
- `organizations.types.ts`: DTO interfaces and type definitions.
- `organizations.validation.ts`: Zod validation schemas for provisioning, profile updates, status transitions, and module updates.
- `organizations.repository.ts`: Data access layer for `organization.organizations`, `organization.locations`, and `organization.organization_modules`.
- `organizations.service.ts`: Business logic, code uniqueness validation, and audit logging.
- `organizations.controller.ts`: Express controller utilizing `ResponseHelper`.
- `organizations.routes.ts`: Protected endpoint routes.

