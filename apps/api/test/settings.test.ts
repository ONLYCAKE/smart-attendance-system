import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { PrismaClient, Role, UserStatus, StudentStatus, SessionStatus, AttendanceStatus, AttendanceMethod } from "@prisma/client";
import { createApp } from "../src/app.js";
import { notificationsService } from "../src/modules/notifications/notifications.service.js";

describe("T-053: Admin System Settings & Attendance Threshold Configuration", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;
  let adminUserId: string;

  // Test entities for attendance alert evaluation
  let testStudentId: string;
  let testClassId: string;
  let testSessionIds: string[] = [];

  const extractCookie = (res: globalThis.Response): string => {
    const rawCookie = res.headers.get("set-cookie") || "";
    const match = rawCookie.match(/session_token=[^;]+/);
    return match ? match[0] : "";
  };

  const getCookie = async (email: string) => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: "Password@123" }),
    });
    return extractCookie(res);
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

    adminCookie = await getCookie("admin@college.edu");
    teacherCookie = await getCookie("prof.sharma@college.edu");
    studentCookie = await getCookie("student.aarav@college.edu");

    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@college.edu" } });
    adminUserId = adminUser.id;

    // Reset initial setting to 75
    await prisma.systemSetting.upsert({
      where: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT" },
      update: { value: "75" },
      create: {
        key: "LOW_ATTENDANCE_THRESHOLD_PERCENT",
        value: "75",
        description: "Default minimum attendance percentage required by institution policy",
      },
    });

    // Create a dedicated student and sessions to verify runtime threshold evaluation
    const dept = await prisma.department.findFirstOrThrow();
    const acadYear = await prisma.academicYear.findFirstOrThrow();
    const cohort = await prisma.class.findFirstOrThrow();
    testClassId = cohort.id;

    const testUser = await prisma.user.create({
      data: {
        email: "settings.threshold.test@college.edu",
        passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
        role: Role.STUDENT,
        name: "Threshold Test Student",
        status: UserStatus.ACTIVE,
      },
    });

    const student = await prisma.student.create({
      data: {
        userId: testUser.id,
        name: "Threshold Test Student",
        email: "settings.threshold.test@college.edu",
        rollNumber: `SET-${Date.now()}`,
        departmentId: dept.id,
        academicYearId: acadYear.id,
        classId: cohort.id,
        status: StudentStatus.ACTIVE,
      },
    });
    testStudentId = student.id;

    // Create 10 completed sessions for this class
    const teacherUser = await prisma.user.findFirstOrThrow({ where: { role: Role.TEACHER } });
    const subject = await prisma.subject.findFirstOrThrow();

    for (let i = 0; i < 10; i++) {
      const sess = await prisma.attendanceSession.create({
        data: {
          classId: cohort.id,
          subjectId: subject.id,
          teacherUserId: teacherUser.id,
          startsAt: new Date(Date.now() - (10 - i) * 86400000),
          status: SessionStatus.COMPLETED,
        },
      });
      testSessionIds.push(sess.id);

      // Student attends 7 out of 10 sessions (70% attendance)
      if (i < 7) {
        await prisma.attendanceRecord.create({
          data: {
            sessionId: sess.id,
            studentId: student.id,
            status: AttendanceStatus.PRESENT,
            method: AttendanceMethod.MANUAL,
          },
        });
      }
    }
  });

  afterAll(async () => {
    // Revert threshold to default 75
    await prisma.systemSetting.upsert({
      where: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT" },
      update: { value: "75" },
      create: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "75" },
    });

    // Clean up created student, records, and sessions
    if (testStudentId) {
      await prisma.notification.deleteMany({ where: { studentId: testStudentId } });
      await prisma.attendanceRecord.deleteMany({ where: { studentId: testStudentId } });
      const student = await prisma.student.findUnique({ where: { id: testStudentId } });
      if (student) {
        await prisma.student.delete({ where: { id: testStudentId } });
        await prisma.user.delete({ where: { id: student.userId } });
      }
    }

    if (testSessionIds.length > 0) {
      await prisma.attendanceRecord.deleteMany({ where: { sessionId: { in: testSessionIds } } });
      await prisma.attendanceSession.deleteMany({ where: { id: { in: testSessionIds } } });
    }

    await prisma.$disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("1. Access Control & Reading Settings", () => {
    it("denies access to GET /settings for unauthenticated users (401)", async () => {
      const res = await fetch(`${baseUrl}/settings`);
      expect(res.status).toBe(401);
    });

    it("denies access to GET /settings for student role (403)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        headers: { Cookie: studentCookie },
      });
      expect(res.status).toBe(403);
    });

    it("allows teachers to view system settings (200 read-only)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        headers: { Cookie: teacherCookie },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.some((s: any) => s.key === "LOW_ATTENDANCE_THRESHOLD_PERCENT")).toBe(true);
    });

    it("allows admin to view system settings (200)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);

      const thresholdSetting = json.data.find((s: any) => s.key === "LOW_ATTENDANCE_THRESHOLD_PERCENT");
      expect(thresholdSetting).toBeDefined();
      expect(thresholdSetting.value).toBe("75");
    });
  });

  describe("2. Threshold Modification & Input Validation", () => {
    it("denies PATCH /settings for unauthenticated users (401)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "80" }),
      });
      expect(res.status).toBe(401);
    });

    it("denies PATCH /settings for teacher role (403 forbidden)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacherCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "80" }),
      });
      expect(res.status).toBe(403);
    });

    it("denies PATCH /settings for student role (403 forbidden)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "80" }),
      });
      expect(res.status).toBe(403);
    });

    it("rejects invalid non-numeric threshold values (400)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "abc" }),
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error.code).toBe("INVALID_THRESHOLD_VALUE");
    });

    it("rejects threshold value of 0 or below (400)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "0" }),
      });
      expect(res.status).toBe(400);

      const resNegative = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "-15" }),
      });
      expect(resNegative.status).toBe(400);
    });

    it("rejects threshold value exceeding 100 (400)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "100.5" }),
      });
      expect(res.status).toBe(400);
    });

    it("allows admin to update threshold and verifies PostgreSQL persistence and audit logging", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "80" }),
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.value).toBe("80");

      // Verify PostgreSQL persistence
      const setting = await prisma.systemSetting.findUniqueOrThrow({
        where: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT" },
      });
      expect(setting.value).toBe("80");

      // Verify AuditLog entry
      const auditLog = await prisma.auditLog.findFirst({
        where: {
          action: "SETTING_UPDATED",
          entityType: "SystemSetting",
          entityId: setting.id,
        },
        orderBy: { createdAt: "desc" },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorUserId).toBe(adminUserId);

      const metadata = JSON.parse(auditLog?.metadata || "{}");
      expect(metadata.key).toBe("LOW_ATTENDANCE_THRESHOLD_PERCENT");
      expect(metadata.previousValue).toBe("75");
      expect(metadata.newValue).toBe("80");
    });
  });

  describe("3. Runtime Impact on Alert Evaluation Policy", () => {
    it("evaluates student at 70% as at-risk when threshold is 75%", async () => {
      // 1. Reset threshold to 75%
      await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "75" }),
      });

      // 2. Evaluate student alerts
      const evalRes = await notificationsService.evaluateStudentAlerts(testStudentId);
      expect(evalRes.percentage).toBe(70);
      expect(evalRes.threshold).toBe(75);
      expect(evalRes.action).toBe("CREATED");

      // Verify active alert exists in database
      const alert = await prisma.notification.findFirst({
        where: { studentId: testStudentId, status: "UNREAD" },
      });
      expect(alert).not.toBeNull();
      expect(alert?.message).toContain("below the required threshold of 75%");
    });

    it("automatically resolves student alert when admin lowers threshold below student percentage (e.g. 65%)", async () => {
      // 1. Admin lowers threshold to 65%
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "65" }),
      });
      expect(res.status).toBe(200);

      // 2. Re-evaluate student alert (student is at 70%, which is >= 65%)
      const evalRes = await notificationsService.evaluateStudentAlerts(testStudentId);
      expect(evalRes.percentage).toBe(70);
      expect(evalRes.threshold).toBe(65);
      expect(evalRes.action).toBe("RESOLVED");

      // Verify alert is marked RESOLVED in database
      const resolvedAlert = await prisma.notification.findFirst({
        where: { studentId: testStudentId, status: "RESOLVED" },
      });
      expect(resolvedAlert).not.toBeNull();
      expect(resolvedAlert?.resolvedAt).not.toBeNull();
    });

    it("re-flags student alert when admin raises threshold back to 75%", async () => {
      // 1. Admin raises threshold back to 75%
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "75" }),
      });
      expect(res.status).toBe(200);

      // 2. Re-evaluate student alert (student is at 70%, which is < 75%)
      const evalRes = await notificationsService.evaluateStudentAlerts(testStudentId);
      expect(evalRes.percentage).toBe(70);
      expect(evalRes.threshold).toBe(75);
      expect(evalRes.action).toBe("CREATED");

      // Verify new alert is active
      const activeAlert = await prisma.notification.findFirst({
        where: { studentId: testStudentId, status: "UNREAD" },
      });
      expect(activeAlert).not.toBeNull();
    });
  });

  describe("4. Reset to Default & Metadata Updates", () => {
    it("allows updating institution name and timezone", async () => {
      const resName = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "INSTITUTION_NAME", value: "Apex University of Science" }),
      });
      expect(resName.status).toBe(200);

      const resTz = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "TIMEZONE", value: "Asia/Kolkata" }),
      });
      expect(resTz.status).toBe(200);

      // Verify settings list returns updated metadata
      const resGet = await fetch(`${baseUrl}/settings`, {
        headers: { Cookie: adminCookie },
      });
      const json = await resGet.json();
      expect(json.data.find((s: any) => s.key === "INSTITUTION_NAME")?.value).toBe("Apex University of Science");
      expect(json.data.find((s: any) => s.key === "TIMEZONE")?.value).toBe("Asia/Kolkata");
    });
  });
});
