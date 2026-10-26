# Testing Strategy

## Frontend
- Unit-test pure utilities and validation schemas.
- Component-test forms, tables, dialogs, camera states, and permission-aware UI.
- Test loading, empty, error, and success states.
- Add end-to-end coverage for core registration and attendance workflows.

## Backend
- Unit-test business services and attendance percentage calculations.
- Integration-test routes, middleware, Prisma operations, and database constraints.
- Test unauthenticated access and every role boundary.
- Test duplicate attendance requests and concurrent attempts.
- Test invalid/closed sessions, unapproved students, unknown matches, and ambiguous matches.
- Test manual correction audit events.

## Database
- Run migrations against a clean test database.
- Verify unique constraints and foreign keys.
- Verify deactivation does not destroy historical attendance.
- Test transactions and rollback behavior.

## Face recognition evaluation
- Use consented test volunteers and a documented evaluation set.
- Include registered faces, unknown faces, varied lighting/angles, and multiple-face frames.
- Measure false acceptance, false rejection, and latency.
- Do not tune a threshold only on one person's images.
- Do not claim production-grade accuracy based on a small demonstration.

## Release gate
Relevant tests, type checks, and lint checks must pass. Document any skipped checks and unresolved limitations.
