import { apiClient } from "@/lib/api-client";
import {
  TeacherAssignmentInput,
  TeacherAssignmentUpdateInput,
  ApiSuccessResponse,
} from "@smart-attendance/shared";

export interface TeacherAssignmentItem {
  id: string;
  teacherUserId: string;
  classId: string;
  subjectId: string;
  active: boolean;
  createdAt: string;
  teacher: {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
  };
  class: {
    id: string;
    label: string;
    semesterNumber: number;
    division: string;
    department: {
      id: string;
      name: string;
      code: string;
    };
    academicYear?: {
      id: string;
      label: string;
    };
  };
  subject: {
    id: string;
    name: string;
    code: string;
    departmentId: string;
    department?: {
      id: string;
      name: string;
      code: string;
    };
  };
  _count?: {
    timetableEntries: number;
  };
}

export interface TeacherUserItem {
  id: string;
  name: string;
  email: string;
  status: string;
}

export interface TeacherAssignmentStats {
  total: number;
  active: number;
  inactive: number;
}

export async function listTeacherAssignmentsApi(params?: {
  search?: string;
  teacherUserId?: string;
  classId?: string;
  subjectId?: string;
  active?: boolean | string;
  page?: number;
  limit?: number;
}): Promise<ApiSuccessResponse<TeacherAssignmentItem[]>> {
  const query = new URLSearchParams();
  if (params?.search) query.append("search", params.search);
  if (params?.teacherUserId && params.teacherUserId !== "ALL") {
    query.append("teacherUserId", params.teacherUserId);
  }
  if (params?.classId && params.classId !== "ALL") {
    query.append("classId", params.classId);
  }
  if (params?.subjectId && params.subjectId !== "ALL") {
    query.append("subjectId", params.subjectId);
  }
  if (params?.active !== undefined && params.active !== "ALL") {
    query.append("active", String(params.active));
  }
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));

  const url = `/teacher-assignments${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiClient.get<ApiSuccessResponse<TeacherAssignmentItem[]>>(url);
  return res.data;
}

export async function getTeacherAssignmentStatsApi(): Promise<TeacherAssignmentStats> {
  const res = await apiClient.get<ApiSuccessResponse<TeacherAssignmentStats>>(
    "/teacher-assignments/stats"
  );
  return res.data.data;
}

export async function getTeachersListApi(): Promise<TeacherUserItem[]> {
  const res = await apiClient.get<ApiSuccessResponse<TeacherUserItem[]>>(
    "/teacher-assignments/teachers"
  );
  return res.data.data;
}

export async function createTeacherUserApi(data: {
  name: string;
  email: string;
  password?: string;
}): Promise<TeacherUserItem> {
  const res = await apiClient.post<ApiSuccessResponse<TeacherUserItem>>(
    "/teacher-assignments/teachers",
    data
  );
  return res.data.data;
}

export async function createTeacherAssignmentApi(
  data: TeacherAssignmentInput
): Promise<TeacherAssignmentItem> {
  const res = await apiClient.post<ApiSuccessResponse<TeacherAssignmentItem>>(
    "/teacher-assignments",
    data
  );
  return res.data.data;
}

export async function updateTeacherAssignmentApi(
  id: string,
  data: TeacherAssignmentUpdateInput
): Promise<TeacherAssignmentItem> {
  const res = await apiClient.patch<ApiSuccessResponse<TeacherAssignmentItem>>(
    `/teacher-assignments/${id}`,
    data
  );
  return res.data.data;
}

export async function deleteTeacherAssignmentApi(
  id: string
): Promise<{ message: string }> {
  const res = await apiClient.delete<ApiSuccessResponse<{ message: string }>>(
    `/teacher-assignments/${id}`
  );
  return res.data.data;
}
