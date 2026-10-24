# Fees Module (`src/modules/fees/`)

## Domain Scope

Manages school fee structures, fee categories, student invoices, discounts, scholarships, and fee balances.

## Planned Responsibilities

- Fee category definitions (Tuition, Transportation, Laboratory, Extracurricular)
- Fee schedule assignment per class or individual student
- Invoice generation per academic term
- Concessions, waivers, and late-fee penalty rules

## Target Structure When Implemented

```text
fees/
├── fees.routes.ts
├── fees.controller.ts
├── fees.service.ts
├── fees.repository.ts
├── fees.validation.ts
├── fees.types.ts
└── fees.test.ts
```
