# Backend Plan

## Module pattern
Each module may contain routes, controller, service, and validation schema. Keep the structure consistent without creating empty layers that add no value.

## Responsibilities
- Routes: URL and middleware composition.
- Middleware: authentication, authorization, validation, rate limits, error handling.
- Controllers: HTTP input/output.
- Services: business rules and orchestration.
- Prisma: persistence and transactions.

## First modules
1. auth
2. students
3. academic structure (departments, years, classes, subjects)
4. teacher assignments
5. timetable
6. face enrollment
7. attendance sessions
8. attendance records
9. reports
10. notifications and audit logs

## Required safeguards
Server-side validation, resource-level authorization, consistent errors, structured non-sensitive logs, request limits, database constraints, transactional attendance writes, and tests for critical rules.
