# Database Design

## Database conventions
- PostgreSQL with Prisma.
- Use UUID or Prisma-supported generated identifiers consistently; decide the exact ID strategy before the first migration.
- Store timestamps in UTC.
- Use explicit foreign keys, unique constraints, and indexes.
- Prefer deactivation/soft deletion for students and users when history must remain.
- Never cascade-delete historical attendance accidentally.

## Proposed entities
### User
`id`, `name`, `email`, `passwordHash`, `role`, `status`, `createdAt`, `updatedAt`.

### Student
`id`, `userId` (optional/unique if student login is linked), `rollNumber`, `name`, `email`, `departmentId`, `academicYearId`, `classId`, `status`, timestamps.

### Department
`id`, `name`, `code`, `active`.

### AcademicYear
`id`, `label`, `startDate`, `endDate`, `active`.

### Class/Cohort
`id`, `departmentId`, `academicYearId`, `semesterNumber`, `division`, `label`, `active`.

### Subject
`id`, `code`, `name`, `departmentId`, `active`.

### TeacherAssignment
`id`, `teacherUserId`, `classId`, `subjectId`, `active`.

### TimetableEntry
`id`, `classId`, `subjectId`, `teacherAssignmentId`, `dayOfWeek`, `startTime`, `endTime`, `effectiveFrom`, `effectiveTo`, `room` (optional).

### AttendanceSession
`id`, `timetableEntryId` (optional for ad-hoc approved sessions), `classId`, `subjectId`, `teacherUserId`, `startsAt`, `endsAt`, `status`, `createdAt`, `closedAt`.

### FaceEnrollment
`id`, `studentId`, `provider`, `modelVersion`, `descriptors` or provider-specific enrollment reference, `status`, `consentedAt`, `enrolledAt`, `deletedAt`.

### AttendanceRecord
`id`, `studentId`, `sessionId`, `status`, `method`, `markedAt`, `markedByUserId` (nullable for system attribution), `correctionReason` (optional), timestamps.

### Notification
`id`, `studentId`, `type`, `message`, `status`, `createdAt`, `resolvedAt`.

### AuditLog
`id`, `actorUserId`, `action`, `entityType`, `entityId`, `metadata` (non-sensitive only), `createdAt`.

## Required constraints
- Unique roll number in the agreed institution scope.
- Unique user email where applicable.
- Unique `(studentId, sessionId)` on AttendanceRecord.
- Foreign keys for student/session/class/subject/teacher relationships.
- Validate session state and class membership in the service layer and transaction.
- Index attendance by session, student, and marked time; add other indexes based on query patterns.

## Important policy
Do not hard-delete a student if that would destroy attendance history. Deactivate the student and separately apply approved biometric-data deletion. Face descriptors are sensitive biometric data; restrict access and retention.
