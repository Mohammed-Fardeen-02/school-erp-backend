# Attendance Module (`src/modules/attendance/`)

## Domain Scope

Tracks daily and subject-wise attendance for students, staff, and teachers.

## Planned Responsibilities

- Daily classroom attendance capture (Present, Absent, Late, Excused, Half-Day)
- Subject-period level attendance recording
- Staff biometric / manual attendance logging
- Absentee alerts triggering notifications to guardians
- Monthly and annual attendance percentage analytics

## Target Structure When Implemented

```text
attendance/
├── attendance.routes.ts
├── attendance.controller.ts
├── attendance.service.ts
├── attendance.repository.ts
├── attendance.validation.ts
├── attendance.types.ts
└── attendance.test.ts
```
