# School ERP API Specification & Documentation

## Overview

The School ERP backend exposes a RESTful JSON API organized under the `/api/v1` namespace.

Interactive OpenAPI / Swagger documentation is served directly by the backend application at:

- **Local Development URL**: `http://localhost:5000/docs`
- **Health Check Probe**: `http://localhost:5000/health`

---

## Standard Headers

Every HTTP request sent to protected endpoints must supply:

| Header          | Description                             | Required                                      | Example                                |
| :-------------- | :-------------------------------------- | :-------------------------------------------- | :------------------------------------- |
| `Authorization` | Bearer token format                     | Yes (for protected endpoints)                 | `Bearer eyJhbGciOiJI...`               |
| `Content-Type`  | Payload serialization                   | Yes (for POST, PUT, PATCH)                    | `application/json`                     |
| `x-school-id`   | Target school tenant UUID               | Yes (for tenant-scoped operations)            | `8f5b3a1a-4d2b-426b-9689-5321ab102a90` |
| `x-request-id`  | Client-generated request correlation ID | Optional (generated automatically if omitted) | `b7c53d9e-e31b-4217-bf41-69279db0df6a` |

---

## Response Schema Format

Refer to `docs/architecture/API_CONVENTIONS.md` for detailed JSON response envelope specifications.
