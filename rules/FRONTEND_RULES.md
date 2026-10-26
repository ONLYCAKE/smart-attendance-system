# Frontend Rules

- Use Next.js App Router conventions.
- Use Server Components by default; add Client Components only for interactivity, browser APIs, or client state.
- Keep camera/webcam code in client components/hooks and clean up media tracks.
- Use shadcn/ui as the base for accessible primitives.
- Use React Bits selectively; support reduced motion.
- Use Geist Sans consistently.
- Keep page files thin and feature-based.
- Use React Hook Form and Zod for substantial forms.
- Use the configured Axios client; do not scatter base URLs or token logic.
- Handle loading, empty, error, and success states.
- Do not place secrets in client bundles.
- Avoid storing long-lived auth tokens in localStorage.
