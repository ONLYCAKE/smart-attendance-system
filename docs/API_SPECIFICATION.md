# API Specification (V1 Contract)

Base path: `/api/v1`

## 1. Conventions & Standards

- **Transport**: JSON over HTTPS.
- **Authentication**: Secure, HTTP-Only Cookie (`session_token`) or Bearer JWT header.
- **Success Response Shape**:
  ```json
  {
    "success": true,
    "data": { ... },
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 100,
      "totalPages": 5
    }
  }
  ```
- **Error Response Shape**:
  ```json
  {
    "error": {
      "code": "VALIDATION_ERROR",
      "message": "Invalid request payload",
      "details": [
        { "field": "email", "message": "Invalid email address" }
      ]
    }
  }
  ```
- **Standard HTTP Codes**:
  - `200 OK`: Request succeeded.
  - `201 Created`: Resource successfully created.
  - `400 Bad Request`: Input validation failed.
  - `401 Unauthorized`: Missing or invalid credentials.
  - `403 Forbidden`: Authenticated user does not possess required role or resource permission.
  - `404 Not Found`: Target resource does not exist.
  - `409 Conflict`: Unique constraint violation or concurrency conflict (e.g., duplicate attendance).
  - `429 Too Many Requests`: Rate limit exceeded.
  - `500 Internal Server Error`: Generic server error (stack traces masked in production).

---

## 2. Authentication & Profile (`/auth`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/auth/login` | Public (Rate-limited) | Authenticates credentials, sets HTTP-only cookie, returns user info. |
| `POST` | `/auth/logout` | Authenticated | Clears session cookie and invalidates session token. |
| `GET` | `/auth/me` | Authenticated | Returns current authenticated user profile, role, and permissions. |
| `POST` | `/auth/register` | Public (Rate-limited) | Student self-registration. Creates a `PENDING` account requiring Admin approval. |

---

## 3. Student Management (`/students`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/students` | Admin, Teacher | Paginated list with search (`rollNumber`, `name`), `departmentId`, `classId`, `status`. |
| `POST` | `/students` | Admin | Manually creates and activates a student profile. |
| `GET` | `/students/:studentId` | Admin, Assigned Teacher, Student (Self) | Returns student profile and academic cohort details. |
| `PATCH` | `/students/:studentId` | Admin | Updates non-biometric student metadata (name, rollNumber, class). |
| `POST` | `/students/:studentId/approve` | Admin | Approves a `PENDING` self-registered student to `ACTIVE`. Logs audit record. |
| `POST` | `/students/:studentId/deactivate` | Admin | Soft-deactivates student. Preserves all historical attendance records. |

---

## 4. Academic Structure

### Departments (`/departments`)
- `GET /departments`: Public or Authenticated listing of active departments.
- `POST /departments`: Admin only. Creates department (`name`, `code`).
- `PATCH /departments/:id`: Admin only. Updates department info.
- `DELETE /departments/:id`: Admin only. Soft-deactivates department.

### Academic Years (`/academic-years`)
- `GET /academic-years`: Lists configured academic periods (e.g. "2025-2026").
- `POST /academic-years`: Admin only. Creates year (`label`, `startDate`, `endDate`).
- `PATCH /academic-years/:id`: Admin only. Updates period dates or active state.

### Classes & Cohorts (`/classes`)
- `GET /classes`: Filtered by `departmentId`, `academicYearId`.
- `POST /classes`: Admin only. Creates class division (`departmentId`, `academicYearId`, `semesterNumber`, `division`, `label`).
- `GET /classes/:id`: Returns class details and roster count.

### Subjects (`/subjects`)
- `GET /subjects`: Filtered by `departmentId`.
- `POST /subjects`: Admin only. Creates subject (`code`, `name`, `departmentId`).
- `PATCH /subjects/:id`: Admin only. Updates subject.

### Teacher Assignments (`/teacher-assignments`)
- `GET /teacher-assignments`: Filtered by `teacherUserId`, `classId`, `subjectId`.
- `POST /teacher-assignments`: Admin only. Assigns a teacher to a specific Class and Subject.
- `DELETE /teacher-assignments/:id`: Admin only. Removes teacher assignment.

### Timetable (`/timetable`)
- `GET /timetable`: Filtered by `classId` or `teacherUserId`.
- `POST /timetable`: Admin only. Creates weekly timetable entry (`dayOfWeek`, `startTime`, `endTime`, `room`, `teacherAssignmentId`).
- `DELETE /timetable/:id`: Admin only. Removes schedule entry.

