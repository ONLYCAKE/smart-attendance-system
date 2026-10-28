import { apiClient } from "@/lib/api-client";
import { ApiSuccessResponse } from "@smart-attendance/shared";

export interface StudentListItem {
  id: string;
  rollNumber: string;
  name: string;
  email: string;
  status: "PENDING" | "ACTIVE" | "INACTIVE" | "GRADUATED";
  createdAt: string;
  department: {
    id: string;
    name: string;
    code: string;
  };
  academicYear?: {
    id: string;
    label: string;
  } | null;
  class?: {
    id: string;
    label: string;
    semesterNumber: number;
    division: string;
  } | null;
  faceEnrollment?: {
    id: string;
    status: string;
    modelVersion: string;
    enrolledAt: string;
  } | null;
  biometricConsent?: {
    id: string;
    status: string;
    consentVersion: string;
    consentedAt: string;
  } | null;
}

export interface StudentStats {
  total: number;
  pending: number;
  active: number;
  inactive: number;
}

export interface ListStudentsParams {
  search?: string;
  departmentId?: string;
  academicYearId?: string;
  classId?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export async function listStudentsApi(
  params?: ListStudentsParams
): Promise<ApiSuccessResponse<StudentListItem[]>> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.departmentId && params.departmentId !== "ALL") {
    query.append("departmentId", params.departmentId);
  }
  if (params?.academicYearId && params.academicYearId !== "ALL") {
    query.append("academicYearId", params.academicYearId);
  }
  if (params?.classId && params.classId !== "ALL") {
    query.append("classId", params.classId);
  }
  if (params?.status && params.status !== "ALL") {
    query.append("status", params.status);
  }
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));

  const url = `/students${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiClient.get<ApiSuccessResponse<StudentListItem[]>>(url);
  return res.data;
}

export async function getStudentStatsApi(): Promise<StudentStats> {
  const res = await apiClient.get<ApiSuccessResponse<StudentStats>>("/students/stats");
  return res.data.data;
}

export async function approveStudentApi(
  studentId: string,
  options?: { classId?: string }
): Promise<{ success: boolean; message: string; student: any }> {
  const res = await apiClient.post<
    ApiSuccessResponse<{ message: string; student: any }>
  >(`/students/${studentId}/approve`, options);
  return {
    success: true,
    message: res.data.data.message,
    student: res.data.data.student,
  };
}

export async function createStudentApi(data: {
  name: string;
  email: string;
  departmentId: string;
  classId?: string;
  password?: string;
}): Promise<{ success: boolean; message: string; student: any }> {
  const res = await apiClient.post<
    ApiSuccessResponse<{ message: string; student: any }>
  >("/students", data);
  return {
    success: true,
    message: res.data.data.message,
    student: res.data.data.student,
  };
}

export async function assignStudentClassApi(
  studentId: string,
  classId: string | null
): Promise<{ success: boolean; message: string; student: any }> {
  const res = await apiClient.patch<
    ApiSuccessResponse<{ message: string; student: any }>
  >(`/students/${studentId}/class`, { classId });
  return {
    success: true,
    message: res.data.data.message,
    student: res.data.data.student,
  };
}

