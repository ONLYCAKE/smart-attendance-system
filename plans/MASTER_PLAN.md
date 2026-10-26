# Master Implementation Plan

## Principles
- Deliver working vertical slices.
- Do not start full recognition integration until the provider spike passes.
- Keep tasks small, testable, and traceable to PRD requirements.
- Do not implement unrelated refactors.
- Update this plan and `TASKS.md` as work progresses.

## Phase 0 — Requirements and project foundation
- [ ] Review PRD and open institutional policy questions.
- [ ] Create repository and project instruction files.
- [ ] Initialize Next.js frontend and Express backend.
- [ ] Configure TypeScript, linting, formatting, and environment validation.
- [ ] Set up PostgreSQL and Prisma.
- [ ] Establish API error and logging conventions.

## Phase 1 — UI foundation
- [ ] Configure Tailwind, shadcn/ui, Geist Sans, and Lucide.
- [ ] Create dashboard shell, sidebar, header, responsive navigation.
- [ ] Create shared table, form field, status badge, empty/loading/error states.
- [ ] Use React Bits selectively; respect reduced-motion preferences.

## Phase 2 — Authentication and student management
- [ ] Implement authentication and role/resource authorization.
- [ ] Implement pending self-registration and admin approval.
- [ ] Implement student CRUD and unique roll-number constraints.
- [ ] Add tests for access boundaries and validation.

## Phase 3 — Academic structure
- [ ] Departments and academic years.
- [ ] Classes, semesters, and divisions.
- [ ] Subjects and teacher assignments.
- [ ] Timetable entries and schedule validation.

## Phase 4 — Recognition spike
- [ ] Evaluate Human package and model licensing/runtime.
- [ ] Build isolated webcam and descriptor prototype.
- [ ] Test known, unknown, ambiguous, lighting, and latency cases.
- [ ] Record decision in `docs/DECISIONS.md`.
- [ ] If the spike fails, evaluate CompreFace before continuing.

## Phase 5 — Enrollment and attendance sessions
- [ ] Implement consent and face enrollment.
- [ ] Implement enrollment status and deletion.
- [ ] Implement session creation, start, close, and authorization.
- [ ] Implement recognition provider adapter.

## Phase 6 — Attendance engine
- [ ] Implement matching and uncertainty handling.
- [ ] Implement transactional attendance writes.
- [ ] Enforce unique student/session constraint.
- [ ] Implement authorized manual corrections and audit logs.
- [ ] Test concurrency and duplicate requests.

## Phase 7 — Reports and alerts
- [ ] Dashboard metrics and charts.
- [ ] Lecture-wise and subject-wise reports.
- [ ] CSV export and optional Excel export.
- [ ] Configurable low-attendance alerts.
- [ ] Student portal.

## Phase 8 — Release hardening
- [ ] Run unit, integration, and end-to-end tests.
- [ ] Verify access controls and data deletion behavior.
- [ ] Verify migrations from a clean database.
- [ ] Test responsive layout and accessibility.
- [ ] Document deployment, backup, and environment configuration.
- [ ] Review known limitations and demonstration plan.
