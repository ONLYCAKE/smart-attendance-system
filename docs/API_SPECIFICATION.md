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
| `POST` | `/attendance-sessions/:id/recognize` | Assigned Teacher | Submits detected face descriptors from webcam frame. Server verifies against only students enrolled in this session's class. Automatically marks confident matches; flags ambiguous matches for review. |
| `POST` | `/attendance-sessions/:id/records` | Assigned Teacher, Admin | Manually marks single or batch student attendance (`PRESENT`, `ABSENT`, `LATE`, `EXCUSED`). |

### Attendance Records (`/attendance-records`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/attendance-records` | Admin, Assigned Teacher, Student (Self Only) | Query params: `sessionId`, `studentId`, `classId`, `subjectId`, `from`, `to`. Students can only query their own records. |
| `PATCH` | `/attendance-records/:id` | Assigned Teacher, Admin | Corrects an attendance record. Requires `status` and `correctionReason`. Emits an audit log. |

---

## 7. Reports, Analytics & Settings

### Reports (`/reports`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/reports/dashboard` | Admin, Teacher, Student | Role-scoped KPI metrics. Admin: institution stats; Teacher: class/subject stats; Student: personal stats. |
| `GET` | `/reports/attendance` | Admin, Teacher | Aggregated subject-wise and class-wise attendance percentages. |
| `GET` | `/reports/attendance/export` | Admin, Teacher | Exports filtered attendance reports to CSV format. |

### Settings (`/settings`)
| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/settings` | Admin | Returns system configuration settings (e.g., `LOW_ATTENDANCE_THRESHOLD_PERCENT`, `TIMEZONE`). |
| `PATCH` | `/settings` | Admin | Updates configurable settings. Default threshold: 75%. |
