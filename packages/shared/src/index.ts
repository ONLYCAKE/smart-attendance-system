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

export const SessionCreateSchema = z.object({
  classId: z.string().uuid("Invalid class ID"),
  subjectId: z.string().uuid("Invalid subject ID"),
  timetableEntryId: z.string().uuid().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().optional(),
});
export type SessionCreateInput = z.infer<typeof SessionCreateSchema>;

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
