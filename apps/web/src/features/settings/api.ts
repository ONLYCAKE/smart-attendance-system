import { apiClient } from "@/lib/api-client";

export interface SystemSettingItem {
  id: string;
  key: string;
  value: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluateAlertsResult {
  evaluated: number;
  warningsCreatedOrUpdated: number;
  resolved: number;
  thresholdPercent: number;
}

/**
 * Fetch all system settings from GET /api/v1/settings
 */
export async function getSettingsApi(): Promise<SystemSettingItem[]> {
  const res = await apiClient.get<{ success: boolean; data: SystemSettingItem[] }>("/settings");
  return res.data.data;
}

/**
 * Update a specific system setting via PATCH /api/v1/settings
 */
export async function updateSettingApi(key: string, value: string): Promise<SystemSettingItem> {
  const res = await apiClient.patch<{ success: boolean; data: SystemSettingItem }>("/settings", {
    key,
    value,
  });
  return res.data.data;
}

/**
 * Trigger manual institution-wide alert evaluation via POST /api/v1/notifications/evaluate
 */
export async function triggerInstitutionAlertEvaluationApi(): Promise<EvaluateAlertsResult> {
  const res = await apiClient.post<{ success: boolean; data: EvaluateAlertsResult }>("/notifications/evaluate", {});
  return res.data.data;
}