---

## 5. Biometric Face Enrollment (`/students/:studentId/face-enrollment`)

*Security Rule: Biometric descriptors are never returned in general student list or detail endpoints.*

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/students/:id/face-enrollment` | Admin, Student (Self, Active Only) | Submits extracted face descriptors with explicit consent version and timestamp. Requires active approved student. |
| `GET` | `/students/:id/face-enrollment/status` | Admin, Student (Self) | Returns enrollment metadata (`status`, `provider`, `modelVersion`, `consentedAt`) without descriptors. |
| `POST` | `/students/:id/face-enrollment/revoke` | Admin, Student (Self) | Revokes consent, deactivating recognition eligibility without deleting history. |
| `DELETE` | `/students/:id/face-enrollment` | Admin, Student (Self) | Permanently deletes biometric descriptor embedding data. Logs audit record. |

---

## 6. Attendance Sessions & Records

### Sessions (`/attendance-sessions`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `POST` | `/attendance-sessions` | Assigned Teacher, Admin | Creates a session for an assigned class and subject. |
| `GET` | `/attendance-sessions` | Admin, Assigned Teacher | Filtered by `classId`, `subjectId`, `status`, `dateRange`. |
| `GET` | `/attendance-sessions/:id` | Admin, Assigned Teacher | Returns session metadata, active status, and attendance tally. |
| `POST` | `/attendance-sessions/:id/start` | Assigned Teacher, Admin | Transitions session status from `SCHEDULED` to `ACTIVE`. |
| `POST` | `/attendance-sessions/:id/close` | Assigned Teacher, Admin | Transitions session status from `ACTIVE` to `COMPLETED`. |
| `POST` | `/attendance-sessions/:id/recognize` | Assigned Teacher | Submits detected face descriptors from webcam frame. Server verifies against only students enrolled in this session's class. Returns candidate identity and similarity score without writing attendance (recognition alone never marks attendance). |
| `POST` | `/attendance-sessions/:id/confirm-recognition` | Assigned Teacher | Explicitly confirms recognized student and records attendance (`FACE_RECOGNITION`). Protected by row locks, active consent checks, and manual record protection. |
| `POST` | `/attendance-sessions/:id/records` | Assigned Teacher, Admin | Manually marks single or batch student attendance (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`). |

### Attendance Records (`/attendance-records`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/attendance-records` | Admin, Assigned Teacher, Student (Self Only) | Query params: `sessionId`, `studentId`, `classId`, `subjectId`, `from`, `to`. Students can only query their own records. |
| `PATCH` | `/attendance-records/:id` | Assigned Teacher, Admin | Controlled attendance correction. Requires `status` and mandatory `correctionReason` (>= 5 chars). Permitted on active and completed sessions; forbidden on cancelled sessions. Emits `ATTENDANCE_CORRECTED` audit log. (Also available at nested route `/attendance-sessions/records/:id`). |

---

## 7. Reports, Analytics & Settings

