# Security Conventions & Defensive Engineering

This document specifies mandatory security policies, authentication mechanisms, authorization rules, and data protection practices for the School ERP backend.

---

## 1. Authentication vs Authorization

- **Authentication (`authenticate` middleware)**: Confirms _who_ the caller is.
  - Validates cryptographically signed JWT access tokens passed via `Authorization: Bearer <token>`.
  - Attaches decoded identity (`id`, `email`, `roles`, `permissions`, `schoolId`) to `req.user` and `req.context`.
- **Authorization (`authorizeRoles`, `authorizePermissions`, `requireTenantScope`)**: Confirms _what_ the authenticated caller is permitted to do.
  - Evaluates user roles and granular permissions against the target endpoint.
  - Enforces school tenant isolation.

---

## 2. JWT & Refresh Token Strategy

1. **Short-Lived Access Tokens**:
   - Access tokens have a default lifespan of 15 minutes (`JWT_ACCESS_EXPIRATION="15m"`).
   - Signed with HMAC-SHA256 (`HS256`) using `JWT_ACCESS_SECRET` (minimum 32 characters).
   - Contain minimal claims: `userId`, `email`, `roles`, `permissions`, `schoolId`.
2. **Secure Refresh Tokens**:
   - Refresh tokens have a lifespan of 7 days (`JWT_REFRESH_EXPIRATION="7d"`).
   - Must be stored hashed in the database (or Redis) alongside user session metadata (family identifier, device fingerprint, IP).
   - **Token Rotation**: Every refresh operation invalidates the old refresh token and issues a new pair. If a revoked refresh token is reused, the entire token family is immediately revoked (indicating potential theft).
   - Refresh tokens should ideally be transferred via `HttpOnly`, `Secure`, `SameSite=Strict` cookies.

---

## 3. Role-Based Access Control (RBAC)

The system enforces a hierarchical RBAC model:

1. **Super Admin**: Platform administrators with global authority across all schools (`SUPER_ADMIN`).
2. **School-Level Roles**: Administrative and academic staff bound strictly to their respective `schoolId` (e.g. `SCHOOL_ADMIN`, `PRINCIPAL`, `TEACHER`, `ACCOUNTANT`, `LIBRARIAN`).
3. **End-User Roles**: `STUDENT`, `GUARDIAN`.
4. **Granular Permissions**: Endpoints verify specific permissions rather than hardcoding role names when behavior varies (e.g. `authorizePermissions('grades:publish')`).

---

## 4. Multi-Tenant Isolation Enforcement

1. **Tenant Validation at Gateway**:
   - The `requireTenantScope` middleware compares `req.user.schoolId` with the route's tenant parameters (`:schoolId`, `x-school-id`, or body `schoolId`).
   - If a non-SuperAdmin user attempts to access or mutate records belonging to a different school, the request is immediately rejected with `403 Forbidden` (`TENANT_ACCESS_DENIED`).
2. **Query Scoping**:
   - Every service and repository query for tenant-owned entities MUST include `schoolId` in the `where` clause:
     ```typescript
     // Mandatory query pattern
     await prisma.student.findFirst({
       where: { id: studentId, schoolId: context.schoolId },
     });
     ```
   - Never query solely by `id` for tenant-scoped records.

---

## 5. Request Validation & Sanitization

1. **API Boundary Validation**: All incoming HTTP payloads (`body`, `query`, `params`) must be validated with Zod via `validateRequest({ ... })`.
2. **Type Coercion & Stripping**: Zod schemas strictly parse only declared keys, stripping malicious extra fields and preventing parameter tampering.
3. **Password Security**: Passwords must be hashed using `bcryptjs` with a minimum salt work factor of 12 (`BCRYPT_SALT_ROUNDS=12`).

---

## 6. Defensive HTTP Headers & Rate Limiting

1. **Helmet**: Configures essential HTTP security headers (Content Security Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Strict-Transport-Security).
2. **CORS**: Configured with strict origin whitelisting in production (`corsOptions`).
3. **Rate Limiting**: `rateLimiter` middleware tracks requests per client IP / API key, mitigating brute-force and denial-of-service attempts.
4. **Payload Size Limits**: Express body parsers are restricted to `10mb` to protect memory allocations against payload inflation attacks.

---

## 7. Safe Logging & Secrets Management

1. **Automated Redaction**: Pino logger is configured to redact passwords, authorization headers, cookies, and refresh tokens automatically.
2. **Zero Hardcoded Secrets**: Secrets and keys must be injected strictly via environment variables validated on startup via `src/config/env.ts`.
