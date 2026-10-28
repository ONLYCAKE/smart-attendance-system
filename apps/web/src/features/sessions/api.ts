import { apiClient } from "@/lib/api-client";
import {
  ApiSuccessResponse,
  SessionCreateInput,
  AttendanceMarkInput,
  AttendanceCorrectionInput,
} from "@smart-attendance/shared";
import { AttendanceSessionItem, SessionDetailsData } from "./types";

export interface ListSessionsParams {
  classId?: string;
  subjectId?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export async function listSessionsApi(
  params?: ListSessionsParams
): Promise<ApiSuccessResponse<AttendanceSessionItem[]>> {
  const query = new URLSearchParams();
  if (params?.classId) query.append("classId", params.classId);
  if (params?.subjectId) query.append("subjectId", params.subjectId);
  if (params?.status && params.status !== "ALL") query.append("status", params.status);
  if (params?.dateFrom) query.append("dateFrom", params.dateFrom);
  if (params?.dateTo) query.append("dateTo", params.dateTo);
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));

  const url = `/attendance-sessions${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiClient.get<ApiSuccessResponse<AttendanceSessionItem[]>>(url);
  return res.data;
}

export async function getSessionByIdApi(id: string): Promise<SessionDetailsData> {
  const res = await apiClient.get<ApiSuccessResponse<SessionDetailsData>>(
    `/attendance-sessions/${id}`
  );
  return res.data.data;
}

export async function createSessionApi(
  data: SessionCreateInput
): Promise<AttendanceSessionItem> {
  const res = await apiClient.post<ApiSuccessResponse<AttendanceSessionItem>>(
    "/attendance-sessions",
    data
  );
  return res.data.data;
}

export async function startSessionApi(id: string): Promise<AttendanceSessionItem> {
  const res = await apiClient.post<ApiSuccessResponse<AttendanceSessionItem>>(
    `/attendance-sessions/${id}/start`
  );
  return res.data.data;
}

export async function closeSessionApi(id: string): Promise<AttendanceSessionItem> {
  const res = await apiClient.post<ApiSuccessResponse<AttendanceSessionItem>>(
    `/attendance-sessions/${id}/close`
  );
  return res.data.data;
}

export async function markAttendanceApi(
  sessionId: string,
  records: AttendanceMarkInput[]
): Promise<{ success: boolean; count: number; message: string }> {
  const res = await apiClient.post<
    ApiSuccessResponse<{ success: boolean; count: number; message: string }>
  >(`/attendance-sessions/${sessionId}/records`, { records });
  return res.data.data;
}

export async function correctAttendanceRecordApi(
  recordId: string,
  data: AttendanceCorrectionInput
): Promise<any> {
  const res = await apiClient.patch<ApiSuccessResponse<any>>(
    `/attendance-sessions/records/${recordId}`,
    data
  );
  return res.data.data;
}

export async function recognizeFaceApi(
  sessionId: string,
  data: {
    descriptor: number[];
    provider?: string;
    modelVersion?: string;
  }
): Promise<import("./types").RecognitionScanResult> {
  const res = await apiClient.post<
    ApiSuccessResponse<import("./types").RecognitionScanResult>
  >(`/attendance-sessions/${sessionId}/recognize`, data);
  return res.data.data;
}

export async function confirmRecognitionApi(
  sessionId: string,
  data: {
    studentId: string;
    confidence: number;
    status?: any;
    teacherConfirmed?: boolean;
    overrideReason?: string;
  }
): Promise<any> {
  const res = await apiClient.post<ApiSuccessResponse<any>>(
    `/attendance-sessions/${sessionId}/confirm-recognition`,
    data
  );
  return res.data.data;
}
