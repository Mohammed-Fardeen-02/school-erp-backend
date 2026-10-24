# Admissions Module (`src/modules/admissions/`)

## Domain Scope

Manages student application intake, entrance screening, review workflows, admission fee linkage, and formal student onboarding.

## Planned Responsibilities

- Online / offline applicant intake
- Document collection and verification
- Application review, status transitions (Applied, Screened, Accepted, Enrolled, Rejected)
- Conversion of accepted applicant to formal Student record (publishes `student.enrolled` event)

## Target Structure When Implemented

```text
admissions/
├── admissions.routes.ts
├── admissions.controller.ts
├── admissions.service.ts
├── admissions.repository.ts
├── admissions.validation.ts
├── admissions.types.ts
└── admissions.test.ts
```
