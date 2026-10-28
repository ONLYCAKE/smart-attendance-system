import { apiClient } from "@/lib/api-client";
import {
  DepartmentInput,
  DepartmentUpdateInput,
  ApiSuccessResponse,
} from "@smart-attendance/shared";

export interface DepartmentListItem {
  id: string;
  name: string;
  code: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count: {
    classes: number;
    subjects: number;
    students: number;
  };
}

export interface DepartmentStats {
  total: number;
  active: number;
  inactive: number;
}

export interface ListDepartmentsParams {
  search?: string;
  active?: boolean | string;
  page?: number;
  limit?: number;
}

export async function listDepartmentsApi(
  params?: ListDepartmentsParams
): Promise<ApiSuccessResponse<DepartmentListItem[]>> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.active !== undefined && params?.active !== "ALL") {
    query.append("active", String(params.active));
  }
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));

  const url = `/departments${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiClient.get<ApiSuccessResponse<DepartmentListItem[]>>(url);
  return res.data;
}

export async function getDepartmentStatsApi(): Promise<DepartmentStats> {
  const res = await apiClient.get<ApiSuccessResponse<DepartmentStats>>("/departments/stats");
  return res.data.data;
}

export async function getDepartmentByIdApi(id: string): Promise<DepartmentListItem> {
  const res = await apiClient.get<ApiSuccessResponse<DepartmentListItem>>(`/departments/${id}`);
  return res.data.data;
}

export async function createDepartmentApi(
  data: DepartmentInput
): Promise<DepartmentListItem> {
  const res = await apiClient.post<ApiSuccessResponse<DepartmentListItem>>(
    "/departments",
    data
  );
  return res.data.data;
}

export async function updateDepartmentApi(
  id: string,
  data: DepartmentUpdateInput
): Promise<DepartmentListItem> {
  const res = await apiClient.patch<ApiSuccessResponse<DepartmentListItem>>(
    `/departments/${id}`,
    data
  );
  return res.data.data;
}

export async function deleteDepartmentApi(
  id: string
): Promise<{ message: string }> {
  const res = await apiClient.delete<ApiSuccessResponse<{ message: string }>>(
    `/departments/${id}`
  );
  return res.data.data;
}
