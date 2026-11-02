# Workspace Discovery & Selection Engine

## Overview
The `workspace` module manages multi-tenant discovery, context selection, primary organization preferences, and active workspace resolution. It allows a single global user identity to navigate seamlessly across multiple institutions, trusts, branches, or platform contexts.

## Architectural Guarantees
1. **Stateless Selection**: Context selection (`POST /select-context`) does not bind the user's server-side session or overwrite database preferences. Client applications communicate the active context on subsequent requests via standard headers:
   - `X-Organization-Id`: UUID of the active organization.
   - `X-Location-Id`: Optional UUID of the active campus or branch.
2. **Explicit Primary Preference**: The `is_primary` flag on memberships is only mutated via explicit user action (`PUT /primary-organization`) with row-level locking on the user record.
3. **Strict Lifecycle Enforcement**: Suspended, archived, or trial-expired organizations cannot be selected by tenant users.
4. **Campus Resolution**: If no campus is specified during selection, the workspace engine automatically resolves the tenant's designated main campus.

## Endpoints
- `GET /api/v1/workspace/my-organizations` - Enumerate all accessible organizations and active campuses.
- `POST /api/v1/workspace/select-context` - Validate and select tenant/campus context, retrieving metadata and enabled modules.
- `GET /api/v1/workspace/current` - Retrieve full active context profile verified via request headers.
- `PUT /api/v1/workspace/primary-organization` - Set the user's default/primary organization.

