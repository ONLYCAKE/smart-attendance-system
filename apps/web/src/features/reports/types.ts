export interface StudentReportSummary {
  totalEligibleSessions: number;
  attendedSessions: number;
  overallPercentage: number | null;
  subjectBreakdown: Array<{
    subjectId: string;
    code: string;
    name: string;
    totalEligibleSessions: number;
    attendedSessions: number;
    percentage: number | null;
    isBelowThreshold: boolean;
  }>;
}

export interface StudentAttendanceHistoryItem {
  id?: string;
  recordId?: string;
  sessionId?: string;
  date?: string;
  markedAt?: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
  method: "FACE_RECOGNITION" | "MANUAL_TEACHER" | "UNRECORDED_DEFAULT";
  verifiedAt?: string;
  subject?: {
    id: string;
    code: string;
    name: string;
  };
  session?: {
    id: string;
    startsAt: string;
    endsAt: string | null;
    status: string;
    subject?: { id: string; code: string; name: string };
    teacher?: { id: string; name: string };
  };
  class?: {
    id: string;
    label: string;
    semesterNumber: number;
    division: string;
  };
}

export interface StudentReportData {
  student: {
    id: string;
    name: string;
    rollNumber: string;
    email: string;
    classLabel: string;
    departmentName: string;
  };
  summary: StudentReportSummary;
  subjects?: Array<{
    subjectId: string;
    code: string;
    name: string;
    totalEligibleSessions: number;
    attendedCount: number;
    attendedSessions?: number;
    presentCount?: number;
    lateCount?: number;
    absentCount?: number;
    excusedCount?: number;
    percentage: number | null;
  }>;
  history: StudentAttendanceHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface TeacherReportMetrics {
  totalStudents: number;
  totalSessionsHeld: number;
  classAveragePercentage: number | null;
  belowThresholdCount: number;
}

export interface TeacherStudentAttendanceRow {
  studentId: string;
  rollNumber: string;
  name: string;
  email: string;
  totalEligibleSessions: number;
  attendedSessions: number;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  excusedCount: number;
  percentage: number | null;
  isBelowThreshold: boolean;
}

export interface TeacherReportData {
  class: {
    id: string;
    label: string;
    division: string;
    semesterNumber: number;
    department: { id: string; code: string; name: string };
    academicYear?: { id: string; label: string };
  };
  metrics: TeacherReportMetrics;
  students: TeacherStudentAttendanceRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminDepartmentSummaryRow {
  departmentId: string;
  code: string;
  name: string;
  classCount: number;
  studentCount: number;
  sessionCount: number;
  averageAttendancePercentage: number | null;
}

export interface AdminClassSummaryRow {
  classId: string;
  label: string;
  division: string;
  semesterNumber: number;
  departmentCode: string;
  academicYearLabel: string;
  studentCount: number;
  sessionCount: number;
  averageAttendancePercentage: number | null;
}

export interface AdminSummaryData {
  summary: {
    totalDepartments: number;
    totalClasses: number;
    totalActiveStudents: number;
    totalSessionsHeld: number;
    overallAverageAttendance: number | null;
  };
  departments: AdminDepartmentSummaryRow[];
  classes: AdminClassSummaryRow[];
}
