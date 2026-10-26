# TypeScript Rules

- Enable strict TypeScript settings.
- Avoid `any`; use `unknown` and narrow it when input is untrusted.
- Define explicit request/response types at API boundaries.
- Validate runtime input; TypeScript types alone do not validate network data.
- Prefer discriminated unions for recognition and API result states.
- Avoid unsafe type assertions unless documented and justified.
- Keep frontend and backend contracts synchronized; introduce a shared package only when useful.
