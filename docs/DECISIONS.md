# Architecture Decision Log

## ADR-001: PostgreSQL and Prisma
**Status:** Accepted  
**Decision:** Use PostgreSQL with Prisma.  
**Reason:** Academic classes, subjects, assignments, sessions, students, and attendance have relational integrity needs. Unique constraints and transactions are important for attendance correctness.

## ADR-002: Next.js frontend and Express backend
**Status:** Accepted  
**Decision:** Keep Next.js and Express as separate applications in one repository.  
**Reason:** Clear separation of UI and backend API responsibilities, reusable frontend layouts, and modular backend services.

## ADR-003: Academic structure
**Status:** Accepted  
**Decision:** Use configurable institution → department → academic year → semester → division/class → subject → timetable/session structure.  
**Reason:** Avoid hard-coding one college's academic labels.

## ADR-004: Student self-registration
**Status:** Accepted  
**Decision:** Allow self-registration as a pending request; admin approval is required before face enrollment and attendance eligibility.  
**Reason:** Allows convenient onboarding without granting unverified accounts attendance access.

## ADR-005: Biometric retention
**Status:** Accepted baseline  
**Decision:** Store descriptors/provider enrollment references, not raw enrollment images by default; require consent and provide deletion.  
**Reason:** Data minimization. Institutional/legal retention obligations must still be checked before deployment.

## ADR-006: Recognition engine
**Status:** Conditional  
**Decision:** Evaluate Human as first candidate; use self-hosted CompreFace if the spike fails.  
**Reason:** Keep the recognition provider replaceable and validate package/model/runtime fit before building dependent features.  
**Exit criteria:** See `docs/FACE_RECOGNITION.md`.

## ADR-007: Lecture-based attendance
**Status:** Accepted  
**Decision:** Every attendance record belongs to a specific session; unique student/session pair.  
**Reason:** College attendance is recorded separately for each lecture/subject session.
