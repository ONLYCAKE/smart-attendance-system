# API Specification (Initial Contract)

Base path: `/api/v1`

## Conventions
- JSON request/response bodies.
- Consistent error shape: `{ "error": { "code": "...", "message": "...", "details": [] } }`.
- Validate all input on the server.
- Authenticate and authorize protected routes.
- Paginate list endpoints.
- Do not return face descriptors in general student-list/detail endpoints.

## Authentication
- `POST /auth/login`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /auth/register` (student self-registration; creates pending account)

## Students
- `GET /students`
- `POST /students`
- `GET /students/:studentId`
- `PATCH /students/:studentId`
- `POST /students/:studentId/approve`
- `POST /students/:studentId/deactivate`

## Academic structure
- `/departments`
- `/academic-years`
- `/classes`
- `/subjects`
- `/teacher-assignments`
- `/timetable`

## Face enrollment
- `POST /students/:studentId/face-enrollment`
- `GET /students/:studentId/face-enrollment/status`
- `DELETE /students/:studentId/face-enrollment`

Enrollment endpoints require permission checks, consent state, and approved active student status.

## Sessions and attendance
- `POST /attendance-sessions`
- `GET /attendance-sessions`
- `GET /attendance-sessions/:sessionId`
- `POST /attendance-sessions/:sessionId/start`
- `POST /attendance-sessions/:sessionId/close`
- `POST /attendance-sessions/:sessionId/recognize`
- `GET /attendance-records`
- `PATCH /attendance-records/:recordId` (authorized correction; reason required)

## Reports
- `GET /reports/dashboard`
- `GET /reports/attendance`
- `GET /reports/attendance/export`

The exact payload schemas and response examples must be written and tested alongside each module; do not assume these initial endpoint names are immutable if implementation reveals a justified improvement. Record changes in this document.