### Reports (`/reports`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/reports/student/me` | Student (Self Only) | Derives student identity strictly from authenticated session (`req.user.id`). Client-supplied student IDs are never accepted. Returns student profile, subject-wise percentage breakdown with $\ge 75\%$ threshold flags, overall attendance percentage (attended = `PRESENT` + `LATE`; denominator excludes cancelled sessions; returns `null` when 0 sessions held), and paginated history filterable by `subjectId`, `status`, `dateFrom`, `dateTo`. |
| `GET` | `/reports/teacher/attendance` | Assigned Teacher, Admin | Returns aggregate metrics (`totalStudents`, `totalSessionsHeld`, `classAveragePercentage`, `belowThresholdCount`) and paginated student-level breakdown. Query params: `classId` (required), `subjectId` (optional), `dateFrom`, `dateTo`, `search` (case-insensitive name/rollNumber), `page`, `limit`. Server verifies active teacher assignment for the requested class/subject unless actor is Admin (403 `FORBIDDEN` for unassigned classes). |
| `GET` | `/reports/admin/summary` | Admin Only | Institution-level attendance summary grouped by department and class cohorts. Query params: optional `departmentId`. Summary counts derive strictly from persisted records and active student cohorts; cancelled sessions are excluded from session denominators. Aggregations contain zero sensitive or biometric data. |
| `GET` | `/reports/dashboard` | Admin, Teacher, Student | Role-scoped KPI metrics and chart datasets. Query params: optional `days` (7-90, default 30), optional `classId`, optional `subjectId`. Student payload: personal attendance %, eligible sessions, standing (`GOOD_STANDING`, `BELOW_THRESHOLD`, `NO_SESSIONS`), daily attendance trend, subject breakdown, and recent activity. Teacher payload: assigned classes count, total students, conducted sessions, class average %, below-threshold count, daily trend, subject performance breakdown, and recent sessions (unassigned class filter rejected with 403 `CLASS_NOT_ASSIGNED`). Admin payload: institutional totals (departments, classes, active students, sessions held, overall average %, total at-risk students), daily trend line, and departmental distribution. Excludes cancelled sessions. |
| `GET` | `/reports/attendance` | Admin, Teacher | Aggregated subject-wise and class-wise attendance percentages. |
| `GET` | `/reports/student/me/export` | Student (Self Only) | Streams student personal attendance history as CSV. Student identity derived strictly from session (`req.user.id`). Query params: optional `subjectId`, `status`, `dateFrom`, `dateTo`. Columns: `Date, Session Time, Subject Code, Subject Name, Teacher, Status, Method, Marked At, Correction Reason`. Cancels and future scheduled sessions excluded. RFC 4180 escaped with formula injection protection and UTF-8 BOM. |
| `GET` | `/reports/teacher/attendance/export` | Assigned Teacher, Admin | Streams class attendance report as CSV. Query params: `classId` (required), `subjectId` (optional), `dateFrom`, `dateTo`, `search`, `format` (`roster` or `sessions`). Teachers restricted strictly to assigned classes (403 `FORBIDDEN` for unassigned classes); Admins authorized for all classes. `roster` format exports student totals, percentage, and standing; `sessions` format exports session-by-session records. Protected against CSV injection and buffered memory spikes. |
| `GET` | `/reports/admin/summary/export` | Admin Only | Streams institution-wide attendance summary grouped by department and class cohorts as CSV. Query params: optional `departmentId`, `academicYearId`, `dateFrom`, `dateTo`. Columns: `Department Code, Department Name, Class Label, Academic Year, Active Students, Total Sessions Held, Attended Count, Total Opportunities, Average Attendance %, Status`. |
| `GET` | `/reports/attendance/export` | Admin, Teacher | Exports filtered attendance reports to CSV format. Dispatches to class attendance export when `classId` is provided or to institution summary when called by Admin without `classId`. |

### Settings (`/settings`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/settings` | Admin, Teacher | Returns system configuration settings (e.g., `LOW_ATTENDANCE_THRESHOLD_PERCENT`, `TIMEZONE`). |
| `PATCH` | `/settings` | Admin Only | Updates configurable settings (e.g. `LOW_ATTENDANCE_THRESHOLD_PERCENT`, validated between 1.0 and 100.0). Writes `SETTING_UPDATED` audit record. Default threshold: 75.0%. |

---

## 8. Notifications & Low-Attendance Alerts (`/notifications`)

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/notifications/my` | Student (Self Only) | Returns personal low-attendance alerts and notifications for the authenticated student (`req.user.id`). Query params: optional `status` (`UNREAD`, `READ`, `RESOLVED`), `limit`. Returns array of notifications and status counts (`total`, `unread`, `read`, `resolved`). |
| `PATCH` | `/notifications/:id/read` | Student (Owner Only) | Marks an unread notification as `READ` and records `readAt`. Cross-student access rejected with 403 `FORBIDDEN`. |
| `PATCH` | `/notifications/:id/resolve` | Student (Owner Only) | Explicitly resolves/dismisses an alert (`RESOLVED`), recording `resolvedAt`. Cross-student access rejected with 403 `FORBIDDEN`. |
| `GET` | `/notifications/class/:classId` | Assigned Teacher, Admin | Returns all notifications issued for students enrolled in the specified class. Teachers authorized strictly for assigned classes (403 `CLASS_NOT_ASSIGNED` for unassigned classes); Admins authorized across all classes. Query params: optional `status`. |
| `POST` | `/notifications/evaluate` | Admin, Assigned Teacher | Triggers on-demand evaluation of attendance alert policy. Teachers may specify `classId` for assigned classes; Admins may evaluate a specific `classId` or omit `classId` for institution-wide evaluation. Adheres to stable deduplication (`dedupKey`), zero-sessions rule (no warning generated if 0 sessions held), and auto-resolves active warnings if student attendance has recovered to $\ge$ threshold. |

