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
  rollNumber: z.string().min(1, "Roll number is required"),
  departmentId: z.string().uuid("Invalid department identifier"),
  academicYearId: z.string().uuid("Invalid academic year identifier"),
  classId: z.string().uuid("Invalid class identifier"),
});
export type StudentRegisterInput = z.infer<typeof StudentRegisterSchema>;

export const DepartmentSchema = z.object({
  name: z.string().min(2, "Department name must be at least 2 characters"),
  code: z.string().min(2, "Department code must be at least 2 characters").toUpperCase(),
});
export type DepartmentInput = z.infer<typeof DepartmentSchema>;

export const AcademicYearSchema = z.object({
  label: z.string().min(4, "Academic year label required (e.g. 2025-2026)"),
  startDate: z.string().datetime("Invalid start date"),
  endDate: z.string().datetime("Invalid end date"),
});
export type AcademicYearInput = z.infer<typeof AcademicYearSchema>;

export const ClassSchema = z.object({
  departmentId: z.string().uuid("Invalid department ID"),
  academicYearId: z.string().uuid("Invalid academic year ID"),
  semesterNumber: z.number().int().min(1).max(12),
  division: z.string().min(1, "Division required (e.g. A, B)"),
  label: z.string().min(2, "Class label required"),
});
export type ClassInput = z.infer<typeof ClassSchema>;

export const SubjectSchema = z.object({
  code: z.string().min(2, "Subject code required").toUpperCase(),
  name: z.string().min(2, "Subject name required"),
  departmentId: z.string().uuid("Invalid department ID"),
});
export type SubjectInput = z.infer<typeof SubjectSchema>;

export const TeacherAssignmentSchema = z.object({
  teacherUserId: z.string().uuid("Invalid teacher user ID"),
  classId: z.string().uuid("Invalid class ID"),
  subjectId: z.string().uuid("Invalid subject ID"),
});
export type TeacherAssignmentInput = z.infer<typeof TeacherAssignmentSchema>;

export const TimetableEntrySchema = z.object({
  classId: z.string().uuid("Invalid class ID"),
  subjectId: z.string().uuid("Invalid subject ID"),
  teacherAssignmentId: z.string().uuid("Invalid teacher assignment ID"),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format must be HH:MM"),
  endTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Format must be HH:MM"),
  room: z.string().optional(),
});
export type TimetableEntryInput = z.infer<typeof TimetableEntrySchema>;

export const SessionCreateSchema = z.object({
  classId: z.string().uuid("Invalid class ID"),
  subjectId: z.string().uuid("Invalid subject ID"),
  timetableEntryId: z.string().uuid().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type SessionCreateInput = z.infer<typeof SessionCreateSchema>;

export const FaceEnrollmentSubmitSchema = z.object({
  consentVersion: z.string().default("1.0"),
  modelVersion: z.string().default("v1"),
  provider: z.string().default("human"),
  descriptors: z.string().min(10, "Valid descriptor array required"),
});
export type FaceEnrollmentSubmitInput = z.infer<typeof FaceEnrollmentSubmitSchema>;

export const FaceRecognitionRecognizeSchema = z.object({
  descriptor: z.array(z.number()).min(64, "Descriptor vector must contain numeric floats"),
});
export type FaceRecognitionRecognizeInput = z.infer<typeof FaceRecognitionRecognizeSchema>;

export const AttendanceMarkSchema = z.object({
  studentId: z.string().uuid("Invalid student ID"),
  status: z.nativeEnum(AttendanceStatus).default(AttendanceStatus.PRESENT),
  method: z.nativeEnum(AttendanceMethod).default(AttendanceMethod.FACE_RECOGNITION),
  confidence: z.number().min(0).max(1).optional(),
});
export type AttendanceMarkInput = z.infer<typeof AttendanceMarkSchema>;

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
