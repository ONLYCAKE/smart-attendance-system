import { apiClient } from "@/lib/api-client";
import {
  AcademicYearInput,
  AcademicYearUpdateInput,
  ClassInput,
  ClassUpdateInput,
  SubjectInput,
  SubjectUpdateInput,
  ApiSuccessResponse,
} from "@smart-attendance/shared";

export interface AcademicYearItem {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
  active: boolean;
  _count?: {
    classes: number;
    students: number;
  };
}

export interface ClassItem {
  id: string;
  departmentId: string;
  academicYearId: string;
  semesterNumber: number;
  division: string;
  label: string;
  active: boolean;
  createdAt: string;
  department: {
    id: string;
    name: string;
    code: string;
  };
  academicYear: {
    id: string;
    label: string;
  };
  _count?: {
    students: number;
    teacherAssignments: number;
    timetableEntries: number;
  };
}

export interface SubjectItem {
  id: string;
  code: string;
  name: string;
  departmentId: string;
  active: boolean;
  department: {
    id: string;
    name: string;
    code: string;
  };
  _count?: {
    teacherAssignments: number;
    timetableEntries: number;
  };
}

export interface AcademicStats {
  total: number;
  active: number;
  inactive: number;
}

// Academic Years
export async function listAcademicYearsApi(): Promise<AcademicYearItem[]> {
  const res = await apiClient.get<ApiSuccessResponse<AcademicYearItem[]>>("/academic-years/all");
  return res.data.data;
}

export async function createAcademicYearApi(
  data: AcademicYearInput
): Promise<AcademicYearItem> {
  const res = await apiClient.post<ApiSuccessResponse<AcademicYearItem>>("/academic-years", data);
  return res.data.data;
}

export async function updateAcademicYearApi(
  id: string,
  data: AcademicYearUpdateInput
): Promise<AcademicYearItem> {
  const res = await apiClient.patch<ApiSuccessResponse<AcademicYearItem>>(`/academic-years/${id}`, data);
  return res.data.data;
}

export async function deleteAcademicYearApi(id: string): Promise<{ message: string }> {
  const res = await apiClient.delete<ApiSuccessResponse<{ message: string }>>(`/academic-years/${id}`);
  return res.data.data;
}

// Classes
export async function listClassesApi(params?: {
  search?: string;
  departmentId?: string;
  academicYearId?: string;
  semesterNumber?: number;
  active?: boolean | string;
  page?: number;
  limit?: number;
}): Promise<ApiSuccessResponse<ClassItem[]>> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.departmentId && params.departmentId !== "ALL") {
    query.append("departmentId", params.departmentId);
  }
  if (params?.academicYearId && params.academicYearId !== "ALL") {
    query.append("academicYearId", params.academicYearId);
  }
  if (params?.semesterNumber) {
    query.append("semesterNumber", String(params.semesterNumber));
  }
  if (params?.active !== undefined && params.active !== "ALL") {
    query.append("active", String(params.active));
  }
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));

  const url = `/classes${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiClient.get<ApiSuccessResponse<ClassItem[]>>(url);
  return res.data;
}

export async function getClassStatsApi(): Promise<AcademicStats> {
  const res = await apiClient.get<ApiSuccessResponse<AcademicStats>>("/classes/stats");
  return res.data.data;
}

export async function createClassApi(data: ClassInput): Promise<ClassItem> {
  const res = await apiClient.post<ApiSuccessResponse<ClassItem>>("/classes", data);
  return res.data.data;
}

export async function updateClassApi(
  id: string,
  data: ClassUpdateInput
): Promise<ClassItem> {
  const res = await apiClient.patch<ApiSuccessResponse<ClassItem>>(`/classes/${id}`, data);
  return res.data.data;
}

export async function deleteClassApi(id: string): Promise<{ message: string }> {
  const res = await apiClient.delete<ApiSuccessResponse<{ message: string }>>(`/classes/${id}`);
  return res.data.data;
}

// Subjects
export async function listSubjectsApi(params?: {
  search?: string;
  departmentId?: string;
  active?: boolean | string;
  page?: number;
  limit?: number;
}): Promise<ApiSuccessResponse<SubjectItem[]>> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.departmentId && params.departmentId !== "ALL") {
    query.append("departmentId", params.departmentId);
  }
  if (params?.active !== undefined && params.active !== "ALL") {
    query.append("active", String(params.active));
  }
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));

  const url = `/subjects${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiClient.get<ApiSuccessResponse<SubjectItem[]>>(url);
  return res.data;
}

export async function getSubjectStatsApi(): Promise<AcademicStats> {
  const res = await apiClient.get<ApiSuccessResponse<AcademicStats>>("/subjects/stats");
  return res.data.data;
}

export async function getNextSubjectCodeApi(departmentId: string): Promise<{
  departmentId: string;
  departmentCode: string;
  departmentName: string;
  nextCode: string;
}> {
  const res = await apiClient.get<
    ApiSuccessResponse<{
      departmentId: string;
      departmentCode: string;
      departmentName: string;
      nextCode: string;
    }>
  >(`/subjects/next-code?departmentId=${encodeURIComponent(departmentId)}`);
  return res.data.data;
}

export async function createSubjectApi(data: SubjectInput): Promise<SubjectItem> {
  const res = await apiClient.post<ApiSuccessResponse<SubjectItem>>("/subjects", data);
  return res.data.data;
}

export async function updateSubjectApi(
  id: string,
  data: SubjectUpdateInput
): Promise<SubjectItem> {
  const res = await apiClient.patch<ApiSuccessResponse<SubjectItem>>(`/subjects/${id}`, data);
  return res.data.data;
}

export async function deleteSubjectApi(id: string): Promise<{ message: string }> {
  const res = await apiClient.delete<ApiSuccessResponse<{ message: string }>>(`/subjects/${id}`);
  return res.data.data;
}
