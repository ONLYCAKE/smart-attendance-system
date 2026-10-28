import { apiClient } from "@/lib/api-client";
import { DashboardQuery } from "@smart-attendance/shared";
import { DashboardData } from "./types";

export async function getDashboardMetricsApi(
  query: Partial<DashboardQuery> = {}
): Promise<DashboardData> {
  const res = await apiClient.get<{ success: boolean; data: DashboardData }>(
    "/reports/dashboard",
    { params: query }
  );
  return res.data.data;
}
