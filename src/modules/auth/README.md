# Auth Module (`src/modules/auth/`)

**Status**: Implemented (Phase 1: Identity & Authentication Engine)  
**Security Standard**: Argon2id Hashing, Token Family Rotation with Replay Detection, Atomic Account Lockout, Real-Time `tokenVersion` Access Invalidation.

---

## 1. Domain Scope & Responsibilities

The `auth` module owns all platform identity and authentication flows:
- **Identity & Credentials**: Email/password authentication, Argon2id password hashing.
- **Session Lifecycle**: Device sessions (`auth.sessions`) and refresh token chains (`auth.refresh_tokens`).
- **Token Family Rotation & Replay Detection**: Instant termination of all sessions in a family upon detection of token reuse.
- **Access Token Invalidation**: Instant token invalidation via `tokenVersion` checks in `authenticate` middleware.
- **Account Lockout**: 5 failed consecutive attempts trigger an atomic 15-minute lockout.
- **Password Recovery**: Single-use, 15-minute, cryptographically secure SHA-256 hashed password reset flow.
- **Session Management**: Independent endpoints to inspect active device sessions and terminate specific devices.

---

## 2. Implemented Structure

```text
src/modules/auth/
├── auth.routes.ts          # Endpoint declarations with rate limiters & validation
├── auth.controller.ts      # HTTP controller mapping inputs to service calls
├── auth.service.ts         # Business rules, token issuance, replay detection, recovery
├── sessions.repository.ts  # Database operations for sessions and refresh tokens
├── auth.validation.ts      # Zod validation schemas
├── auth.types.ts           # DTOs, JWT payloads, and session response types
├── auth.test.ts            # Unit and security test suite
└── README.md               # Module documentation
```

---

## 3. Endpoints Reference

| Method | Route | Description | Rate Limit | Auth |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Authenticate with email/password; creates session | 5 req / 15m | No |
| `POST` | `/api/v1/auth/refresh` | Rotate refresh token; detects token replay | 30 req / 15m | No |
| `POST` | `/api/v1/auth/logout` | Revoke current session | None | Yes |
| `GET` | `/api/v1/auth/me` | Fetch authenticated identity | None | Yes |
| `GET` | `/api/v1/auth/sessions` | List active device sessions for current user | None | Yes |
| `DELETE` | `/api/v1/auth/sessions/:sessionId` | Revoke a specific device session | None | Yes |
| `DELETE` | `/api/v1/auth/sessions` | Revoke all other device sessions except current | None | Yes |
| `POST` | `/api/v1/auth/forgot-password` | Request single-use password reset link | 3 req / 15m | No |
| `POST` | `/api/v1/auth/reset-password` | Atomically consume reset token and update password | 5 req / 15m | No |
| `POST` | `/api/v1/auth/change-password` | Authenticated password change; revokes other sessions | 5 req / 15m | Yes |
