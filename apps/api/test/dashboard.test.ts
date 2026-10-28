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
import { createApp } from "../src/app.js";
import bcrypt from "bcrypt";

describe("T-040: Role-Scoped Dashboard Metrics & Charts (GET /api/v1/reports/dashboard)", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacher1Cookie: string;
  let teacher2Cookie: string;
  let studentCookie: string;

  let teacher1UserId: string;
  let teacher2UserId: string;

  let testDeptId: string;
  let testAcadYearId: string;
  let testClassId: string;
  let unassignedClassId: string;
  let testSubject1Id: string;
  let testSubject2Id: string;

  let student1Id: string;
  let student2Id: string;

  let activeSession1Id: string;
  let completedSession2Id: string;

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
    studentCookie = await loginUser("student.aarav@college.edu");

    const t1 = await prisma.user.findUniqueOrThrow({ where: { email: "prof.sharma@college.edu" } });
    teacher1UserId = t1.id;
    const t2 = await prisma.user.findUniqueOrThrow({ where: { email: "prof.verma@college.edu" } });
    teacher2UserId = t2.id;

    const dept = await prisma.department.findFirstOrThrow();
    testDeptId = dept.id;
    const acadYear = await prisma.academicYear.findFirstOrThrow();
    testAcadYearId = acadYear.id;

    // Create test class
    const cls = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 7,
          division: "DASH_TEST_A",
        },
      },
      update: {},
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 7,
        division: "DASH_TEST_A",
        label: "CS-Sem7-DashTest",
      },
    });
    testClassId = cls.id;

    // Create unassigned class for teacher 1
    const unassignedCls = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 7,
          division: "DASH_UNASSIGNED",
        },
      },
      update: {},
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 7,
        division: "DASH_UNASSIGNED",
        label: "CS-Sem7-DashUnassigned",
      },
    });
    unassignedClassId = unassignedCls.id;

    // Create 2 test subjects
    const sub1 = await prisma.subject.upsert({
      where: {
        departmentId_code: {
          departmentId: testDeptId,
          code: "CS798",
        },
      },
      update: {},
      create: {
        code: "CS798",
        name: "Dashboard Analytics 1",
        departmentId: testDeptId,
      },
    });
    testSubject1Id = sub1.id;

    const sub2 = await prisma.subject.upsert({
      where: {
        departmentId_code: {
          departmentId: testDeptId,
          code: "CS799",
        },
      },
      update: {},
      create: {
        code: "CS799",
        name: "Dashboard Analytics 2",
        departmentId: testDeptId,
      },
    });
    testSubject2Id = sub2.id;

    // Assign Teacher 1 to testClass + testSubject1
    await prisma.teacherAssignment.upsert({
      where: {
        classId_subjectId: {
          classId: testClassId,
          subjectId: testSubject1Id,
        },
      },
      update: { active: true },
      create: {
        teacherUserId: teacher1UserId,
        classId: testClassId,
        subjectId: testSubject1Id,
        active: true,
      },
    });

    // Reassign student 1 to testClassId
    const s1 = await prisma.student.findUniqueOrThrow({ where: { email: "student.aarav@college.edu" } });
    student1Id = s1.id;
    await prisma.student.update({
      where: { id: student1Id },
      data: { classId: testClassId, status: StudentStatus.ACTIVE },
    });

    const s2 = await prisma.student.upsert({
      where: { email: "dash.student2@college.edu" },
      update: { classId: testClassId, status: StudentStatus.ACTIVE },
      create: {
        name: "Dash Student Two",
        email: "dash.student2@college.edu",
        rollNumber: "DASH-002",
        departmentId: testDeptId,
        academicYearId: acadYear.id,
        classId: testClassId,
        status: StudentStatus.ACTIVE,
      },
    });
    student2Id = s2.id;

    // Seed 2 sessions:
    // Session 1: COMPLETED (student 1 PRESENT, student 2 ABSENT)
    const s1Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject1Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.COMPLETED,
        startsAt: new Date(Date.now() - 2 * 86400000), // 2 days ago
        closedAt: new Date(Date.now() - 2 * 86400000 + 3600000),
      },
    });
    completedSession2Id = s1Sess.id;

    await prisma.attendanceRecord.createMany({
      data: [
        {
          studentId: student1Id,
          sessionId: completedSession2Id,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.FACE_RECOGNITION,
        },
        {
          studentId: student2Id,
          sessionId: completedSession2Id,
          status: AttendanceStatus.ABSENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        },
      ],
    });

    // Session 2: ACTIVE (student 1 LATE, student 2 not yet recorded)
    const s2Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject1Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.ACTIVE,
        startsAt: new Date(Date.now() - 86400000), // 1 day ago
      },
    });
    activeSession1Id = s2Sess.id;

    await prisma.attendanceRecord.create({
      data: {
        studentId: student1Id,
        sessionId: activeSession1Id,
        status: AttendanceStatus.LATE,
        method: AttendanceMethod.MANUAL_TEACHER,
      },
    });
  });

  afterAll(async () => {
    // Cleanup sessions & records
    await prisma.attendanceRecord.deleteMany({
      where: {
        sessionId: {
          in: [activeSession1Id, completedSession2Id].filter(Boolean),
        },
      },
    });

    await prisma.attendanceSession.deleteMany({
      where: {
        id: {
          in: [activeSession1Id, completedSession2Id].filter(Boolean),
        },
      },
    });

    await prisma.teacherAssignment.deleteMany({
      where: { classId: { in: [testClassId, unassignedClassId].filter(Boolean) } },
    });

    const seededClass = await prisma.class.findFirst({
      where: { label: "CSE-Sem4-A" },
    });
    if (seededClass) {
      await prisma.student.updateMany({
        where: { classId: { in: [testClassId, unassignedClassId].filter(Boolean) } },
        data: { classId: seededClass.id },
      });
    }

    await prisma.student.deleteMany({
      where: { email: "dash.student2@college.edu" },
    });

    await prisma.class.deleteMany({
      where: { id: { in: [testClassId, unassignedClassId].filter(Boolean) } },
    });

    await prisma.subject.deleteMany({
      where: { id: { in: [testSubject1Id, testSubject2Id].filter(Boolean) } },
    });

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await prisma.$disconnect();
  });

  describe("1. Access Control", () => {
    it("rejects unauthenticated requests with 401 UNAUTHORIZED", async () => {
      const res = await fetch(`${baseUrl}/reports/dashboard`);
      expect(res.status).toBe(401);
    });
  });

  describe("2. Student Dashboard Metrics", () => {
    it("returns student personal KPI stats, trend, and subject breakdown", async () => {
      const res = await fetch(`${baseUrl}/reports/dashboard`, {
        headers: { Cookie: studentCookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const dash = data.data;
      expect(dash.role).toBe(Role.STUDENT);
      expect(dash.kpis).toBeDefined();

      // Student 1 attended 2 sessions (1 PRESENT + 1 LATE) out of 2 eligible sessions = 100%
      expect(dash.kpis.totalEligibleSessions).toBe(2);
      expect(dash.kpis.attendedSessions).toBe(2);
      expect(dash.kpis.overallAttendancePercentage).toBe(100);
      expect(dash.kpis.standing).toBe("GOOD_STANDING");
      expect(dash.kpis.threshold).toBe(75);

      // Trend data points
      expect(Array.isArray(dash.trend)).toBe(true);
      expect(dash.trend.length).toBeGreaterThan(0);
      expect(dash.trend[0].date).toBeDefined();
      expect(typeof dash.trend[0].attendancePercentage).toBe("number");

      // Subject breakdown
      expect(Array.isArray(dash.subjectBreakdown)).toBe(true);
      const subDash = dash.subjectBreakdown.find((s: any) => s.subjectId === testSubject1Id);
      expect(subDash).toBeDefined();
      expect(subDash.code).toBe("CS798");
      expect(subDash.percentage).toBe(100);
      expect(subDash.isBelowThreshold).toBe(false);

      // Recent activity
      expect(Array.isArray(dash.recentActivity)).toBe(true);
      expect(dash.recentActivity.length).toBeGreaterThan(0);
    });

    it("handles student with zero sessions gracefully without divide-by-zero", async () => {
      const emptyClass = await prisma.class.upsert({
        where: {
          departmentId_academicYearId_semesterNumber_division: {
            departmentId: testDeptId,
            academicYearId: testAcadYearId,
            semesterNumber: 8,
            division: "DASH_EMPTY",
          },
        },
        update: {},
        create: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 8,
          division: "DASH_EMPTY",
          label: "CS-Sem8-DashEmpty",
        },
      });

      const defaultHash = await bcrypt.hash("Password@123", 10);
      const emptyUser = await prisma.user.upsert({
        where: { email: "dash.empty.student@college.edu" },
        update: { passwordHash: defaultHash, status: UserStatus.ACTIVE },
        create: {
          name: "Empty Dash Student",
          email: "dash.empty.student@college.edu",
          passwordHash: defaultHash,
          role: Role.STUDENT,
          status: UserStatus.ACTIVE,
        },
      });

      const emptyStudent = await prisma.student.upsert({
        where: { email: "dash.empty.student@college.edu" },
        update: { classId: emptyClass.id, status: StudentStatus.ACTIVE, userId: emptyUser.id },
        create: {
          userId: emptyUser.id,
          rollNumber: "DASHEMPTY-001",
          name: "Empty Dash Student",
          email: "dash.empty.student@college.edu",
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          classId: emptyClass.id,
          status: StudentStatus.ACTIVE,
        },
      });

      try {
        const token = await loginUser("dash.empty.student@college.edu");
        const res = await fetch(`${baseUrl}/reports/dashboard`, {
          headers: { Cookie: token },
        });
        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.data.kpis.totalEligibleSessions).toBe(0);
        expect(data.data.kpis.overallAttendancePercentage).toBeNull();
        expect(data.data.kpis.standing).toBe("NO_SESSIONS");
        expect(data.data.trend.length).toBe(0);
        expect(data.data.subjectBreakdown.length).toBe(0);
      } finally {
        await prisma.student.delete({ where: { id: emptyStudent.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: emptyUser.id } }).catch(() => {});
        await prisma.class.delete({ where: { id: emptyClass.id } }).catch(() => {});
      }
    });
  });

  describe("3. Teacher Dashboard Metrics", () => {
    it("returns teacher class stats, daily trend, and subject averages", async () => {
      const res = await fetch(`${baseUrl}/reports/dashboard`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const dash = data.data;
      expect(dash.role).toBe(Role.TEACHER);
      expect(dash.kpis.totalAssignedClasses).toBeGreaterThan(0);
      expect(dash.kpis.totalStudents).toBeGreaterThan(0);
      expect(dash.kpis.totalSessionsConducted).toBeGreaterThan(0);
      expect(typeof dash.kpis.classAveragePercentage).toBe("number");

      // Trend data points
      expect(Array.isArray(dash.trend)).toBe(true);
      expect(dash.trend.length).toBeGreaterThan(0);

      // Subject breakdown
      expect(Array.isArray(dash.subjectBreakdown)).toBe(true);
      expect(dash.subjectBreakdown.length).toBeGreaterThan(0);
    });

    it("rejects teacher querying an unassigned class with 403 CLASS_NOT_ASSIGNED", async () => {
      const res = await fetch(`${baseUrl}/reports/dashboard?classId=${unassignedClassId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("4. Admin Dashboard Metrics", () => {
    it("returns institution-level totals, department breakdown, and activity trend", async () => {
      const res = await fetch(`${baseUrl}/reports/dashboard`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const dash = data.data;
      expect(dash.role).toBe(Role.ADMIN);
      expect(dash.kpis.totalDepartments).toBeGreaterThan(0);
      expect(dash.kpis.totalClasses).toBeGreaterThan(0);
      expect(dash.kpis.totalActiveStudents).toBeGreaterThan(0);
      expect(dash.kpis.totalSessionsHeld).toBeGreaterThan(0);
      expect(typeof dash.kpis.overallAverageAttendance).toBe("number");

      expect(Array.isArray(dash.departmentBreakdown)).toBe(true);
      expect(dash.departmentBreakdown.length).toBeGreaterThan(0);
      expect(Array.isArray(dash.trend)).toBe(true);
    });

    it("supports custom timeframe parameter (e.g. days=14)", async () => {
      const res = await fetch(`${baseUrl}/reports/dashboard?days=14`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.timeframeDays).toBe(14);
    });
  });
});
