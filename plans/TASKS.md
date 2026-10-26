# Task Backlog & Implementation Tracker

**Project:** Smart Attendance Management System Using Face Recognition  
**Status Key:** `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `DONE`

---

## Phase 1 — Foundation & Monorepo Setup

### T-001: Monorepo Structure & Package Manifests
- **Requirement:** Section 4, 5 & ADR-002
- **Status:** DONE
- **Dependencies:** None
- **Affected Files:** `package.json`, `pnpm-workspace.yaml`, `apps/api/package.json`, `apps/web/package.json`, `packages/shared/package.json`
- **Acceptance Criteria:**
  - Root `package.json` with workspace configuration (`apps/*`, `packages/*`).
  - Standardized scripts: `dev`, `build`, `lint`, `typecheck`, `test`.
  - Strict dependency hygiene; no unused packages.

### T-002: Strict TypeScript & Tooling Configuration
- **Requirement:** Section 4, `rules/TYPESCRIPT_RULES.md`
- **Status:** DONE
- **Dependencies:** T-001
- **Affected Files:** `tsconfig.base.json`, `apps/api/tsconfig.json`, `apps/web/tsconfig.json`, `packages/shared/tsconfig.json`
- **Acceptance Criteria:**
  - TypeScript strict mode enabled across all packages.
  - Path aliases configured (`@/*` in web and api).
  - Type checking passes cleanly across the workspace.

### T-003: Centralized Backend API Foundation & Error Handling
- **Requirement:** Section 4, 9, FR-01, `docs/API_SPECIFICATION.md`
- **Status:** DONE
- **Dependencies:** T-001, T-002
- **Affected Files:** `apps/api/src/index.ts`, `apps/api/src/app.ts`, `apps/api/src/middleware/errorHandler.ts`, `apps/api/src/middleware/validate.ts`, `apps/api/src/routes/health.ts`, `apps/api/test/health.test.ts`
- **Acceptance Criteria:**
  - Express app listening on configured `PORT` (default 4000).
  - Health endpoint `GET /api/v1/health` returns `{ status: "ok", timestamp: ... }`.
  - Consistent error envelope `{ "error": { "code": "...", "message": "...", "details": [] } }`.
  - Structured logging and safe handling of uncaught exceptions.

### T-004: Frontend Application Shell & Design System Foundation
- **Requirement:** Section 4, 10, `rules/FRONTEND_RULES.md`
- **Status:** DONE
- **Dependencies:** T-001, T-002
- **Affected Files:** `apps/web/src/app/layout.tsx`, `apps/web/src/app/page.tsx`, `apps/web/src/lib/api-client.ts`, `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css`
- **Acceptance Criteria:**
  - Next.js App Router configured with Tailwind CSS and Geist Sans font.
  - Configured Axios API client with standardized error handling and base URL.
  - Reusable layout with sidebar, header, and responsive navigation shell.
  - Loading skeleton, empty state, and error boundary components.

---

## Phase 2 — Database & Domain Model

### T-005: PostgreSQL & Prisma Schema Implementation
- **Requirement:** Section 4, `docs/DATABASE_DESIGN.md`, ADR-001
- **Status:** DONE
- **Dependencies:** T-001
- **Affected Files:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20261026111636_init_smart_attendance_schema/migration.sql`, `apps/api/prisma/seed.ts`, `apps/api/test/database-invariants.test.ts`
- **Acceptance Criteria:**
  - Models created: `User`, `Student`, `Department`, `AcademicYear`, `Class`, `Subject`, `TeacherAssignment`, `TimetableEntry`, `AttendanceSession`, `AttendanceRecord`, `FaceEnrollment`, `AuditLog`, `Notification`, `SystemSetting`.
  - Unique constraint on `(studentId, sessionId)` on `AttendanceRecord`.
  - Unique constraints on roll numbers within cohort scope and email on `User`.
  - Initial migrations generated and applied to the local PostgreSQL database (`smart_attendance_dev`).
  - Seed script with sample institution, departments, admin, teachers, subjects, timetable, students, and face enrollment.
  - Integration tests verifying duplicate prevention, foreign key restrictions, biometric deletion behavior, and transaction rollbacks.

---

## Phase 3 — Authentication & Authorization

### T-010: Authentication (JWT & HTTP-Only Cookies)
- **Requirement:** FR-01, Section 7, `docs/SECURITY.md`
- **Status:** DONE
- **Dependencies:** T-003, T-005
- **Affected Files:** `apps/api/src/modules/auth/*`, `apps/web/src/features/auth/*`, `apps/web/src/app/login/page.tsx`
- **Acceptance Criteria:**
  - `POST /api/v1/auth/login`: verifies password with secure hash, issues HTTP-only cookie or signed JWT.
  - `POST /api/v1/auth/logout`: clears auth cookie and invalidates session.
  - `GET /api/v1/auth/me`: returns authenticated user profile and permissions.
  - Rate limiting on login endpoint to prevent brute-force attacks.

### T-011: Role & Resource Authorization Middleware
- **Requirement:** FR-01, Section 7
- **Status:** DONE
- **Dependencies:** T-010
- **Affected Files:** `apps/api/src/middleware/auth.ts`, `apps/api/src/middleware/rbac.ts`
- **Acceptance Criteria:**
  - Roles supported: `ADMIN`, `TEACHER`, `STUDENT`.
  - Teachers restricted to assigned classes and subjects.
  - Students restricted to their own profile and attendance records.
  - Forbidden actions return 403 with standard error shape.

### T-012: Student Self-Registration & Admin Approval Workflow
- **Requirement:** FR-03, ADR-004
- **Status:** DONE
- **Dependencies:** T-010, T-011
- **Affected Files:** `apps/api/src/modules/students/*`, `apps/web/src/features/auth/*`, `apps/web/src/app/register/page.tsx`
- **Acceptance Criteria:**
  - Public `POST /api/v1/auth/register` creates student account with status `PENDING`.
  - Pending accounts cannot log in for attendance or enroll biometrics.
  - Admin endpoint `POST /api/v1/students/:id/approve` transitions status to `ACTIVE`.
  - Audit log entry recorded on approval.

---

## Phase 4 — Academic Structure Management

### T-020: Department, Academic Year & Semester Management
- **Requirement:** FR-05, ADR-003
- **Status:** NOT_STARTED
- **Dependencies:** T-011
- **Affected Files:** `apps/api/src/modules/academic/*`, `apps/web/src/features/academic/*`
- **Acceptance Criteria:**
  - Full validated CRUD for Departments and Academic Years.
  - Active/inactive state management with soft-archival.
  - Filterable, paginated tables in frontend UI.

### T-021: Classes, Divisions & Subjects Management
- **Requirement:** FR-05
- **Status:** NOT_STARTED
- **Dependencies:** T-020
- **Affected Files:** `apps/api/src/modules/academic/*`, `apps/web/src/features/academic/*`
- **Acceptance Criteria:**
  - Classes associated with Department, Academic Year, Semester, and Division.
  - Subjects associated with Department.
  - Validation prevents orphan classes and duplicate division codes.

### T-022: Teacher Assignment & Timetable Management
- **Requirement:** FR-05, FR-06
- **Status:** NOT_STARTED
- **Dependencies:** T-021
- **Affected Files:** `apps/api/src/modules/timetable/*`, `apps/web/src/features/timetable/*`
- **Acceptance Criteria:**
  - Assign teachers to Class-Subject pairs.
  - Create weekly timetable entries (day of week, start time, end time, room).
  - Validation prevents schedule overlaps for teachers and classes.

---

## Phase 5 — Face Recognition Technical Spike & Adapter

### T-030: Human Library Technical Spike
- **Requirement:** Section 6 (Phase 5), `docs/FACE_RECOGNITION.md`, ADR-006
- **Status:** NOT_STARTED
- **Dependencies:** T-001, T-002
- **Affected Files:** `packages/recognition-spike/*`, `docs/DECISIONS.md`
- **Acceptance Criteria:**
  - Verified `@vladmandic/human` package loading and model licensing.
  - Measured latency, memory, descriptor size, and recognition thresholds.
  - Documented decision and metrics in `docs/DECISIONS.md`.

### T-031: Face Recognition Provider Abstraction
- **Requirement:** FR-07, Section 7
- **Status:** NOT_STARTED
- **Dependencies:** T-030
- **Affected Files:** `apps/api/src/modules/recognition/provider.interface.ts`, `apps/api/src/modules/recognition/human.provider.ts`
- **Acceptance Criteria:**
  - Provider interface defining `extractDescriptors()`, `matchFace()`, `compareDescriptors()`.
  - Provider swappable without touching core attendance services.

---

## Phase 6 — Consent & Face Enrollment

### T-032: Consent Lifecycle & Biometric Enrollment
- **Requirement:** FR-04, ADR-005, `docs/SECURITY.md`
- **Status:** NOT_STARTED
- **Dependencies:** T-012, T-031
- **Affected Files:** `apps/api/src/modules/enrollment/*`, `apps/web/src/features/enrollment/*`
- **Acceptance Criteria:**
  - Consent recorded with timestamp and version before camera access.
  - Webcam capture generates face embeddings/descriptors.
  - Raw images are discarded in memory and NEVER saved or logged.
  - Authorized biometric deletion endpoint deletes descriptors (`DELETE /api/v1/students/:id/face-enrollment`).

---

## Phase 7 — Lecture Sessions & Attendance Engine

### T-033: Lecture Session Lifecycle
- **Requirement:** FR-06, ADR-007
- **Status:** NOT_STARTED
- **Dependencies:** T-022
- **Affected Files:** `apps/api/src/modules/sessions/*`, `apps/web/src/features/sessions/*`
- **Acceptance Criteria:**
  - Teachers create or start sessions for assigned timetable entries.
  - Session status transitions: `SCHEDULED` $\rightarrow$ `ACTIVE` $\rightarrow$ `COMPLETED` / `CANCELLED`.
  - Non-assigned teachers cannot open or modify sessions.

### T-034: Transactional Attendance Recording & Duplicate Prevention
- **Requirement:** FR-08, ADR-007, Section 7
- **Status:** NOT_STARTED
- **Dependencies:** T-033
- **Affected Files:** `apps/api/src/modules/attendance/*`, `apps/web/src/features/attendance/*`
- **Acceptance Criteria:**
  - Atomic database transactions for recording attendance.
  - Hard database uniqueness on `(studentId, sessionId)`.
  - Concurrent duplicate requests return idempotent `ALREADY_RECORDED` status.
  - Manual overrides by teachers require a reason and write an `AuditLog` entry.

---

## Phase 8 — Recognition-Assisted Attendance Workflow

### T-035: Real-time Camera Attendance & Ambiguity Handling
- **Requirement:** FR-07, FR-08
- **Status:** NOT_STARTED
- **Dependencies:** T-032, T-034
- **Affected Files:** `apps/web/src/features/attendance/components/LiveScanner.tsx`, `apps/api/src/modules/attendance/attendance.service.ts`
- **Acceptance Criteria:**
  - Teacher opens active session and starts live camera scanner.
  - Server verifies match against only students enrolled in that class/cohort.
  - Matches with confidence below threshold are flagged as UNCERTAIN.
  - Uncertain matches are presented to the teacher for manual confirmation.
  - No client-supplied student ID is accepted without server-side verification.

---

## Phase 9 — Reports, Analytics & Low-Attendance Alerts

### T-040: Dashboard Metrics & Charts
- **Requirement:** FR-09
- **Status:** NOT_STARTED
- **Dependencies:** T-034
- **Affected Files:** `apps/api/src/modules/reports/*`, `apps/web/src/features/dashboard/*`
- **Acceptance Criteria:**
  - Recharts visualizations: daily attendance trends, subject attendance breakdown.
  - Role-specific KPI cards (Admin: institutional stats; Teacher: class stats; Student: personal stats).

### T-041: Attendance Reports & CSV Export
- **Requirement:** FR-10
- **Status:** NOT_STARTED
- **Dependencies:** T-040
- **Affected Files:** `apps/api/src/modules/reports/*`, `apps/web/src/features/reports/*`
- **Acceptance Criteria:**
  - Filterable by date range, department, class, subject, and student.
  - Accurate attendance percentage calculation using centralized service.
  - Streaming CSV export endpoint with proper headers.

### T-042: Configurable Low-Attendance Alerts
- **Requirement:** FR-11
- **Status:** NOT_STARTED
- **Dependencies:** T-040
- **Affected Files:** `apps/api/src/modules/notifications/*`, `apps/web/src/features/notifications/*`
- **Acceptance Criteria:**
  - Configurable threshold setting (initial default: 75%).
  - Identifies students below threshold and creates notifications without duplicates.
  - Warning badges and visual indicators in student dashboard.

---

## Phase 10 — Release Hardening & Verification

### T-044: Security, Access Boundaries & Concurrency Verification
- **Requirement:** Section 11, Section 12
- **Status:** NOT_STARTED
- **Dependencies:** All previous tasks
- **Affected Files:** `apps/api/test/*`, `apps/web/test/*`
- **Acceptance Criteria:**
  - Integration tests for forbidden role access (Student attempting Teacher actions, Teacher attempting cross-class actions).
  - Concurrency tests verifying duplicate attendance protection.
  - Zero raw image retention verification.
  - Full build, typecheck, and test suite passing cleanly.
