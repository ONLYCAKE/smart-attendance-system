# Database Rules

- Use PostgreSQL and Prisma.
- Every schema change requires a Prisma migration.
- Never rewrite a migration that has already been applied in a shared environment.
- Add foreign keys, unique constraints, and indexes based on invariants/query patterns.
- Enforce unique `(studentId, sessionId)` for attendance.
- Use transactions for attendance writes and related state changes.
- Store timestamps consistently in UTC.
- Preserve historical attendance when a student is deactivated.
- Never log or return sensitive biometric data from general queries.
- Test migrations against a clean database.
