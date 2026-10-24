# School ERP Backend

Enterprise-grade backend API for a comprehensive School Enterprise Resource Planning (ERP) platform. Built with **Node.js**, **TypeScript**, **Express.js**, **PostgreSQL**, and **Prisma ORM** using a clean, scalable **Modular Monolith** architecture.

---

## Technology Stack

- **Runtime**: Node.js LTS (v20+)
- **Language**: TypeScript with strict mode
- **Web Framework**: Express.js
- **Database**: PostgreSQL
- **ORM**: Prisma ORM
- **Request Validation**: Zod
- **Authentication**: JWT with refresh token rotation strategy
- **Authorization**: Role-Based Access Control (RBAC) & School Tenant Scoping
- **Logging**: Pino (structured JSON logging)
- **API Documentation**: OpenAPI / Swagger UI
- **Testing**: Vitest & Supertest
- **Linting & Formatting**: ESLint (v9 flat config) & Prettier
- **Containerization**: Docker & Docker Compose
- **Background Jobs**: BullMQ & Redis

---

## Architectural Principles

The application is structured as a **Modular Monolith**:

- Domain-driven modular organization (`src/modules/*`).
- Clear layer separation: HTTP Controllers -> Application Services -> Module Repositories -> Database.
- Explicit cross-module boundaries with strict prohibition against cross-module repository imports.
- Event-driven asynchronous decoupling (`src/events/event-bus.ts`) for cross-domain notifications and secondary actions.
- Rigid multi-tenant data isolation (`x-school-id` and `requireTenantScope`).

---

## Quickstart Guide

### 1. Prerequisites

- Node.js LTS (v20+)
- npm (v10+)
- Docker & Docker Compose

### 2. Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy environment template
cp .env.example .env

# 3. Start local PostgreSQL & Redis containers
docker compose up -d postgres redis

# 4. Generate Prisma client & run database migrations
npm run prisma:generate
npm run prisma:migrate:dev

# 5. Run baseline database seeds
npm run prisma:seed

# 6. Start development server with hot-reload
npm run dev
```

The server will be running at `http://localhost:5000`.

- **Interactive API Documentation**: `http://localhost:5000/docs`
- **Health Check Probe**: `http://localhost:5000/health`

---

## Available NPM Scripts

| Script                          | Description                                              |
| :------------------------------ | :------------------------------------------------------- |
| `npm run dev`                   | Starts server in watch mode with `tsx`                   |
| `npm run build`                 | Compiles TypeScript to `dist/`                           |
| `npm run start`                 | Runs the compiled production server                      |
| `npm run lint`                  | Runs ESLint checks across codebase                       |
| `npm run lint:fix`              | Runs ESLint and auto-fixes issues                        |
| `npm run format`                | Checks code formatting with Prettier                     |
| `npm run format:fix`            | Automatically formats files with Prettier                |
| `npm run typecheck`             | Validates strict TypeScript compilation (`tsc --noEmit`) |
| `npm run test`                  | Runs test suite using Vitest                             |
| `npm run test:watch`            | Runs tests in watch mode                                 |
| `npm run test:coverage`         | Generates test coverage report                           |
| `npm run prisma:generate`       | Generates Prisma Client types                            |
| `npm run prisma:migrate:dev`    | Runs database migrations in development                  |
| `npm run prisma:migrate:deploy` | Applies migrations in production/staging                 |
| `npm run prisma:studio`         | Opens interactive Prisma Studio database GUI             |
| `npm run prisma:seed`           | Runs database baseline seed script                       |

---

## Documentation Index

- [Backend Architecture Overview](docs/architecture/BACKEND_ARCHITECTURE.md)
- [Folder Structure Reference](docs/architecture/FOLDER_STRUCTURE.md)
- [Module Boundaries & Rules](docs/architecture/MODULE_BOUNDARIES.md)
- [Coding Standards & Guidelines](docs/architecture/CODING_STANDARDS.md)
- [API Design Conventions](docs/architecture/API_CONVENTIONS.md)
- [Database Conventions & Prisma](docs/architecture/DATABASE_CONVENTIONS.md)
- [Security Conventions](docs/architecture/SECURITY_CONVENTIONS.md)
- [Testing Strategy](docs/architecture/TESTING_STRATEGY.md)
- [Architecture Decision Changelog](docs/architecture/ARCHITECTURE_CHANGELOG.md)
- [API Overview](docs/api/README.md)
- [Local Setup Guide](docs/development/LOCAL_SETUP.md)
- [Environment Variables](docs/development/ENVIRONMENT_VARIABLES.md)
- [Contribution & Module Creation Guide](docs/development/CONTRIBUTING.md)
- [Mandatory AI Agent Guidelines](AGENTS.md)
