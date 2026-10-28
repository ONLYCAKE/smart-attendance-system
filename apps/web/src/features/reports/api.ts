import { apiClient } from "@/lib/api-client";
import {
  StudentReportQuery,
  TeacherReportQuery,
  AdminSummaryQuery,
} from "@smart-attendance/shared";
import {
  StudentReportData,
  TeacherReportData,
  AdminSummaryData,
} from "./types";

export async function getStudentReportApi(
  query: Partial<StudentReportQuery> = {}
): Promise<StudentReportData> {
  const res = await apiClient.get<{ success: boolean; data: StudentReportData }>(
    "/reports/student/me",
    { params: query }
  );
  return res.data.data;
}

export async function getTeacherAttendanceReportApi(
  query: TeacherReportQuery
): Promise<TeacherReportData> {
  const res = await apiClient.get<{ success: boolean; data: TeacherReportData }>(
    "/reports/teacher/attendance",
    { params: query }
  );
  return res.data.data;
}

export async function getAdminSummaryApi(
  query: Partial<AdminSummaryQuery> = {}
): Promise<AdminSummaryData> {
  const res = await apiClient.get<{ success: boolean; data: AdminSummaryData }>(
    "/reports/admin/summary",
    { params: query }
  );
  return res.data.data;
}

export async function getMyTeacherAssignmentsApi(): Promise<
  Array<{
    classId: string;
    classLabel: string;
    subjectId: string;
    subjectName: string;
    subjectCode: string;
  }>
> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: Array<{
        classId: string;
        subjectId: string;
        class: { id: string; label: string };
        subject: { id: string; name: string; code: string };
      }>;
    }>("/teacher-assignments/my-assignments");
    return (res.data.data || []).map((a) => ({
      classId: a.classId,
      classLabel: a.class?.label || a.classId,
      subjectId: a.subjectId,
      subjectName: a.subject?.name || "",
      subjectCode: a.subject?.code || "",
    }));
  } catch {
    // Fallback: fetch all assignments if teacher endpoint is different
    const fallbackRes = await apiClient.get<{
      success: boolean;
      data: Array<{
        classId: string;
        subjectId: string;
        class: { id: string; label: string };
        subject: { id: string; name: string; code: string };
      }>;
    }>("/teacher-assignments");
    return (fallbackRes.data.data || []).map((a) => ({
      classId: a.classId,
      classLabel: a.class?.label || a.classId,
      subjectId: a.subjectId,
      subjectName: a.subject?.name || "",
      subjectCode: a.subject?.code || "",
    }));
  }
}

export async function getAllDepartmentsApi(): Promise<
  Array<{ id: string; name: string; code: string }>
> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: Array<{ id: string; name: string; code: string }>;
    }>("/departments");
    return res.data.data || [];
  } catch {
    return [];
  }
}

export async function getAllClassesApi(): Promise<
  Array<{ id: string; label: string; department?: { code: string } }>
> {
  try {
    const res = await apiClient.get<{
      success: boolean;
      data: Array<{ id: string; label: string; department?: { code: string } }>;
    }>("/classes");
    return res.data.data || [];
  } catch {
    return [];
  }
}

export function getStudentReportExportUrl(params: Record<string, any> = {}): string {
  const q = new URLSearchParams();
  if (params.subjectId) q.set("subjectId", params.subjectId);
  if (params.status) q.set("status", params.status);
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  const qs = q.toString();
  return `/reports/student/me/export${qs ? `?${qs}` : ""}`;
}

export function getTeacherReportExportUrl(params: Record<string, any> = {}): string {
  const q = new URLSearchParams();
  if (params.classId) q.set("classId", params.classId);
  if (params.subjectId) q.set("subjectId", params.subjectId);
  if (params.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params.dateTo) q.set("dateTo", params.dateTo);
  if (params.search) q.set("search", params.search);
  const qs = q.toString();
  return `/reports/teacher/attendance/export${qs ? `?${qs}` : ""}`;
}

export function getAdminSummaryExportUrl(params: Record<string, any> = {}): string {
  const q = new URLSearchParams();
  if (params.departmentId) q.set("departmentId", params.departmentId);
  if (params.academicYearId) q.set("academicYearId", params.academicYearId);
  const qs = q.toString();
  return `/reports/admin/summary/export${qs ? `?${qs}` : ""}`;
}

export async function downloadReportCsv(endpointPath: string, fallbackFilename: string): Promise<void> {
  const res = await apiClient.get(endpointPath, {
    responseType: "blob",
  });
  
  // Extract filename from Content-Disposition if present
  let filename = fallbackFilename;
  const disposition = res.headers["content-disposition"];
  if (disposition && disposition.includes("filename=")) {
    const match = disposition.match(/filename="?([^";]+)"?/);
    if (match && match[1]) {
      filename = match[1];
    }
  }

  const blob = new Blob([res.data], { type: "text/csv;charset=utf-8;" });
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}
