# API Conventions & REST Design Standards

This document defines standard API conventions for all HTTP endpoints in the School ERP backend.

---

## 1. REST Endpoint Naming & Hierarchy

All endpoints must follow standard RESTful URL conventions:

1. **Plural Nouns for Resources**: Use plural nouns, lowercase, kebab-case for multi-word paths:
   - ✅ `/api/v1/students`
   - ✅ `/api/v1/classes-sections`
   - ❌ `/api/v1/getStudents`
   - ❌ `/api/v1/student`
2. **Sub-resource Relationships**: Represent parent-child hierarchies logically:
   - `/api/v1/schools/:schoolId/branches`
   - `/api/v1/students/:studentId/guardians`
   - `/api/v1/fees/invoices/:invoiceId/payments`
3. **Actions / Non-CRUD RPC Endpoints**: When an operation represents an action rather than a CRUD mutation, use an action verb at the end of the resource path:
   - `POST /api/v1/admissions/applications/:id/approve`
   - `POST /api/v1/auth/reset-password`
   - `POST /api/v1/reports/academic-summary/export`

---

## 2. API Versioning

1. All public API endpoints are prefixed with the major API version: `/api/v1/...`.
2. Breaking changes require incrementing to `/api/v2` with a deprecation schedule.
3. Non-breaking additions (new optional fields, new endpoints) remain within `/api/v1`.

---

## 3. Standard HTTP Methods & Status Codes

| Method     | Target               | Successful Status           | Meaning                             |
| :--------- | :------------------- | :-------------------------- | :---------------------------------- |
| **GET**    | Collection or Entity | `200 OK`                    | Retrieved successfully              |
| **POST**   | Collection           | `201 Created`               | New entity created                  |
| **PUT**    | Entity               | `200 OK`                    | Full replacement of entity          |
| **PATCH**  | Entity               | `200 OK`                    | Partial update of entity fields     |
| **DELETE** | Entity               | `204 No Content` / `200 OK` | Deleted / Soft-deleted successfully |

### Error Status Codes:

- `400 Bad Request`: Malformed syntax, invalid JSON payload.
- `401 Unauthorized`: Missing or invalid authentication token.
- `403 Forbidden`: Authenticated, but user lacks necessary role, permission, or tenant access.
- `404 Not Found`: Resource or endpoint does not exist.
- `409 Conflict`: Unique constraint violation (e.g. duplicate email or student admission number).
- `422 Unprocessable Entity`: Request validation failure (invalid body, query, or params).
- `429 Too Many Requests`: Rate limit threshold exceeded.
- `500 Internal Server Error`: Unhandled server exception.

---

## 4. Standard Response Envelope

All API responses must strictly adhere to the uniform JSON format.

### Success Response Contract

```json
{
  "success": true,
  "message": "Resource created successfully",
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  },
  "timestamp": "2026-10-24T16:00:00.000Z"
}
```

### Error Response Contract

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [
      {
        "field": "email",
        "message": "Invalid email address format",
        "rule": "invalid_string"
      }
    ]
  },
  "timestamp": "2026-10-24T16:00:00.000Z"
}
```

---

## 5. Pagination, Sorting & Filtering

### Standard Query Parameters:

- `page`: 1-based page index (default: `1`).
- `limit`: Number of records per page (default: `20`, maximum: `100`).
- `sortBy`: Field name to sort on (e.g. `createdAt`, `lastName`).
- `sortOrder`: Sorting direction, either `asc` or `desc` (default: `desc`).
- `search`: Full-text or partial keyword search string.

### Filtering Pattern:

Filter parameters must be passed as explicit query keys:

- `GET /api/v1/students?classId=uuid&status=ACTIVE&page=1&limit=20`

---

## 6. OpenAPI / Swagger Documentation

1. Every endpoint must be documented in OpenAPI 3.0 specification.
2. Route files should contain standard JSDoc OpenAPI comments or be mapped in the central OpenAPI registry.
3. Interactive documentation is accessible in development and staging at `/docs`.
