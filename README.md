# Smart Attendance Management System

This repository pack contains the locked baseline requirements and AI-assisted development governance for the college-style face-recognition attendance project.

## Locked stack
- Frontend: Next.js App Router + React + TypeScript
- UI: Tailwind CSS + shadcn/ui + React Bits (selective use)
- Font: Geist Sans
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma ORM
- API client: Axios
- Forms/validation: React Hook Form + Zod
- Tables/charts: TanStack Table + Recharts

## Important implementation gate
The recognition engine is provisionally locked to **Human (JavaScript face analysis library)** for a short technical spike. Do not build the full application around it until the spike confirms package maintenance/compatibility, model licensing, webcam performance, and recognition behavior. If it fails, evaluate self-hosted CompreFace as the approved fallback and document the decision in `docs/DECISIONS.md`.

## Developer Commands
For a complete single-source reference of all development, database, migration, seeding, testing, typechecking, and build commands, see **[COMMANDS.md](COMMANDS.md)**.

## Getting started
1. Check **[COMMANDS.md](COMMANDS.md)** for all commands to run, test, and build the application.
2. Read `AGENTS.md`.
3. Read `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, and `docs/FACE_RECOGNITION.md`.
4. Follow `plans/TASKS.md` for task verification records.

This is a documentation starter pack, not an application implementation. No production security or recognition accuracy claim is implied.
