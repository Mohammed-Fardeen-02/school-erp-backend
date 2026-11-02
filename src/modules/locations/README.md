# Locations Domain Module

## Overview
The `locations` module manages campuses, branches, and facilities under a tenant organization. All operations strictly enforce multi-tenant dual-key isolation (`{ id, organizationId }`), atomic parent row-locking (`SELECT ... FOR UPDATE`) for campus quotas, and partial unique index guarantees for designated main campus management.

## Architectural Guarantees
1. **Dual-Key Isolation**: No campus can ever be fetched, updated, or status-toggled by its primary key ID alone. Every database query includes `organizationId` from the validated tenant context.
2. **Quota Serialization**: Creation and reactivation lock the parent `organization.organizations` row to eliminate race conditions under concurrent requests.
3. **Active-Campus Quota Accounting**: Only active campuses (`is_active = true`) count towards an organization's `max_locations` quota.
4. **Main Campus Preservation**: Designated main campuses cannot be deactivated without explicitly promoting an active replacement campus first.
5. **Role & Tenant Authorization**: Campus administrative actions require `requireTenantAdmin` (Tenant Owner, Tenant Admin, or Platform Admin).

## Endpoints
- `GET /api/v1/locations` - List all campuses belonging to the active tenant.
- `POST /api/v1/locations` - Create a new branch campus under parent quota lock.
- `GET /api/v1/locations/:id` - Retrieve campus details using dual-key validation.
- `PUT /api/v1/locations/:id` - Update campus details.
- `PATCH /api/v1/locations/:id/main-campus` - Atomically designate main campus.
- `PATCH /api/v1/locations/:id/status` - Activate or deactivate campus with quota & main campus safety checks.

