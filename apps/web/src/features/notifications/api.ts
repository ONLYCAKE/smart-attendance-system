import { apiClient } from "@/lib/api-client";
import { NotificationItem, NotificationSummary, SystemSettingItem } from "./types";

export interface NotificationsResponse {
  notifications: NotificationItem[];
  summary: NotificationSummary;
}

export async function getMyNotificationsApi(params?: {
  status?: string;
  limit?: number;
}): Promise<NotificationsResponse> {
  const res = await apiClient.get<{ success: boolean; data: NotificationsResponse }>(
    "/notifications/my",
    { params }
  );
  return res.data.data;
}

export async function markAsReadApi(id: string): Promise<NotificationItem> {
  const res = await apiClient.patch<{ success: boolean; data: NotificationItem }>(
    `/notifications/${id}/read`
  );
  return res.data.data;
}

export async function resolveNotificationApi(id: string): Promise<NotificationItem> {
  const res = await apiClient.patch<{ success: boolean; data: NotificationItem }>(
    `/notifications/${id}/resolve`
  );
  return res.data.data;
}

export async function getClassNotificationsApi(
  classId: string,
  params?: { status?: string }
): Promise<NotificationsResponse> {
  const res = await apiClient.get<{ success: boolean; data: NotificationsResponse }>(
    `/notifications/class/${classId}`,
    { params }
  );
  return res.data.data;
}

export async function evaluateAlertsApi(data: { classId?: string }): Promise<{
  evaluated: number;
  warningsCreatedOrUpdated: number;
  resolved: number;
  thresholdPercent: number;
}> {
  const res = await apiClient.post<{
    success: boolean;
    data: {
      evaluated: number;
      warningsCreatedOrUpdated: number;
      resolved: number;
      thresholdPercent: number;
    };
  }>("/notifications/evaluate", data);
  return res.data.data;
}

export async function getSettingsApi(): Promise<SystemSettingItem[]> {
  const res = await apiClient.get<{ success: boolean; data: SystemSettingItem[] }>("/settings");
  return res.data.data;
}

export async function updateSettingApi(
  key: string,
  value: string
): Promise<SystemSettingItem> {
  const res = await apiClient.patch<{ success: boolean; data: SystemSettingItem }>(
    "/settings",
    { key, value }
  );
  return res.data.data;
}
