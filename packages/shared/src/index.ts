import { z } from "zod";

// --- Enums and Constant Contracts ---
export const UserRole = {
  ADMIN: "ADMIN",
  TEACHER: "TEACHER",
  STUDENT: "STUDENT",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const UserStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  SUSPENDED: "SUSPENDED",
} as const;
export type UserStatus = (typeof UserStatus)[keyof typeof UserStatus];

export const StudentStatus = {
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  GRADUATED: "GRADUATED",
} as const;
export type StudentStatus = (typeof StudentStatus)[keyof typeof StudentStatus];

export const SessionStatus = {
  SCHEDULED: "SCHEDULED",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type SessionStatus = (typeof SessionStatus)[keyof typeof SessionStatus];

export const AttendanceStatus = {
  PRESENT: "PRESENT",
  ABSENT: "ABSENT",
  LATE: "LATE",
  EXCUSED: "EXCUSED",
} as const;
export type AttendanceStatus = (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AttendanceMethod = {
  FACE_RECOGNITION: "FACE_RECOGNITION",
  MANUAL_TEACHER: "MANUAL_TEACHER",
  MANUAL_ADMIN: "MANUAL_ADMIN",
} as const;
export type AttendanceMethod = (typeof AttendanceMethod)[keyof typeof AttendanceMethod];

// --- Standard API Envelope Contracts ---
export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Array<{ field?: string; message: string }>;
  };
}

// --- Common Validation Schemas ---
export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type LoginInput = z.infer<typeof LoginSchema>;

export const StudentRegisterSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  rollNumber: z.string().optional(),
  departmentId: z.string().uuid("Please select a department"),
  academicYearId: z.string().uuid("Invalid academic year identifier").optional(),
  classId: z.string().uuid("Invalid class identifier").optional(),
});
export type StudentRegisterInput = z.infer<typeof StudentRegisterSchema>;

