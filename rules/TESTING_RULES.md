# Testing Rules

- Add unit tests for business rules and pure utilities.
- Add integration tests for routes, permissions, and Prisma/database behavior.
- Test both allowed and denied access for every role/resource boundary.
- Test duplicate attendance and concurrent requests.
- Test unknown/ambiguous face results and closed sessions.
- Test calculation accuracy with fixed fixtures.
- Test error states for camera, model, network, and database failures.
- Run relevant tests, lint, and type checks; report skipped checks honestly.
