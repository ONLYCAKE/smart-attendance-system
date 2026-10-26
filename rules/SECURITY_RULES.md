# Security Rules

- Hash passwords using a suitable modern password hashing algorithm.
- Use secure HTTP-only cookies where practical and configure CSRF defenses for cookie-based auth.
- Keep secrets in environment variables; `.env.example` contains placeholders only.
- Enforce resource-level authorization server-side on every protected operation.
- Rate-limit sensitive endpoints and validate all input.
- Do not log credentials, tokens, raw images, or face descriptors.
- Obtain consent before biometric enrollment and support authorized deletion.
- Restrict access to descriptors and minimize retention.
- Reject unknown and ambiguous matches.
- Audit manual attendance corrections.
- Do not claim spoof protection without implementing and evaluating liveness checks.
