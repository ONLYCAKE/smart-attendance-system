import { UserRole, UserStatus, StudentStatus } from "@smart-attendance/shared";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  mustChangePassword?: boolean;
  studentProfile?: {
    id: string;
    rollNumber: string;
    status: StudentStatus;
    class?: {
      id: string;
      label: string;
      semesterNumber: number;
      division: string;
    };
    department?: {
      id: string;
      name: string;
      code: string;
    };
    faceEnrollment?: {
      id: string;
      status: string;
      modelVersion: string;
      consentedAt: string;
    };
  };
}

export interface LoginResponseData {
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    mustChangePassword?: boolean;
    studentId?: string;
    rollNumber?: string;
    classId?: string;
  };
  token: string;
}

export interface RegisterResponseData {
  studentId: string;
  name: string;
  email: string;
  status: StudentStatus;
  message: string;
}
