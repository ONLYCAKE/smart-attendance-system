import { apiClient } from "@/lib/api-client";
import {
  TimetableEntryInput,
  TimetableEntryUpdateInput,
  ApiSuccessResponse,
} from "@smart-attendance/shared";

export interface TimetableEntryItem {
  id: string;
  classId: string;
  subjectId: string;
  teacherAssignmentId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdAt: string;
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
  };
  subject: {
    id: string;
    name: string;
    code: string;
  };
  teacherAssignment: {
    id: string;
    teacherUserId: string;
    teacher: {
      id: string;
      name: string;
      email: string;
    };
  };
  _count?: {
    sessions: number;
  };
  sessions?: Array<{
    id: string;
    status: "ACTIVE" | "COMPLETED" | "CANCELLED";
    startsAt: string;
    endsAt?: string | null;
    closedAt?: string | null;
    _count?: {
      records: number;
    };
  }>;
}

export async function listTimetableEntriesApi(params?: {
  classId?: string;
  teacherUserId?: string;
  subjectId?: string;
  dayOfWeek?: number | string;
  room?: string;
  page?: number;
  limit?: number;
}): Promise<ApiSuccessResponse<TimetableEntryItem[]>> {
  const query = new URLSearchParams();
  if (params?.classId && params.classId !== "ALL") query.append("classId", params.classId);
  if (params?.teacherUserId && params.teacherUserId !== "ALL") {
    query.append("teacherUserId", params.teacherUserId);
  }
  if (params?.subjectId && params.subjectId !== "ALL") {
    query.append("subjectId", params.subjectId);
  }
  if (params?.dayOfWeek !== undefined && params.dayOfWeek !== "ALL") {
    query.append("dayOfWeek", String(params.dayOfWeek));
  }
  if (params?.room) query.append("room", params.room);
  if (params?.page) query.append("page", String(params.page));
  if (params?.limit) query.append("limit", String(params.limit));

  const url = `/timetable${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiClient.get<ApiSuccessResponse<TimetableEntryItem[]>>(url);
  return res.data;
}

export async function createTimetableEntryApi(
  data: TimetableEntryInput
): Promise<TimetableEntryItem> {
  const res = await apiClient.post<ApiSuccessResponse<TimetableEntryItem>>(
    "/timetable",
    data
  );
  return res.data.data;
}

export async function updateTimetableEntryApi(
  id: string,
  data: TimetableEntryUpdateInput
): Promise<TimetableEntryItem> {
  const res = await apiClient.patch<ApiSuccessResponse<TimetableEntryItem>>(
    `/timetable/${id}`,
    data
  );
  return res.data.data;
}

export async function deleteTimetableEntryApi(
  id: string
): Promise<{ message: string }> {
  const res = await apiClient.delete<ApiSuccessResponse<{ message: string }>>(
    `/timetable/${id}`
  );
  return res.data.data;
}

export interface MyTimetableData {
  role: "STUDENT" | "TEACHER" | "ADMIN";
  hasPlacement: boolean;
  message?: string;
  student?: {
    id: string;
    name: string;
    rollNumber: string;
    status: string;
  } | null;
  teacher?: {
    id: string;
    name: string;
    email: string;
  } | null;
  class?: {
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
  } | null;
  entries: TimetableEntryItem[];
}

export async function getMyTimetableApi(): Promise<MyTimetableData> {
  const res = await apiClient.get<ApiSuccessResponse<MyTimetableData>>(
    "/timetable/my-timetable"
  );
  return res.data.data;
}

export async function downloadTimetableCsvApi(params?: {
  classId?: string;
  teacherUserId?: string;
  subjectId?: string;
  dayOfWeek?: number | string;
  room?: string;
}): Promise<void> {
  const query = new URLSearchParams();
  if (params?.classId && params.classId !== "ALL") query.append("classId", params.classId);
  if (params?.teacherUserId && params.teacherUserId !== "ALL") {
    query.append("teacherUserId", params.teacherUserId);
  }
  if (params?.subjectId && params.subjectId !== "ALL") {
    query.append("subjectId", params.subjectId);
  }
  if (params?.dayOfWeek !== undefined && params.dayOfWeek !== "ALL") {
    query.append("dayOfWeek", String(params.dayOfWeek));
  }
  if (params?.room) query.append("room", params.room);

  const url = `/timetable/export${query.toString() ? `?${query.toString()}` : ""}`;
  const res = await apiClient.get(url, {
    responseType: "blob",
  });

  let filename = "timetable.csv";
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
