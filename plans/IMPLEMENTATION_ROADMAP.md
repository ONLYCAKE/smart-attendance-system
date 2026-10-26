# Implementation Roadmap

Implement in dependency order:

1. Repository, environment, lint/type-check, frontend/backend boot.
2. PostgreSQL, Prisma schema baseline, migration workflow.
3. Shared UI shell and API client.
4. Authentication and authorization.
5. Student registration, approval, and management.
6. Department/class/semester/division/subject configuration.
7. Teacher assignments and timetable.
8. Recognition engine technical spike.
9. Face enrollment and deletion.
10. Session lifecycle.
11. Face recognition integration.
12. Transactional attendance recording and duplicate prevention.
13. Attendance history, reports, exports, and alerts.
14. Student portal.
15. Security, accessibility, performance, and release testing.

Do not parallelize work with unresolved shared contracts. Agree on schema and API contracts before frontend/backend work that depends on them.
