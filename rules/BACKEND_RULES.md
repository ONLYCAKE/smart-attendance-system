# Backend Rules

- Validate body, params, and query on every endpoint.
- Authenticate and authorize on the server.
- Check resource ownership/assignment, not just role names.
- Keep controllers thin and services testable.
- Use consistent response and error formats.
- Do not expose stack traces or sensitive fields.
- Apply rate limits and request-size limits where appropriate.
- Use transactions for multi-step attendance writes.
- Treat face descriptors and recognition results from clients as untrusted input.
- Do not claim a face match proves liveness.
