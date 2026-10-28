import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import {
  PrismaClient,
  Role,
  UserStatus,
  SessionStatus,
  StudentStatus,
  AttendanceStatus,
  AttendanceMethod,
} from "@prisma/client";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";

describe("T-042: Configurable Low-Attendance Alerts & Notifications", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacher1Cookie: string; // Prof. Sharma (Assigned)
  let teacher2Cookie: string; // Prof. Verma (Unassigned)
  let student1Cookie: string; // Aarav (Active)
  let student2Cookie: string; // Ananya (Active)

  let teacher1UserId: string;

  let testDeptId: string;
  let testAcadYearId: string;
  let testClassId: string;
  let unassignedClassId: string;
  let emptyClassId: string;
  let testSubjectId: string;

  let student1Id: string;
  let student2Id: string;

  let session1Id: string;
  let session2Id: string;
  let session3Id: string;
  let cancelledSessionId: string;
  let recordToCorrectId: string;

  const extractCookie = (res: globalThis.Response): string => {
    const rawCookie = res.headers.get("set-cookie") || "";
    const match = rawCookie.match(/session_token=[^;]+/);
    return match ? match[0] : "";
  };

  const loginUser = async (email: string) => {
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
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    baseUrl = `http://localhost:${port}/api/v1`;

    adminCookie = await loginUser("admin@college.edu");
    teacher1Cookie = await loginUser("prof.sharma@college.edu");
    teacher2Cookie = await loginUser("prof.verma@college.edu");
    student1Cookie = await loginUser("student.aarav@college.edu");
    student2Cookie = await loginUser("student.ananya@college.edu");

    const t1 = await prisma.user.findUniqueOrThrow({ where: { email: "prof.sharma@college.edu" } });
    teacher1UserId = t1.id;

    // Academic fixtures
    const dept = await prisma.department.findFirstOrThrow();
    testDeptId = dept.id;
    const acadYear = await prisma.academicYear.findFirstOrThrow();
    testAcadYearId = acadYear.id;

    const sub = await prisma.subject.upsert({
      where: {
        departmentId_code: {
          departmentId: testDeptId,
          code: "ALT101",
        },
      },
      update: {},
      create: { code: "ALT101", name: "Alert Systems", departmentId: testDeptId },
    });
    testSubjectId = sub.id;

    // Test Cohorts
    const c1 = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 8,
          division: "ALT-A",
        },
      },
      update: { active: true },
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 8,
        division: "ALT-A",
        label: "ALT-Sem8-A",
        active: true,
      },
    });
    testClassId = c1.id;

    const c2 = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 8,
          division: "ALT-B",
        },
      },
      update: { active: true },
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 8,
        division: "ALT-B",
        label: "ALT-Sem8-B",
        active: true,
      },
    });
    unassignedClassId = c2.id;

    const c3 = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 8,
          division: "ALT-Empty",
        },
      },
      update: { active: true },
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 8,
        division: "ALT-Empty",
        label: "ALT-Sem8-Empty",
        active: true,
      },
    });
    emptyClassId = c3.id;

    // Teacher assignment (Teacher 1 -> testClassId)
    await prisma.teacherAssignment.upsert({
      where: {
        classId_subjectId: {
          classId: testClassId,
          subjectId: testSubjectId,
        },
      },
      update: { active: true },
      create: {
        teacherUserId: teacher1UserId,
        classId: testClassId,
        subjectId: testSubjectId,
        active: true,
      },
    });

    // Reassign Student 1 to testClassId
    const s1 = await prisma.student.findFirstOrThrow({ where: { email: "student.aarav@college.edu" } });
    student1Id = s1.id;
    await prisma.student.update({
      where: { id: student1Id },
      data: { classId: testClassId },
    });

    // Student 2 user and profile in empty class (0 sessions)
    const studentUser2 = await prisma.user.upsert({
      where: { email: "alert.student2@college.edu" },
      update: { status: UserStatus.ACTIVE, role: Role.STUDENT },
      create: {
        name: "Alert Test Student Two",
        email: "alert.student2@college.edu",
        passwordHash: await bcrypt.hash("Password@123", 10),
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
      },
    });

    const s2 = await prisma.student.upsert({
      where: { email: "alert.student2@college.edu" },
      update: { classId: emptyClassId, status: StudentStatus.ACTIVE, userId: studentUser2.id },
      create: {
        userId: studentUser2.id,
        name: "Alert Test Student Two",
        email: "alert.student2@college.edu",
        rollNumber: "ALT-002",
        classId: emptyClassId,
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        status: StudentStatus.ACTIVE,
      },
    });
    student2Id = s2.id;
    student2Cookie = await loginUser("alert.student2@college.edu");

    // Sessions for testClassId:
    // Session 1: COMPLETED (Student 1 ABSENT)
    const s1Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubjectId,
        teacherUserId: teacher1UserId,
        status: SessionStatus.COMPLETED,
        startsAt: new Date(Date.now() - 3 * 86400000),
        closedAt: new Date(Date.now() - 3 * 86400000 + 3600000),
      },
    });
    session1Id = s1Sess.id;

    const r1 = await prisma.attendanceRecord.create({
      data: {
        studentId: student1Id,
        sessionId: session1Id,
        status: AttendanceStatus.ABSENT,
        method: AttendanceMethod.MANUAL_TEACHER,
      },
    });
    recordToCorrectId = r1.id;

    // Session 2: COMPLETED (Student 1 PRESENT)
    const s2Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubjectId,
        teacherUserId: teacher1UserId,
        status: SessionStatus.COMPLETED,
        startsAt: new Date(Date.now() - 2 * 86400000),
        closedAt: new Date(Date.now() - 2 * 86400000 + 3600000),
      },
    });
    session2Id = s2Sess.id;

    await prisma.attendanceRecord.create({
      data: {
        studentId: student1Id,
        sessionId: session2Id,
        status: AttendanceStatus.PRESENT,
        method: AttendanceMethod.FACE_RECOGNITION,
      },
    });

    // Session 3: COMPLETED (Student 1 ABSENT)
    // At this point: 1 attended (PRESENT) out of 3 sessions = 33.3% (< 75%)
    const s3Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubjectId,
        teacherUserId: teacher1UserId,
        status: SessionStatus.COMPLETED,
        startsAt: new Date(Date.now() - 86400000),
        closedAt: new Date(Date.now() - 86400000 + 3600000),
      },
    });
    session3Id = s3Sess.id;

    await prisma.attendanceRecord.create({
      data: {
        studentId: student1Id,
        sessionId: session3Id,
        status: AttendanceStatus.ABSENT,
        method: AttendanceMethod.MANUAL_TEACHER,
      },
    });

    // Cancelled Session: strictly excluded from denominator
    const scSess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubjectId,
        teacherUserId: teacher1UserId,
        status: SessionStatus.CANCELLED,
        startsAt: new Date(),
      },
    });
    cancelledSessionId = scSess.id;

    // Reset default threshold to 75% for tests
    await prisma.systemSetting.upsert({
      where: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT" },
      update: { value: "75" },
      create: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "75" },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { studentId: { in: [student1Id, student2Id].filter(Boolean) } },
    });

    await prisma.attendanceRecord.deleteMany({
      where: {
        sessionId: {
          in: [session1Id, session2Id, session3Id, cancelledSessionId].filter(Boolean),
        },
      },
    });

    await prisma.attendanceSession.deleteMany({
      where: {
        id: {
          in: [session1Id, session2Id, session3Id, cancelledSessionId].filter(Boolean),
        },
      },
    });

    await prisma.teacherAssignment.deleteMany({
      where: { classId: { in: [testClassId, unassignedClassId, emptyClassId].filter(Boolean) } },
    });

    const seededClass = await prisma.class.findFirst({
      where: { label: "CSE-Sem4-A" },
    });
    if (seededClass) {
      await prisma.student.updateMany({
        where: { classId: { in: [testClassId, unassignedClassId, emptyClassId].filter(Boolean) } },
        data: { classId: seededClass.id },
      });
    }

    await prisma.student.deleteMany({
      where: { email: "alert.student2@college.edu" },
    });

    await prisma.user.deleteMany({
      where: { email: "alert.student2@college.edu" },
    });

    await prisma.class.deleteMany({
      where: { id: { in: [testClassId, unassignedClassId, emptyClassId].filter(Boolean) } },
    });

    await prisma.subject.deleteMany({
      where: { id: testSubjectId },
    });

    await prisma.$disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("1. Configurable Settings & Threshold Management (/api/v1/settings)", () => {
    it("denies unauthenticated access to settings (401)", async () => {
      const res = await fetch(`${baseUrl}/settings`);
      expect(res.status).toBe(401);
    });

    it("denies student access to read or update settings (403)", async () => {
      const resGet = await fetch(`${baseUrl}/settings`, {
        headers: { Cookie: student1Cookie },
      });
      expect(resGet.status).toBe(403);

      const resPatch = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: student1Cookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "80" }),
      });
      expect(resPatch.status).toBe(403);
    });

    it("allows teachers and admins to read settings", async () => {
      const resTeacher = await fetch(`${baseUrl}/settings`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(resTeacher.status).toBe(200);
      const dataTeacher = await resTeacher.json();
      expect(dataTeacher.success).toBe(true);

      const resAdmin = await fetch(`${baseUrl}/settings`, {
        headers: { Cookie: adminCookie },
      });
      expect(resAdmin.status).toBe(200);
      const dataAdmin = await resAdmin.json();
      expect(dataAdmin.data.some((s: any) => s.key === "LOW_ATTENDANCE_THRESHOLD_PERCENT")).toBe(true);
    });

    it("allows admin to update threshold and validates percentage bounds", async () => {
      // Invalid bounds (> 100)
      const resInvalid = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "150" }),
      });
      expect(resInvalid.status).toBe(400);

      // Valid update to 75%
      const resValid = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "75" }),
      });
      expect(resValid.status).toBe(200);
      const data = await resValid.json();
      expect(data.data.value).toBe("75");

      // Verify audit log created
      const audit = await prisma.auditLog.findFirst({
        where: { action: "SETTING_UPDATED", entityType: "SystemSetting" },
        orderBy: { createdAt: "desc" },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe("2. Alert Evaluation Policy & Deduplication", () => {
    it("does not generate an attendance alert when zero eligible sessions exist", async () => {
      // Student 2 is in emptyClassId with 0 eligible sessions
      const res = await fetch(`${baseUrl}/notifications/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ studentId: student2Id }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.action).toBe("NONE_NO_SESSIONS");
      expect(data.data.percentage).toBeNull();

      // Check no notification was created
      const notifs = await prisma.notification.findMany({
        where: { studentId: student2Id },
      });
      expect(notifs.length).toBe(0);
    });

    it("generates a low-attendance alert when attendance is below threshold (33.3% < 75%)", async () => {
      // Trigger evaluation for student 1 (1 present out of 3 held sessions)
      const res = await fetch(`${baseUrl}/notifications/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ studentId: student1Id }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.action).toBe("CREATED");
      expect(data.data.percentage).toBe(33.3);

      const notifs = await prisma.notification.findMany({
        where: { studentId: student1Id, type: "LOW_ATTENDANCE", status: "UNREAD" },
      });
      expect(notifs.length).toBe(1);
      expect(notifs[0].dedupKey).toBe("LOW_ATTENDANCE:OVERALL");
      expect(notifs[0].message).toContain("33.3%");
      expect(notifs[0].message).toContain("75%");
    });

    it("prevents duplicate unresolved notifications on repeated evaluations (stable deduplication)", async () => {
      // Run evaluation 3 consecutive times
      for (let i = 0; i < 3; i++) {
        const res = await fetch(`${baseUrl}/notifications/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ studentId: student1Id }),
        });
        expect(res.status).toBe(200);
        const data = await res.json();
        expect(data.data.action).toBe("DEDUPLICATED_UPDATED");
      }

      // Verify still exactly 1 unresolved notification exists
      const notifs = await prisma.notification.findMany({
        where: { studentId: student1Id, type: "LOW_ATTENDANCE", status: { in: ["UNREAD", "READ"] } },
      });
      expect(notifs.length).toBe(1);
    });

    it("handles concurrent evaluation calls safely without duplicate alert creation", async () => {
      // Fire 4 concurrent evaluations simultaneously
      const results = await Promise.all([
        fetch(`${baseUrl}/notifications/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ studentId: student1Id }),
        }),
        fetch(`${baseUrl}/notifications/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ studentId: student1Id }),
        }),
        fetch(`${baseUrl}/notifications/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: adminCookie },
          body: JSON.stringify({ studentId: student1Id }),
        }),
      ]);

      for (const r of results) {
        expect(r.status).toBe(200);
      }

      // Check still only 1 active notification exists
      const count = await prisma.notification.count({
        where: { studentId: student1Id, dedupKey: "LOW_ATTENDANCE:OVERALL", status: { in: ["UNREAD", "READ"] } },
      });
      expect(count).toBe(1);
    });
  });

  describe("3. Student Notification Lifecycle (Read, Unread & Authorization)", () => {
    it("allows student to fetch their own notifications and unread badge count", async () => {
      const res = await fetch(`${baseUrl}/notifications/my`, {
        headers: { Cookie: student1Cookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.unreadCount).toBeGreaterThanOrEqual(1);
      expect(data.data.hasActiveAlert).toBe(true);
      expect(data.data.notifications.length).toBeGreaterThanOrEqual(1);
      expect(data.data.activeAlert).not.toBeNull();
    });

    it("allows student to mark an unread notification as READ", async () => {
      const notif = await prisma.notification.findFirstOrThrow({
        where: { studentId: student1Id, status: "UNREAD" },
      });

      const res = await fetch(`${baseUrl}/notifications/${notif.id}/read`, {
        method: "PATCH",
        headers: { Cookie: student1Cookie },
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe("READ");

      // Verify unread count is updated
      const resAfter = await fetch(`${baseUrl}/notifications/my`, {
        headers: { Cookie: student1Cookie },
      });
      const dataAfter = await resAfter.json();
      expect(dataAfter.data.unreadCount).toBe(0);
    });

    it("prevents another student from marking a notification as READ (403)", async () => {
      const notif = await prisma.notification.findFirstOrThrow({
        where: { studentId: student1Id },
      });

      // Student 2 tries to mark Student 1's notification as read
      const res = await fetch(`${baseUrl}/notifications/${notif.id}/read`, {
        method: "PATCH",
        headers: { Cookie: student2Cookie },
      });
      expect(res.status).toBe(403);
    });

    it("allows student to resolve their own alert", async () => {
      const notif = await prisma.notification.findFirstOrThrow({
        where: { studentId: student1Id, status: "READ" },
      });

      const res = await fetch(`${baseUrl}/notifications/${notif.id}/resolve`, {
        method: "PATCH",
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe("RESOLVED");
      expect(data.data.resolvedAt).not.toBeNull();
    });
  });

  describe("4. Attendance Correction Integration & Automatic Alert Resolution", () => {
    it("automatically resolves low-attendance alert when attendance recovers above threshold", async () => {
      // 1. Re-create an active alert for Student 1 (currently at 33.3%)
      await prisma.notification.deleteMany({ where: { studentId: student1Id } });
      await fetch(`${baseUrl}/notifications/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ studentId: student1Id }),
      });

      const alertBefore = await prisma.notification.findFirst({
        where: { studentId: student1Id, dedupKey: "LOW_ATTENDANCE:OVERALL", status: "UNREAD" },
      });
      expect(alertBefore).not.toBeNull();

      // 2. Correct session 1 record from ABSENT to PRESENT
      // This increases attended count to 2 out of 3 = 66.7%
      await fetch(`${baseUrl}/attendance-records/${recordToCorrectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          status: "PRESENT",
          correctionReason: "Medical note verified for lecture",
        }),
      });

      // 3. Lower threshold temporarily to 60% via settings
      await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "60" }),
      });

      // 4. Trigger evaluation: 66.7% >= 60% -> alert should auto-resolve!
      const resEval = await fetch(`${baseUrl}/notifications/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ studentId: student1Id }),
      });
      expect(resEval.status).toBe(200);
      const evalData = await resEval.json();
      expect(evalData.data.action).toBe("RESOLVED");

      // Verify the notification status is now RESOLVED in DB
      const alertAfter = await prisma.notification.findUnique({
        where: { id: alertBefore!.id },
      });
      expect(alertAfter?.status).toBe("RESOLVED");
      expect(alertAfter?.resolvedAt).not.toBeNull();

      // Reset threshold back to 75%
      await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ key: "LOW_ATTENDANCE_THRESHOLD_PERCENT", value: "75" }),
      });
    });
  });

  describe("5. Teacher Role Scoping for Class Notifications (/notifications/class/:classId)", () => {
    it("denies unauthenticated requests with 401", async () => {
      const res = await fetch(`${baseUrl}/notifications/class/${testClassId}`);
      expect(res.status).toBe(401);
    });

    it("denies student role access with 403", async () => {
      const res = await fetch(`${baseUrl}/notifications/class/${testClassId}`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(403);
    });

    it("denies teacher access to unassigned class alerts with 403 FORBIDDEN", async () => {
      const res = await fetch(`${baseUrl}/notifications/class/${unassignedClassId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("FORBIDDEN");
    });

    it("allows assigned teacher to view active low-attendance alerts for their class", async () => {
      const res = await fetch(`${baseUrl}/notifications/class/${testClassId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.data)).toBe(true);
    });

    it("allows admin to view alerts for any class", async () => {
      const res = await fetch(`${baseUrl}/notifications/class/${unassignedClassId}`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
    });
  });
});
