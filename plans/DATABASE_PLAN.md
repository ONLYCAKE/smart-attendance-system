# Database Plan

1. Confirm institution/class/session domain model.
2. Define Prisma enums, models, relations, and deletion policies.
3. Define unique constraints and indexes.
4. Create initial migration.
5. Test migration against a clean PostgreSQL database.
6. Seed development-only demo data.
7. Add migrations incrementally; do not edit applied migrations.
8. Test attendance uniqueness, foreign keys, transaction rollback, and student deactivation.
9. Document backup and restore before deployment.

Required initial constraint: unique `(studentId, sessionId)` for attendance records.
