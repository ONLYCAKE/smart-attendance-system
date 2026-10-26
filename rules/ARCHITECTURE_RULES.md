# Architecture Rules

- Keep frontend and backend separate.
- Never access PostgreSQL directly from the frontend.
- Keep Next.js page files focused on composition and route-level behavior.
- Put feature UI in `features/<feature>/components`.
- Put API transport in feature services/shared API client.
- Put reusable stateful behavior in hooks where appropriate.
- Backend controllers handle HTTP; services handle business rules.
- Use Prisma for persistence; repositories are optional, not mandatory.
- Keep face recognition behind a provider adapter.
- Avoid circular dependencies and cross-feature internal imports where public exports exist.
- Do not introduce abstractions without a concrete use case.
