# Architecture

## Overview
Use a modular monorepo with independent frontend and backend applications.

- `frontend/`: Next.js App Router, React, TypeScript.
- `backend/`: Express REST API, TypeScript.
- PostgreSQL accessed only by the backend through Prisma.
- Face recognition is isolated behind a provider/adapter interface.

## Frontend layers
- `app/`: route files, layouts, loading/error boundaries; keep page files thin.
- `components/ui/`: shadcn/ui primitives.
- `components/shared/`: genuinely reusable UI components.
- `features/<feature>/components/`: feature-specific UI.
- `features/<feature>/hooks/`: feature-specific client behavior.
- `features/<feature>/services/`: feature API functions.
- `features/<feature>/schemas/`: form schemas.
- `lib/`: shared utilities and configured Axios client.
- `types/`: shared frontend contracts only where feature-local types are inappropriate.

## Backend layers
- Routes bind URLs and middleware.
- Middleware authenticates, authorizes, validates, and handles cross-cutting concerns.
- Controllers translate HTTP requests/responses.
- Services implement business rules and orchestration.
- Prisma is used for database access from services.
- A repository layer is optional; introduce it only when it improves testability or manages complex queries.

## Request flow
Next.js UI → feature hook/service → Express route → authentication/authorization/validation middleware → controller → service → Prisma → PostgreSQL.

## Face recognition flow
Camera capture → approved recognition provider extracts descriptor → backend verifies the active session and authorization → backend compares against eligible enrollment descriptors or calls the approved recognition service → backend rejects unknown/ambiguous matches → transactionally inserts attendance record → UI displays result.

Do not trust a browser-only match as a secure identity assertion. If browser extraction is used, treat submitted descriptors as untrusted input and validate matching on the backend. Do not expose all enrollment descriptors to every browser.

## Attendance invariants
- Every attendance record references a valid student and session.
- Unique `(student_id, session_id)`.
- Session must be active and the student eligible for its class.
- Teacher must be assigned/authorized for the session.
- Duplicate requests return an already-recorded result, not a second row.
- Manual corrections are audited.

## Design principles
- Feature-based modularity.
- Separation of UI, API transport, business logic, and persistence.
- Reuse existing abstractions before adding new ones.
- Avoid unrelated refactors.
- Make provider-specific recognition code replaceable.
