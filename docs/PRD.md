# Product Requirements Document (PRD)

## 1. Document control
- Product: Smart Attendance Management System Using Face Recognition
- Version: 1.0 baseline
- Status: Locked baseline; changes require a documented decision
- Audience: Project owner, developers, reviewers, AI coding agents

## 2. Product summary
A college-style web application for managing academic structure, student registration, face enrollment, timetable-based lecture sessions, face-assisted attendance, reports, and low-attendance alerts. Attendance is recorded per student per specific lecture session, not merely per day.

## 3. Problem
Manual roll calls and paper registers consume class time, require repetitive calculations, and make subject-wise reporting difficult. The system aims to streamline recording and reporting while preserving teacher oversight and auditable corrections.

## 4. Goals
1. Register and manage students and staff.
2. Model departments, academic years, semesters, divisions/classes, subjects, teacher assignments, and timetables.
3. Enroll student face descriptors with consent.
4. Recognize enrolled students during a scheduled lecture session.
5. Record attendance exactly once per student/session.
6. Provide student-wise, subject-wise, class-wise, and date-range reporting.
7. Maintain authorization, privacy, auditability, and maintainable modular code.

## 5. Locked decisions
### Academic structure
Use a configurable structure: Institution → Department → Academic Year → Semester → Division/Class → Subject → Timetable Entry → Attendance Session. Do not hard-code a particular college's department names, semester count, or division names. A student belongs to a configured academic cohort/class for the applicable academic year.

### Registration policy
- Admin/authorized staff can create student profiles.
- Student self-registration is enabled as an optional public workflow in the first release.
- Self-registered accounts remain `PENDING` until approved by an administrator.
- Face enrollment and attendance eligibility require an approved, active student record.
- Students cannot mark their own attendance manually.

### Biometric data policy
- Obtain informed consent before face enrollment.
- The initial release stores face descriptors/embeddings, not retained enrollment photographs.
- Process camera frames in memory and discard them after descriptor extraction unless a separately approved debugging workflow explicitly requires otherwise.
- Restrict descriptors to authorized backend operations; never expose other students' descriptors through APIs.
- Provide an authorized deletion workflow for descriptors when consent is withdrawn or the student is deactivated/removed, subject to applicable institutional record-retention obligations.
- Do not log raw images, descriptors, or other biometric material.
- Document the chosen model and license before deployment.

### Recognition engine
- First candidate: Human JavaScript face analysis library.
- Gate: implement a small technical spike before full feature development. Verify current package compatibility, supported runtime, model-file licensing, browser support, recognition quality on test volunteers, latency, and deployment constraints.
- Fallback: self-hosted CompreFace if the spike fails; document the evidence and decision in `docs/DECISIONS.md`.
- Basic recognition is not liveness detection. The first release must not claim spoof-proof attendance.

### Attendance policy
- Attendance is tied to an explicit lecture/session with class, subject, assigned teacher, date/time, and status.
- One attendance record per student per session, enforced by a PostgreSQL unique constraint.
- Unknown or ambiguous face matches do not automatically mark attendance.
- A teacher can review results and make authorized corrections; all corrections are audited.
- Store timestamps in UTC and display them in the institution's configured timezone.

### Authentication
- Use secure, HTTP-only cookies for browser authentication where practical, with appropriate `Secure`, `SameSite`, expiry, CSRF protections where applicable, and server-side authorization. Never store long-lived authentication secrets in localStorage.
- Passwords are stored only as strong hashes.
- Enforce role and resource-level authorization in the backend.

## 6. User roles
### Administrator
Manage users, student approvals, academic structure, teacher assignments, settings, reports, biometric deletion requests, and audit logs.

### Teacher
Access assigned classes and subjects, view timetable, start/close authorized sessions, use face recognition, review attendance, make authorized corrections, and view reports for assigned classes.

### Student
Self-register or sign in after approval, view their own profile and attendance, complete consent-based face enrollment when permitted, and see subject-wise percentages and low-attendance alerts. Students cannot edit attendance.

## 7. Functional requirements
### FR-01 Authentication and access
Secure login/logout, password hashing, protected routes, role/resource permissions, account status checks, and safe error responses.

### FR-02 Student management
Create/update/view/deactivate student records; validate required fields; enforce roll-number uniqueness in the configured scope; search/filter/paginate; preserve historical attendance on deactivation.

