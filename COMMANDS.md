# Smart Attendance System — Developer Commands Reference Guide

A complete, single-source reference for all commands needed to develop, run, migrate, seed, test, typecheck, build, and troubleshoot the **Smart Attendance Management System Using Face Recognition**.

---

## Quick Start (Run Everything)

```bash
# 1. Install all monorepo dependencies
pnpm install

# 2. Setup environment variables (if not already done)
cp .env.example .env

# 3. Generate Prisma client & seed database with demo fixtures
pnpm --filter @smart-attendance/api prisma:generate
pnpm --filter @smart-attendance/api prisma:seed

# 4. Start both Backend (Port 4000) & Frontend (Port 3000) concurrently
pnpm dev
```

- **Frontend URL:** [http://localhost:3000](http://localhost:3000)
- **Backend API URL:** [http://localhost:4000](http://localhost:4000)
- **API Health Check:** [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)

---

## Demo Accounts & Default Credentials

All pre-seeded demo accounts share the password **`Password@123`**:

| Role | Email | Password | Landing Portal |
|:---|:---|:---|:---|
| **Administrator** | `admin@college.edu` | `Password@123` | `/admin` / `/admin/departments` |
| **Teacher** | `prof.sharma@college.edu` | `Password@123` | `/sessions` / `/timetable` |
| **Student** | `student.aarav@college.edu` | `Password@123` | `/dashboard` / `/reports/student` |

---

## 1. Development Commands

### Run Both Frontend and Backend Concurrently
```bash
pnpm dev
```

### Run Services Individually
```bash
# Run Backend API only (Express on http://localhost:4000 with tsx watch)
pnpm dev:api
# Or from root filter:
pnpm --filter @smart-attendance/api dev

# Run Frontend Web only (Next.js 14 on http://localhost:3000 with Fast Refresh)
pnpm dev:web
# Or from root filter:
pnpm --filter @smart-attendance/web dev
```

---

## 2. Database & Prisma Commands

All database commands target PostgreSQL (configured via `DATABASE_URL` in `.env`).

```bash
# Generate Prisma Client (after schema changes in apps/api/prisma/schema.prisma)
pnpm --filter @smart-attendance/api prisma:generate

# Create and apply a new database migration
pnpm --filter @smart-attendance/api prisma:migrate

# Seed database with initial academic data and demo users
pnpm --filter @smart-attendance/api prisma:seed

# Launch Prisma Studio (visual database GUI at http://localhost:5555)
pnpm --filter @smart-attendance/api dlx prisma studio

# Reconcile post-backup biometric deletions against durable ledger
pnpm --filter @smart-attendance/api restore:reconcile
```

---

## 3. Testing Commands

The backend test suite uses **Vitest** with 19 comprehensive test suites (335 automated tests).

```bash
# Run all automated tests across the workspace
pnpm test

# Run backend API tests
pnpm --filter @smart-attendance/api test

# Run a specific test file (e.g., E2E 15-step multi-role workflow)
pnpm --filter @smart-attendance/api test -- run test/e2e-workflow.test.ts

# Run a specific test suite file
pnpm --filter @smart-attendance/api test -- run test/auth.test.ts
pnpm --filter @smart-attendance/api test -- run test/sessions.test.ts
pnpm --filter @smart-attendance/api test -- run test/timetable.test.ts
pnpm --filter @smart-attendance/api test -- run test/reports.test.ts
pnpm --filter @smart-attendance/api test -- run test/enrollment.test.ts

# Run tests matching a specific test name pattern (-t filter)
pnpm --filter @smart-attendance/api test -- -t "Step 1"

# Run tests in watch mode during active development
pnpm --filter @smart-attendance/api exec vitest
```

---

## 4. Code Quality & Typechecking Commands

```bash
# Typecheck all 4 workspace TypeScript packages (@smart-attendance/shared, packages/recognition-spike, api, web)
pnpm typecheck
# Or equivalently:
pnpm -r typecheck

# Format all code files (TypeScript, TSX, JSON, Markdown, CSS) with Prettier
pnpm format

# Check formatting without writing changes
pnpm exec prettier --check "**/*.{ts,tsx,js,json,md}"
```

---

## 5. Production Build & Deployment Commands

```bash
# Build all packages in topological dependency order (shared -> api -> web)
pnpm build

# Build individual packages
pnpm --filter @smart-attendance/shared build
pnpm --filter @smart-attendance/api build
pnpm --filter @smart-attendance/web build

# Start production server after building
pnpm --filter @smart-attendance/api start   # Runs compiled dist/index.js on port 4000
pnpm --filter @smart-attendance/web start   # Runs optimized Next.js server on port 3000
```

---

## 6. Monorepo Structure & Port Mapping

```text
smart-attendance-system/
├── apps/
│   ├── api/       # Express + Prisma Backend (Port 4000)
│   └── web/       # Next.js 14 App Router Frontend (Port 3000)
├── packages/
│   ├── shared/            # Shared TypeScript types, Zod schemas, DTOs
│   └── recognition-spike/ # Human face-recognition engine & mathematical embeddings
├── docs/          # PRD, Architecture, Security, Database design, API specs
└── plans/         # Task tracker and milestone verification records (TASKS.md)
```

| Application / Service | Default Port | Internal Proxy / Upstream |
|:---|:---:|:---|
| **Frontend Web** (`@smart-attendance/web`) | `3000` | Proxies `/api/v1/*` to `http://localhost:4000` |
| **Backend API** (`@smart-attendance/api`) | `4000` | Serves REST endpoints at `/api/v1/*` |
| **PostgreSQL Database** | `5432` | Configured via `DATABASE_URL` |
| **Prisma Studio (GUI)** | `5555` | Optional developer GUI |

---

## 7. Windows PowerShell Troubleshooting & Tips

### Check if Ports 3000 or 4000 are in use
```powershell
Get-NetTCPConnection -LocalPort 3000, 4000 -ErrorAction SilentlyContinue
```

### Free up a blocked port (kill process by PID)
```powershell
Stop-Process -Id <PID> -Force
```

### Verify PostgreSQL is listening on port 5432
```powershell
Get-NetTCPConnection -LocalPort 5432 -ErrorAction SilentlyContinue
```

### Verify API Health endpoint in PowerShell
```powershell
Invoke-RestMethod -Uri "http://localhost:4000/api/v1/health" | ConvertTo-Json
```

### Verify Web Frontend in PowerShell
```powershell
(Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing).StatusCode
```

---

## 8. Summary Cheatsheet

| Task | Command |
|:---|:---|
| **Install dependencies** | `pnpm install` |
| **Start full app** | `pnpm dev` |
| **Start API only** | `pnpm dev:api` |
| **Start Web only** | `pnpm dev:web` |
| **Run all tests** | `pnpm test` |
| **Run API tests** | `pnpm --filter @smart-attendance/api test` |
| **Run E2E test suite** | `pnpm --filter @smart-attendance/api test -- run test/e2e-workflow.test.ts` |
| **Run typecheck** | `pnpm -r typecheck` |
| **Build for production** | `pnpm build` |
| **Format codebase** | `pnpm format` |
| **Seed database** | `pnpm --filter @smart-attendance/api prisma:seed` |
| **Prisma Studio GUI** | `pnpm --filter @smart-attendance/api dlx prisma studio` |
| **Biometric restore reconcile** | `pnpm --filter @smart-attendance/api restore:reconcile` |
