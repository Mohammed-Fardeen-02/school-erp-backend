# Auth Module (`src/modules/auth/`)

## Domain Scope

Handles user authentication, login credentials verification, JWT issuance, token rotation, password hashing, and session management.

## Planned Responsibilities

- User login / logout
- JWT Access and Refresh token lifecycle
- Multi-factor authentication (MFA)
- Password reset and email verification flows

## Target Structure When Implemented

```text
auth/
├── auth.routes.ts
├── auth.controller.ts
├── auth.service.ts
├── auth.validation.ts
├── auth.types.ts
└── auth.test.ts
```