### FR-03 Student self-registration
Collect minimum required profile information; create pending status; require admin approval before enrollment or attendance eligibility; prevent duplicate accounts.

### FR-04 Face enrollment
Capture suitable samples using a webcam, extract descriptors, store enrollment status/model version, support re-enrollment and authorized deletion, and handle camera/model failures clearly.

### FR-05 Academic management
Configure departments, academic years, semesters, divisions/classes, subjects, teacher assignments, and timetable entries.

### FR-06 Sessions
Create and manage scheduled/in-progress/closed lecture sessions. Validate teacher assignment and session timing. Prevent invalid or conflicting operations according to documented rules.

### FR-07 Recognition
Detect face(s), generate descriptors, compare against eligible enrolled students, apply a calibrated threshold and ambiguity margin, show results, and reject unknown/ambiguous cases. Keep recognition engine behind an adapter so it can be replaced.

### FR-08 Attendance
Record recognized attendance for the selected session; enforce uniqueness `(student_id, session_id)`; record method and timestamp; support authorized correction with audit; never treat a client-provided student ID as identity proof.

### FR-09 Dashboard
Show authorized totals, scheduled sessions, attendance summaries, recent activity, and low-attendance summaries. Derive metrics from database records.

### FR-10 Reports
Filter by student, department, class, subject, session, and date range. Calculate subject-wise and overall percentages. Export filtered results to CSV; Excel export may be included if time permits.

### FR-11 Low-attendance alerts
Use a configurable threshold, defaulting to 75% for the project demonstration. Clearly label this as a configurable institutional setting, not a universal policy. Avoid duplicate unresolved notifications.

### FR-12 Audit
Record actor, action, affected entity, timestamp, and non-sensitive change details for important administrative changes and attendance corrections. Never log secrets or biometric material.

## 8. Non-functional requirements
- TypeScript in frontend and backend.
- Feature-based modules with clear responsibilities.
- Responsive desktop/tablet/mobile UI.
- Accessible labels, keyboard support, adequate contrast, and reduced-motion support.
- Pagination and appropriate database indexes.
- Consistent API error format and server-side validation.
- Unit/integration tests for attendance rules, authorization, and critical services.
- Migrations for database schema changes.
- No unsupported claims about recognition accuracy or liveness.
- Document performance targets after the recognition spike on target hardware.

## 9. Technology stack
- Next.js App Router, React, TypeScript
- Tailwind CSS, shadcn/ui, selective React Bits
- Geist Sans
- Axios, React Hook Form, Zod
- TanStack Table, Recharts
- Node.js, Express, TypeScript
- PostgreSQL, Prisma ORM
- Human as the first recognition candidate, with a technical-spike gate and CompreFace fallback

## 10. Core entities
User, Student, Department, AcademicYear, Class/Cohort, Subject, TeacherAssignment, TimetableEntry, AttendanceSession, AttendanceRecord, FaceEnrollment, Notification, AuditLog.

See `DATABASE_DESIGN.md` for constraints and proposed relationships.

## 11. Acceptance criteria
1. Users can sign in and only access permitted resources.
2. Student registration, approval, and management work.
3. Approved students can enroll face descriptors with consent.
4. Classes, subjects, teacher assignments, timetables, and sessions can be managed.
5. Teachers can start only authorized sessions.
6. A registered student can be recognized under tested conditions.
7. Unknown/ambiguous matches are rejected for automatic marking.
8. Duplicate student/session attendance is prevented by a database constraint.
9. Subject-wise and overall attendance calculations are correct against test fixtures.
10. Reports can be filtered and exported.
11. Manual corrections are authorized and audited.
12. Critical API, database, recognition integration, and permission paths have automated tests.
13. Camera, network, and database errors have useful failure states.
14. Setup, migration, testing, and environment instructions are documented.

## 12. Out of scope
Native mobile apps, multi-tenant SaaS, fee/payroll management, advanced behavioral analytics, custom model training, and production-grade anti-spoofing in the first release.

## 13. Definition of done
Acceptance criteria met; server validation and authorization in place; relevant tests pass; loading/empty/error/success states handled; migrations committed; docs updated; no unrelated refactor; limitations disclosed.
