# Local Development Setup Guide

Follow these steps to set up the School ERP backend on your local development workstation.

---

## 1. Prerequisites

Ensure you have the following installed:

- **Node.js**: LTS version 20.x or higher (`node -v`)
- **npm**: version 10.x or higher (`npm -v`)
- **Docker & Docker Compose**: For local PostgreSQL and Redis services (`docker -v`, `docker compose version`)
- **Git**

---

## 2. Installation Steps

### Step 1: Install Dependencies

From the `erp-backend` root directory, install all Node packages:

```bash
npm install
```

### Step 2: Configure Environment Variables

Copy the template `.env.example` to create your local `.env` configuration:

```bash
cp .env.example .env
```

Ensure that `DATABASE_URL` matches your local database settings. For Docker Compose development, the default connection string is:

```env
DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/school_erp_dev?schema=public"
```

### Step 3: Start PostgreSQL & Redis Containers

Spin up the local containerized database and cache:

```bash
docker compose up -d postgres redis
```

Verify the services are running and healthy:

```bash
docker compose ps
```

### Step 4: Generate Prisma Client & Run Migrations

Generate the Prisma types and apply schema migrations:

```bash
npm run prisma:generate
npm run prisma:migrate:dev
```

### Step 5: Seed the Database

Populate the database with baseline seed data:

```bash
npm run prisma:seed
```

---

## 3. Running the Application

### Development Mode (with hot-reload)

```bash
npm run dev
```

The application will launch on `http://localhost:5000`.

- API Documentation: `http://localhost:5000/docs`
- Health Probe: `http://localhost:5000/health`

### Production Build & Run

```bash
npm run build
npm start
```

---

## 4. Verification & Testing

Verify that all automated checks pass:

```bash
# Check code formatting
npm run format

# Run ESLint
npm run lint

# Run TypeScript compiler checks
npm run typecheck

# Run test suite
npm run test
```
