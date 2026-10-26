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

## Getting started
1. Read `AGENTS.md`.
2. Read `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE_DESIGN.md`, and `docs/FACE_RECOGNITION.md`.
3. Follow `plans/MASTER_PLAN.md` in order.
4. Treat `rules/` as mandatory project standards.
5. Use `skills/` as workflow playbooks; connect them to your coding agent's supported skill mechanism.

This is a documentation starter pack, not an application implementation. No production security or recognition accuracy claim is implied.
