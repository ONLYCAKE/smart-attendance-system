import { AttendanceStatus, AttendanceMethod } from "@smart-attendance/shared";

export type SessionStatus = "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELLED";

export interface AttendanceSessionItem {
  id: string;
  timetableEntryId: string | null;
  classId: string;
  subjectId: string;
  teacherUserId: string;
  startsAt: string;
  endsAt: string | null;
  status: SessionStatus;
  closedAt: string | null;
  createdAt: string;
  class: {
    id: string;
    label: string;
    division: string;
    semesterNumber: number;
  };
  subject: {
    id: string;
    code: string;
    name: string;
  };
  teacher: {
    id: string;
    name: string;
    email: string;
  };
  _count: {
    records: number;
  };
}

export interface RosterStudent {
  studentId: string;
  rollNumber: string;
  name: string;
  email: string;
  hasActiveBiometric: boolean;
  attendance: {
    id: string;
    studentId: string;
    status: AttendanceStatus;
    method: AttendanceMethod;
    confidence: number | null;
    markedAt: string;
    correctionReason: string | null;
  } | null;
}

export interface SessionDetailsData {
  session: AttendanceSessionItem;
  summary: {
    totalStudents: number;
    recordedCount: number;
    unrecordedCount: number;
    presentCount: number;
    absentCount: number;
    lateCount: number;
    excusedCount: number;
  };
  roster: RosterStudent[];
}

export type RecognitionOutcome =
  | "MATCH_FOUND"
  | "UNCERTAIN_MATCH"
  | "NO_MATCH"
  | "INCOMPATIBLE_MODEL";

export interface RecognizedStudentCandidate {
  id: string;
  name: string;
  rollNumber: string;
  email: string;
}

export interface RecognitionScanResult {
  outcome: RecognitionOutcome;
  confidence?: number;
  candidate?: RecognizedStudentCandidate | null;
  runnerUp?: RecognizedStudentCandidate | null;
  runnerUpConfidence?: number;
  ambiguityMargin?: number;
  isAlreadyMarked?: boolean;
  existingRecord?: any;
  requiresTeacherConfirmation?: boolean;
  recorded?: boolean;
  record?: any;
  message: string;
}
