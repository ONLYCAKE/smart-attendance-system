# AGENTS.md

## Project
Build the Smart Attendance Management System according to `docs/PRD.md`.

## Required context
Before changing code, read:
1. `docs/PRD.md`
2. `docs/ARCHITECTURE.md`
3. Relevant sections of `docs/DATABASE_DESIGN.md`, `docs/API_SPECIFICATION.md`, and `docs/SECURITY.md`
4. `plans/MASTER_PLAN.md` and the relevant task in `plans/TASKS.md`
5. `rules/GLOBAL_RULES.md`, plus relevant specialized rules
6. The relevant skill under `skills/`

## Locked architecture
- Frontend: Next.js App Router + React + TypeScript
- UI: Tailwind CSS, shadcn/ui, selective React Bits, Geist Sans
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma
- Face recognition: Human is the first candidate, subject to the documented technical spike; CompreFace is the fallback if the spike fails.

## Mandatory behavior
- Modify only files needed for the requested task.
- Avoid unrelated refactors and unnecessary abstractions.
- Reuse existing components, hooks, services, validation schemas, and utilities.
- Keep page composition, UI components, API clients, business services, and database access separate.
- Never access PostgreSQL directly from the frontend.
- Validate all inputs on the backend and authorize every protected operation server-side.
- Use Prisma migrations for schema changes.
- Do not trust a browser-supplied student ID or recognition result as proof of identity.
- Reject unknown and ambiguous matches; do not silently mark them present.
- Prevent duplicate attendance at the database level.
- Do not log passwords, tokens, raw face images, or biometric descriptors.
- Add/update tests for changed behavior and update docs when architecture or requirements change.

## Completion report
At the end of a task, report:
- Summary of behavior implemented
- Files changed
- Tests/checks actually run and their results
- Known limitations or unresolved risks
Do not claim success for checks that were not run.
