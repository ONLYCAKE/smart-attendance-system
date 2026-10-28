import { apiClient } from "@/lib/api-client";
import { LoginInput, StudentRegisterInput, ApiSuccessResponse } from "@smart-attendance/shared";
import { AuthUser, LoginResponseData, RegisterResponseData } from "./types";

export async function loginApi(credentials: LoginInput): Promise<LoginResponseData> {
  const response = await apiClient.post<ApiSuccessResponse<LoginResponseData>>(
    "/auth/login",
    credentials
  );
  return response.data.data;
}

export async function logoutApi(): Promise<void> {
  await apiClient.post("/auth/logout");
}

export async function getMeApi(): Promise<AuthUser> {
  const response = await apiClient.get<ApiSuccessResponse<AuthUser>>("/auth/me");
  return response.data.data;
}

export async function firstLoginPasswordApi(password: string): Promise<LoginResponseData> {
  const response = await apiClient.post<ApiSuccessResponse<LoginResponseData>>(
    "/auth/first-login-password",
    { password }
  );
  return response.data.data;
}

export async function registerStudentApi(data: StudentRegisterInput): Promise<RegisterResponseData> {
  const response = await apiClient.post<ApiSuccessResponse<RegisterResponseData>>(
    "/auth/register",
    data
  );
  return response.data.data;
}

export interface RegistrationDepartment {
  id: string;
  name: string;
  code: string;
}

export interface RegistrationClass {
  id: string;
  label: string;
  departmentId: string;
  academicYearId: string;
  semesterNumber: number;
  division: string;
}

export interface RegistrationOptions {
  departments: RegistrationDepartment[];
  classes: RegistrationClass[];
}

export async function getRegistrationOptionsApi(): Promise<RegistrationOptions> {
  const response = await apiClient.get<ApiSuccessResponse<RegistrationOptions>>(
    "/auth/registration-options"
  );
  return response.data.data;
}
