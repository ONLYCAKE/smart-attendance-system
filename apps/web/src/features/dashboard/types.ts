export type DashboardRole = "STUDENT" | "TEACHER" | "ADMIN";

export interface StudentDashboardKPIs {
  overallAttendancePercentage: number | null;
  totalEligibleSessions: number;
  attendedSessions: number;
  standing: "GOOD_STANDING" | "BELOW_THRESHOLD" | "NO_SESSIONS";
  threshold: number;
}

export interface StudentDashboardTrendItem {
  date: string;
  totalSessions: number;
  attendedCount: number;
  attendancePercentage: number | null;
}

export interface StudentDashboardSubjectItem {
  subjectId: string;
  code: string;
  name: string;
  total: number;
  attended: number;
  percentage: number | null;
  isBelowThreshold: boolean;
}

export interface StudentRecentActivityItem {
  recordId: string;
  date: string;
  subjectCode: string;
  subjectName: string;
  status: "PRESENT" | "LATE" | "ABSENT" | "EXCUSED";
  method: string;
}

export interface StudentDashboardData {
  role: "STUDENT";
  timeframeDays: number;
  isFaceEnrolled?: boolean;
  kpis: StudentDashboardKPIs;
  trend: StudentDashboardTrendItem[];
  subjectBreakdown: StudentDashboardSubjectItem[];
  recentActivity: StudentRecentActivityItem[];
}

export interface TeacherDashboardKPIs {
  totalAssignedClasses: number;
  totalStudents: number;
  totalSessionsConducted: number;
  classAveragePercentage: number | null;
  belowThresholdCount: number;
}

export interface TeacherDashboardTrendItem {
  date: string;
  totalSessions: number;
  attendedCount: number;
  attendancePercentage: number | null;
}

export interface TeacherDashboardSubjectItem {
  subjectId: string;
  code: string;
  name: string;
  totalSessions: number;
  averagePercentage: number | null;
}

export interface TeacherRecentSessionItem {
  sessionId: string;
  classLabel: string;
  subjectCode: string;
  subjectName: string;
  startsAt: string;
  status: string;
}

export interface TeacherDashboardData {
  role: "TEACHER";
  timeframeDays: number;
  kpis: TeacherDashboardKPIs;
  trend: TeacherDashboardTrendItem[];
  subjectBreakdown: TeacherDashboardSubjectItem[];
  recentSessions: TeacherRecentSessionItem[];
}

export interface AdminDashboardKPIs {
  totalDepartments: number;
  totalClasses: number;
  totalActiveStudents: number;
  totalSessionsHeld: number;
  overallAverageAttendance: number | null;
  totalAtRiskStudents: number;
}

export interface AdminDashboardTrendItem {
  date: string;
  totalSessions: number;
  averagePercentage: number | null;
}

export interface AdminDashboardDepartmentItem {
  departmentId: string;
  code: string;
  name: string;
  studentCount: number;
  sessionCount: number;
  averagePercentage: number | null;
}

export interface AdminDashboardData {
  role: "ADMIN";
  timeframeDays: number;
  kpis: AdminDashboardKPIs;
  trend: AdminDashboardTrendItem[];
  departmentBreakdown: AdminDashboardDepartmentItem[];
  recentSessions: Array<{ sessionId: string; startsAt: string; status: string }>;
}

export type DashboardData =
  | StudentDashboardData
  | TeacherDashboardData
  | AdminDashboardData;
