# Frontend Plan

## Structure
- `app/`: Next.js routes and layouts only.
- `components/ui/`: shadcn/ui primitives.
- `components/shared/`: generic reusable UI.
- `components/layout/`: sidebar, header, page shell.
- `features/<feature>/components/`: feature-specific components.
- `features/<feature>/hooks/`: stateful client behavior.
- `features/<feature>/services/`: API functions.
- `features/<feature>/schemas/`: form schemas.
- `lib/api-client.ts`: configured Axios instance.
- `lib/auth/`: frontend auth helpers appropriate to the chosen cookie flow.
- `types/`: shared types only where useful.

## Required UX states
Every data-driven screen must handle loading, empty, error, and success states. Forms need field-level errors and submission feedback. Camera views need permission denied, camera unavailable, model loading, no face, unknown face, ambiguous face, and success states.

## Reuse policy
Reuse components when behavior and semantics are shared. Avoid giant page components and avoid abstractions for one-off elements without a clear reuse case.

## Design
Use Geist Sans, consistent spacing, accessible color contrast, responsive layouts, reduced-motion support, shadcn/ui foundations, and React Bits selectively.