export const StudentListQuerySchema = z.object({
  search: z.string().optional(),
  departmentId: z.string().uuid().optional(),
  academicYearId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  status: z.enum(["PENDING", "ACTIVE", "INACTIVE", "GRADUATED", "ALL"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});
export type StudentListQueryInput = z.infer<typeof StudentListQuerySchema>;

export const DepartmentSchema = z.object({
  name: z.string().min(2, "Department name must be at least 2 characters"),
  code: z.string().min(2, "Department code must be at least 2 characters").toUpperCase(),
});
export type DepartmentInput = z.infer<typeof DepartmentSchema>;

export const DepartmentUpdateSchema = z.object({
  name: z.string().min(2, "Department name must be at least 2 characters").optional(),
  code: z.string().min(2, "Department code must be at least 2 characters").toUpperCase().optional(),
  active: z.boolean().optional(),
});
export type DepartmentUpdateInput = z.infer<typeof DepartmentUpdateSchema>;

export const AcademicYearSchema = z.object({
  label: z.string().min(4, "Academic year label required (e.g. 2025-2026)"),
  startDate: z.string().datetime("Invalid start date"),
  endDate: z.string().datetime("Invalid end date"),
});
export type AcademicYearInput = z.infer<typeof AcademicYearSchema>;

export const AcademicYearUpdateSchema = z.object({
  label: z.string().min(4, "Academic year label required (e.g. 2025-2026)").optional(),
  startDate: z.string().datetime("Invalid start date").optional(),
  endDate: z.string().datetime("Invalid end date").optional(),
  active: z.boolean().optional(),
});
export type AcademicYearUpdateInput = z.infer<typeof AcademicYearUpdateSchema>;

export const ClassSchema = z.object({
  departmentId: z.string().uuid("Invalid department ID"),
  academicYearId: z.string().uuid("Invalid academic year ID"),
  semesterNumber: z.number().int().min(1).max(12),
  division: z.string().min(1, "Division required (e.g. A, B)"),
  label: z.string().min(2, "Class label required"),
});
export type ClassInput = z.infer<typeof ClassSchema>;

export const ClassUpdateSchema = z.object({
  departmentId: z.string().uuid("Invalid department ID").optional(),
  academicYearId: z.string().uuid("Invalid academic year ID").optional(),
  semesterNumber: z.number().int().min(1).max(12).optional(),
  division: z.string().min(1, "Division required (e.g. A, B)").optional(),
  label: z.string().min(2, "Class label required").optional(),
  active: z.boolean().optional(),
});
export type ClassUpdateInput = z.infer<typeof ClassUpdateSchema>;

export const SubjectSchema = z.object({
  code: z.string().min(2, "Subject code required").toUpperCase().optional().or(z.literal("")),
  name: z.string().min(2, "Subject name required"),
  departmentId: z.string().uuid("Invalid department ID"),
});
export type SubjectInput = z.infer<typeof SubjectSchema>;

export const SubjectUpdateSchema = z.object({
  code: z.string().min(2, "Subject code required").toUpperCase().optional(),
  name: z.string().min(2, "Subject name required").optional(),
  departmentId: z.string().uuid("Invalid department ID").optional(),
  active: z.boolean().optional(),
});
export type SubjectUpdateInput = z.infer<typeof SubjectUpdateSchema>;

export const TeacherAssignmentSchema = z.object({
  teacherUserId: z.string().uuid("Invalid teacher user ID"),
  classId: z.string().uuid("Invalid class ID"),
  subjectId: z.string().uuid("Invalid subject ID"),
});
export type TeacherAssignmentInput = z.infer<typeof TeacherAssignmentSchema>;

export const TeacherAssignmentUpdateSchema = z.object({
  teacherUserId: z.string().uuid("Invalid teacher user ID").optional(),
  classId: z.string().uuid("Invalid class ID").optional(),
  subjectId: z.string().uuid("Invalid subject ID").optional(),
  active: z.boolean().optional(),
});
export type TeacherAssignmentUpdateInput = z.infer<typeof TeacherAssignmentUpdateSchema>;

export const TimetableEntrySchema = z.object({
  classId: z.string().uuid("Invalid class ID"),
  subjectId: z.string().uuid("Invalid subject ID"),
  teacherAssignmentId: z.string().uuid("Invalid teacher assignment ID"),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format must be HH:MM"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format must be HH:MM"),
  room: z.string().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});
export type TimetableEntryInput = z.infer<typeof TimetableEntrySchema>;

export const TimetableEntryUpdateSchema = z.object({
  classId: z.string().uuid("Invalid class ID").optional(),
  subjectId: z.string().uuid("Invalid subject ID").optional(),
  teacherAssignmentId: z.string().uuid("Invalid teacher assignment ID").optional(),
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format must be HH:MM").optional(),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format must be HH:MM").optional(),
  room: z.string().optional(),
  effectiveFrom: z.string().datetime().optional(),
  effectiveTo: z.string().datetime().optional(),
});
export type TimetableEntryUpdateInput = z.infer<typeof TimetableEntryUpdateSchema>;

export const SessionCreateSchema = z.object({
  timetableEntryId: z.string().uuid("Invalid timetable entry ID").optional(),
  classId: z.string().uuid("Invalid class ID").optional(),
  subjectId: z.string().uuid("Invalid subject ID").optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type SessionCreateInput = z.infer<typeof SessionCreateSchema>;

export const RepresentativeConsentSchema = z.object({
  legalBasis: z.string().min(3, "Legal basis required"),
  documentReference: z.string().min(3, "Document reference required"),
  guardianName: z.string().optional(),
});
export type RepresentativeConsentInput = z.infer<typeof RepresentativeConsentSchema>;

export const BiometricConsentSchema = z.object({
  agreed: z.boolean(),
  consentVersion: z.string().default("1.0"),
  revocationReason: z.string().optional(),
  representativeConsent: RepresentativeConsentSchema.optional(),
});
export type BiometricConsentInput = z.infer<typeof BiometricConsentSchema>;

export const FaceEnrollmentSubmitSchema = z.object({
  consentVersion: z.string().default("1.0"),
  modelVersion: z.string().default("faceres-v1"),
  provider: z.string().default("human"),
  descriptor: z.array(z.number()).min(64).optional(),
  descriptors: z.union([z.array(z.number()), z.string()]).optional(),
});
export type FaceEnrollmentSubmitInput = z.infer<typeof FaceEnrollmentSubmitSchema>;

export const FaceRecognitionRecognizeSchema = z.object({
  descriptor: z.array(z.number()).min(64, "Descriptor vector must contain numeric floats"),
});
export type FaceRecognitionRecognizeInput = z.infer<typeof FaceRecognitionRecognizeSchema>;

export const SessionFaceRecognizeSchema = z.object({
  provider: z.string().default("human"),
  modelVersion: z.string().default("faceres-v1"),
  descriptor: z.array(z.number()).min(64, "Descriptor vector must contain numeric floats"),
});
export type SessionFaceRecognizeInput = z.infer<typeof SessionFaceRecognizeSchema>;

export const SessionConfirmRecognitionSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  confidence: z.number().min(0).max(1),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
  teacherConfirmed: z.boolean().default(true),
  overrideReason: z.string().optional(),
});
export type SessionConfirmRecognitionInput = z.infer<typeof SessionConfirmRecognitionSchema>;

