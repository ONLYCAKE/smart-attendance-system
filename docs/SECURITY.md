# Security and Privacy Requirements

## Authentication
- Hash passwords using a modern password hashing algorithm such as Argon2id or bcrypt with suitable parameters.
- Prefer secure HTTP-only cookies for browser sessions/tokens.
- Set Secure and SameSite attributes appropriately in production.
- Address CSRF based on the chosen cookie/session architecture.
- Never place long-lived secrets in localStorage.
- Keep secrets out of source control; provide `.env.example` with placeholders only.

## Authorization
- Enforce role and resource-level permissions in Express middleware/services.
- Teachers can access only assigned classes, subjects, and sessions.
- Students can access only their own profile and attendance.
- Never rely on hidden buttons or client-side role checks as security controls.

## Input and API safety
- Validate every request body, query, and route parameter.
- Apply request-size limits, rate limits, secure headers, and safe error responses.
- Avoid leaking internal stack traces in production.
- Use least-privilege database credentials.

## Attendance integrity
- Enforce student/session uniqueness in PostgreSQL.
- Use transactions for recognition-to-attendance writes.
- Verify session status, student eligibility, class membership, and teacher authorization server-side.
- Audit manual corrections.

## Biometric privacy
- Obtain consent before enrollment.
- Minimize collection and retention.
- Restrict descriptor access and protect data in transit and at rest.
- Do not log or expose descriptors in general API responses.
- Provide a deletion workflow and document any legal/institutional retention obligations.
- Do not claim liveness or spoof resistance unless separately implemented and evaluated.
