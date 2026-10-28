export type NotificationStatus = "UNREAD" | "READ" | "RESOLVED";
export type NotificationType = "LOW_ATTENDANCE_WARNING" | "LOW_ATTENDANCE" | "GENERAL";

export interface NotificationItem {
  id: string;
  studentId: string;
  title: string;
  message: string;
  type: NotificationType;
  status: NotificationStatus;
  dedupKey?: string | null;
  metadata?: string | null;
  readAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  student?: {
    id: string;
    rollNumber: string;
    classId: string;
    user?: {
      firstName: string;
      lastName: string;
      email: string;
    };
    class?: {
      id: string;
      label: string;
    };
  };
}

export interface NotificationSummary {
  total: number;
  unread: number;
  read: number;
  resolved: number;
}

export interface SystemSettingItem {
  key: string;
  value: string;
  description?: string | null;
  updatedAt: string;
}
