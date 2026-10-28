import { apiClient } from "@/lib/api-client";
import { ApiSuccessResponse } from "@smart-attendance/shared";
import { EnrollmentStatusData } from "./types";

export async function getEnrollmentStatusApi(
  studentId: string
): Promise<EnrollmentStatusData> {
  const res = await apiClient.get<ApiSuccessResponse<EnrollmentStatusData>>(
    `/students/${studentId}/face-enrollment/status`
  );
  return res.data.data;
}

export async function recordConsentApi(
  studentId: string,
  agreed: boolean,
  consentVersion = "1.0",
  revocationReason?: string,
  representativeConsent?: { legalBasis: string; documentReference: string }
): Promise<{ consent: any; message: string }> {
  const res = await apiClient.post<ApiSuccessResponse<{ consent: any; message: string }>>(
    `/students/${studentId}/consent`,
    {
      agreed,
      consentVersion,
      revocationReason,
      representativeConsent,
    }
  );
  return res.data.data;
}

export async function enrollFaceApi(
  studentId: string,
  descriptor: number[],
  modelVersion = "faceres-v1",
  provider = "human"
): Promise<{
  studentId: string;
  status: string;
  provider: string;
  modelVersion: string;
  enrolledAt: string;
  message: string;
}> {
  const res = await apiClient.post<
    ApiSuccessResponse<{
      studentId: string;
      status: string;
      provider: string;
      modelVersion: string;
      enrolledAt: string;
      message: string;
    }>
  >(`/students/${studentId}/face-enrollment`, {
    descriptor,
    modelVersion,
    provider,
  });
  return res.data.data;
}

export async function revokeEnrollmentApi(
  studentId: string,
  reason?: string
): Promise<{ studentId: string; status: string; message: string }> {
  const res = await apiClient.post<
    ApiSuccessResponse<{ studentId: string; status: string; message: string }>
  >(`/students/${studentId}/face-enrollment/revoke`, { reason });
  return res.data.data;
}

export async function deleteEnrollmentApi(
  studentId: string
): Promise<{ studentId: string; status: string; message: string }> {
  const res = await apiClient.delete<
    ApiSuccessResponse<{ studentId: string; status: string; message: string }>
  >(`/students/${studentId}/face-enrollment`);
  return res.data.data;
}