export const AttendanceMarkSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
  method: z.nativeEnum(AttendanceMethod).default(AttendanceMethod.FACE_RECOGNITION),
  confidence: z.number().min(0).max(1).optional(),
  overrideReason: z.string().optional(),
});
export type AttendanceMarkInput = z.infer<typeof AttendanceMarkSchema>;

export const BatchAttendanceMarkSchema = z.object({
  records: z.array(AttendanceMarkSchema).min(1, "At least one attendance record is required"),
});
export type BatchAttendanceMarkInput = z.infer<typeof BatchAttendanceMarkSchema>;

export const AttendanceCorrectionSchema = z.object({
  status: z.nativeEnum(AttendanceStatus),
  correctionReason: z.string().min(5, "Correction reason must be at least 5 characters"),
});
export type AttendanceCorrectionInput = z.infer<typeof AttendanceCorrectionSchema>;

export const SystemSettingsUpdateSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});
export type SystemSettingsUpdateInput = z.infer<typeof SystemSettingsUpdateSchema>;

export const NotificationStatus = {
  UNREAD: "UNREAD",
  READ: "READ",
  RESOLVED: "RESOLVED",
} as const;
export type NotificationStatus = (typeof NotificationStatus)[keyof typeof NotificationStatus];

export const NotificationType = {
  LOW_ATTENDANCE: "LOW_ATTENDANCE",
  CONSENT_REMINDER: "CONSENT_REMINDER",
  SYSTEM: "SYSTEM",
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const NotificationQuerySchema = z.object({
  status: z.enum(["UNREAD", "READ", "RESOLVED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type NotificationQuery = z.infer<typeof NotificationQuerySchema>;

export const EvaluateAlertsInputSchema = z.object({
  classId: z.string().uuid("Invalid class ID").optional(),
  studentId: z.string().uuid("Invalid student ID").optional(),
});
export type EvaluateAlertsInput = z.infer<typeof EvaluateAlertsInputSchema>;

export const StudentReportQuerySchema = z.object({
  subjectId: z.string().uuid("Invalid subject ID").optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type StudentReportQuery = z.infer<typeof StudentReportQuerySchema>;

export const TeacherReportQuerySchema = z.object({
  classId: z.string().uuid("Class ID is required"),
  subjectId: z.string().uuid("Invalid subject ID").optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type TeacherReportQuery = z.infer<typeof TeacherReportQuerySchema>;

export const AdminSummaryQuerySchema = z.object({
  departmentId: z.string().uuid("Invalid department ID").optional(),
  academicYearId: z.string().uuid("Invalid academic year ID").optional(),
});
export type AdminSummaryQuery = z.infer<typeof AdminSummaryQuerySchema>;

export const DashboardQuerySchema = z.object({
  days: z.coerce.number().int().min(7).max(90).optional().default(30),
  classId: z.string().uuid("Invalid class ID").optional(),
  subjectId: z.string().uuid("Invalid subject ID").optional(),
});
export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;

export const StudentExportQuerySchema = z.object({
  subjectId: z.string().uuid("Invalid subject ID").optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  status: z.nativeEnum(AttendanceStatus).optional(),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});
export type StudentExportQuery = z.infer<typeof StudentExportQuerySchema>;

export const TeacherExportQuerySchema = z.object({
  classId: z.string().uuid("Class ID is required"),
  subjectId: z.string().uuid("Invalid subject ID").optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  format: z.enum(["roster", "sessions"]).optional().default("roster"),
  page: z.coerce.number().optional(),
  limit: z.coerce.number().optional(),
});
export type TeacherExportQuery = z.infer<typeof TeacherExportQuerySchema>;

export const AdminExportQuerySchema = z.object({
  departmentId: z.string().uuid("Invalid department ID").optional(),
  academicYearId: z.string().uuid("Invalid academic year ID").optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
export type AdminExportQuery = z.infer<typeof AdminExportQuerySchema>;

