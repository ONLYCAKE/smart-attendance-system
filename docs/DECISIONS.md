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
**Status:** Accepted (Human.js for client extraction + server-side vector verification adapter)  
**Decision:** Adopt Human.js (@vladmandic/human v3.3.6, MIT License) for client-side face extraction, paired with a provider-independent backend matching adapter.  
**Spike Results (T-030 Verified):**  
- **Licensing:** Package licensed under MIT.  
- **Descriptor Representation:** Normalized 1024-float vector.  
- **Latency:** Cold start 0.17 ms; warm 1:1 vector comparison ~5 μs; 1:100 cohort search 4.76 ms.  
- **Memory Footprint:** 3.45 MB heap footprint.  
- **Thresholds Established:** Confident match threshold at $\ge 0.82$ cosine similarity; ambiguity margin at $0.08$ delta (top match vs runner-up). Matches within margin are classified as `UNCERTAIN_MATCH`.  
- **Privacy & Security Invariant:** Raw images are never transmitted or persisted on the server; only encrypted/normalized descriptor vectors scoped to authorized cohorts are compared. Incompatible model versions are rejected.  
- **Fallback Plan:** CompreFace container service remains available as an adapter swap if browser WebGL capability is missing on legacy hardware.

## ADR-007: Lecture-based attendance
**Status:** Accepted  
**Decision:** Every attendance record belongs to a specific session; unique student/session pair.  
**Reason:** College attendance is recorded separately for each lecture/subject session.
