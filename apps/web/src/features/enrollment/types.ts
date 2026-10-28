export interface EnrollmentStatusData {
  studentId: string;
  hasConsent: boolean;
  consentStatus: "GRANTED" | "REVOKED" | "NO_RECORD";
  consentVersion: string | null;
  consentedAt: string | null;
  isEnrolled: boolean;
  enrollmentStatus: "ACTIVE" | "REVOKED" | "DELETED" | "NOT_ENROLLED";
  provider: string | null;
  modelVersion: string | null;
  enrolledAt: string | null;
  deletedAt: string | null;
}

export type EnrollmentStep =
  | "STATUS"
  | "CONSENT"
  | "CAMERA"
  | "PROCESSING"
  | "SUCCESS"
  | "REVOKED";
