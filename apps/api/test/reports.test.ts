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

describe("T-037: Role-Scoped Attendance History & Reports", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacher1Cookie: string; // Prof. Sharma (Assigned)
  let teacher2Cookie: string; // Prof. Verma (Unassigned)
  let student1Cookie: string; // Aarav (Active)
  let student2Cookie: string; // Ananya (Active)

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
  let originalS1ClassId: string | null = null;

  let activeSession1Id: string;
  let completedSession2Id: string;
  let completedSession3Id: string;
  let cancelledSessionId: string;

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
    const t2 = await prisma.user.findUniqueOrThrow({ where: { email: "prof.verma@college.edu" } });
    teacher2UserId = t2.id;

    // Fetch base academic fixtures
    const dept = await prisma.department.findFirstOrThrow();
    testDeptId = dept.id;
    const acadYear = await prisma.academicYear.findFirstOrThrow();
    testAcadYearId = acadYear.id;

    // Create 2 test subjects
    const sub1 = await prisma.subject.upsert({
      where: {
        departmentId_code: {
          departmentId: testDeptId,
          code: "RPT101",
        },
      },
      update: {},
      create: { code: "RPT101", name: "Report Analysis 1", departmentId: testDeptId },
    });
    testSubject1Id = sub1.id;

    const sub2 = await prisma.subject.upsert({
      where: {
        departmentId_code: {
          departmentId: testDeptId,
          code: "RPT102",
        },
      },
      update: {},
      create: { code: "RPT102", name: "Report Analysis 2", departmentId: testDeptId },
    });
    testSubject2Id = sub2.id;

    // Create a dedicated class for T-037 report verification
    const repClass = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 7,
          division: "RPT_A",
        },
      },
      update: {},
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 7,
        division: "RPT_A",
        label: "CS-Sem7-RptA",
      },
    });
    testClassId = repClass.id;

    // Create an unassigned class for authorization testing
    const unassignedClass = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 7,
          division: "UNASSIGNED",
        },
      },
      update: {},
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 7,
        division: "UNASSIGNED",
        label: "CS-Sem7-Unassigned",
      },
    });
    unassignedClassId = unassignedClass.id;

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

    // Update student 1 to belong to testClassId (and track original class to restore)
    const s1 = await prisma.student.findUniqueOrThrow({ where: { email: "student.aarav@college.edu" } });
    student1Id = s1.id;
    originalS1ClassId = s1.classId;
    await prisma.student.update({
      where: { id: student1Id },
      data: { classId: testClassId, status: StudentStatus.ACTIVE },
    });

    const s2 = await prisma.student.upsert({
      where: { email: "report.student2@college.edu" },
      update: { classId: testClassId, status: StudentStatus.ACTIVE },
      create: {
        name: "Report Student Two",
        email: "report.student2@college.edu",
        rollNumber: "REP-002",
        departmentId: testDeptId,
        academicYearId: acadYear.id,
        classId: testClassId,
        status: StudentStatus.ACTIVE,
      },
    });
    student2Id = s2.id;

    // Seed 4 sessions:
    // Session 1 (Subject 1): COMPLETED (student 1 PRESENT, student 2 ABSENT)
    const s1Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject1Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.COMPLETED,
        startsAt: new Date(Date.now() - 3 * 86400000), // 3 days ago
        closedAt: new Date(Date.now() - 3 * 86400000 + 3600000),
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

    // Session 2 (Subject 1): COMPLETED (student 1 LATE, student 2 PRESENT)
    const s2Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject1Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.COMPLETED,
        startsAt: new Date(Date.now() - 2 * 86400000), // 2 days ago
        closedAt: new Date(Date.now() - 2 * 86400000 + 3600000),
      },
    });
    completedSession3Id = s2Sess.id;

    await prisma.attendanceRecord.createMany({
      data: [
        {
          studentId: student1Id,
          sessionId: completedSession3Id,
          status: AttendanceStatus.LATE,
          method: AttendanceMethod.MANUAL_TEACHER,
        },
        {
          studentId: student2Id,
          sessionId: completedSession3Id,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        },
      ],
    });

    // Session 3 (Subject 2): ACTIVE (student 1 ABSENT, student 2 unrecorded)
    const s3Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject2Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.ACTIVE,
        startsAt: new Date(Date.now() - 1 * 86400000), // 1 day ago
      },
    });
    activeSession1Id = s3Sess.id;

    await prisma.attendanceRecord.create({
      data: {
        studentId: student1Id,
        sessionId: activeSession1Id,
        status: AttendanceStatus.ABSENT,
        method: AttendanceMethod.MANUAL_TEACHER,
      },
    });

    // Session 4 (Subject 1): CANCELLED (must be strictly excluded from denominator!)
    const s4Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject1Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.CANCELLED,
        startsAt: new Date(),
      },
    });
    cancelledSessionId = s4Sess.id;
  });

  afterAll(async () => {
    // Cleanup records & test sessions
    await prisma.attendanceRecord.deleteMany({
      where: {
        sessionId: {
          in: [activeSession1Id, completedSession2Id, completedSession3Id, cancelledSessionId].filter(Boolean),
        },
      },
    });

    await prisma.attendanceSession.deleteMany({
      where: {
        id: {
          in: [activeSession1Id, completedSession2Id, completedSession3Id, cancelledSessionId].filter(Boolean),
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
      where: { email: "report.student2@college.edu" },
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

  describe("1. Student Personal Attendance Report (GET /api/v1/reports/student/me)", () => {
    it("rejects unauthenticated requests (401 UNAUTHORIZED)", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me`);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects non-student roles (403 FORBIDDEN)", async () => {
      // Teacher attempting to call student personal report
      const teacherRes = await fetch(`${baseUrl}/reports/student/me`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(teacherRes.status).toBe(403);
      const data = await teacherRes.json();
      expect(data.error.code).toBe("FORBIDDEN");

      // Admin attempting to call student personal report
      const adminRes = await fetch(`${baseUrl}/reports/student/me`, {
        headers: { Cookie: adminCookie },
      });
      expect(adminRes.status).toBe(403);
    });

    it("allows authenticated student to retrieve their own attendance report and summary", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const { student, summary, subjects, history, pagination } = data.data;

      // Identity derivation verification
      expect(student.email).toBe("student.aarav@college.edu");
      expect(student.id).toBe(student1Id);

      // Verify calculation correctness:
      // Total eligible sessions = 3 (Session 1, 2, 3; Session 4 cancelled is excluded)
      expect(summary.totalEligibleSessions).toBe(3);
      // Student 1 records: Session 1 (PRESENT), Session 2 (LATE), Session 3 (ABSENT)
      // Attended = PRESENT(1) + LATE(1) = 2
      expect(summary.attendedCount).toBe(2);
      expect(summary.presentCount).toBe(1);
      expect(summary.lateCount).toBe(1);
      expect(summary.absentCount).toBe(1);
      expect(summary.excusedCount).toBe(0);

      // Overall Percentage = (2 / 3) * 100 = 66.7%
      expect(summary.overallPercentage).toBe(66.7);

      // Subject breakdown check
      expect(subjects.length).toBeGreaterThanOrEqual(2);
      const sub1Report = subjects.find((s: any) => s.subject.id === testSubject1Id);
      expect(sub1Report).toBeDefined();
      expect(sub1Report.totalSessions).toBe(2); // Session 1 and Session 2
      expect(sub1Report.attendedCount).toBe(2); // PRESENT + LATE
      expect(sub1Report.percentage).toBe(100);

      const sub2Report = subjects.find((s: any) => s.subject.id === testSubject2Id);
      expect(sub2Report).toBeDefined();
      expect(sub2Report.totalSessions).toBe(1); // Session 3
      expect(sub2Report.attendedCount).toBe(0); // ABSENT
      expect(sub2Report.percentage).toBe(0);

      // History and pagination
      expect(history.length).toBe(3);
      expect(pagination.total).toBe(3);
    });

    it("supports subject filter on attendance history", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me?subjectId=${testSubject1Id}`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      const { history, pagination } = data.data;

      expect(pagination.total).toBe(2);
      expect(history.every((h: any) => h.session.subject.id === testSubject1Id)).toBe(true);
    });

    it("supports status filter on attendance history", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me?status=${AttendanceStatus.PRESENT}`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      const { history, pagination } = data.data;

      expect(pagination.total).toBe(1);
      expect(history[0].status).toBe(AttendanceStatus.PRESENT);
    });

    it("supports pagination on attendance history", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me?page=1&limit=2`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      const { history, pagination } = data.data;

      expect(history.length).toBe(2);
      expect(pagination.page).toBe(1);
      expect(pagination.limit).toBe(2);
      expect(pagination.total).toBe(3);
      expect(pagination.totalPages).toBe(2);
    });

    it("handles zero eligible sessions gracefully (returns percentage: null, not 100%)", async () => {
      // Create a student in an empty class with 0 sessions
      const emptyClass = await prisma.class.upsert({
        where: {
          departmentId_academicYearId_semesterNumber_division: {
            departmentId: testDeptId,
            academicYearId: testAcadYearId,
            semesterNumber: 8,
            division: "EMPTY",
          },
        },
        update: {},
        create: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 8,
          division: "EMPTY",
          label: "CS-Sem8-Empty",
        },
      });

      const defaultHash = await bcrypt.hash("Password@123", 10);
      const emptyStudentUser = await prisma.user.upsert({
        where: { email: "empty.student@college.edu" },
        update: { passwordHash: defaultHash, status: UserStatus.ACTIVE },
        create: {
          name: "Empty Student",
          email: "empty.student@college.edu",
          passwordHash: defaultHash,
          role: Role.STUDENT,
          status: UserStatus.ACTIVE,
        },
      });

      const emptyStudent = await prisma.student.upsert({
        where: { email: "empty.student@college.edu" },
        update: { classId: emptyClass.id, status: StudentStatus.ACTIVE, userId: emptyStudentUser.id },
        create: {
          userId: emptyStudentUser.id,
          rollNumber: "EMPTY-001",
          name: "Empty Student",
          email: "empty.student@college.edu",
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          classId: emptyClass.id,
          status: StudentStatus.ACTIVE,
        },
      });

      try {
        // Login empty student
        const emptyToken = await loginUser("empty.student@college.edu");

        const res = await fetch(`${baseUrl}/reports/student/me`, {
          headers: { Cookie: emptyToken },
        });
        expect(res.status).toBe(200);
        const data = await res.json();

        expect(data.data.summary.totalEligibleSessions).toBe(0);
        expect(data.data.summary.overallPercentage).toBeNull();
        expect(data.data.history.length).toBe(0);
      } finally {
        // Clean up empty student & class
        await prisma.student.delete({ where: { id: emptyStudent.id } }).catch(() => {});
        await prisma.user.delete({ where: { id: emptyStudentUser.id } }).catch(() => {});
        await prisma.class.delete({ where: { id: emptyClass.id } }).catch(() => {});
      }
    });
  });

  describe("2. Teacher Class Attendance Report (GET /api/v1/reports/teacher/attendance)", () => {
    it("rejects unauthenticated requests (401 UNAUTHORIZED)", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance?classId=${testClassId}`);
      expect(res.status).toBe(401);
    });

    it("rejects student role from querying teacher reports (403 FORBIDDEN)", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance?classId=${testClassId}`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(403);
    });

    it("rejects teacher from querying an unassigned class (403 FORBIDDEN)", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance?classId=${unassignedClassId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("FORBIDDEN");
    });

    it("allows assigned teacher to query their class attendance report", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance?classId=${testClassId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const { class: classDetails, summary, students, pagination } = data.data;

      expect(classDetails.id).toBe(testClassId);
      expect(summary.totalStudents).toBe(2);
      expect(summary.totalSessionsHeld).toBe(3); // 3 held sessions (cancelled excluded)
      expect(typeof summary.classAveragePercentage).toBe("number");

      // Verify student metrics
      expect(students.length).toBe(2);
      const s1Data = students.find((s: any) => s.student.id === student1Id);
      expect(s1Data).toBeDefined();
      expect(s1Data.attendedCount).toBe(2);
      expect(s1Data.presentCount).toBe(1);
      expect(s1Data.lateCount).toBe(1);
      expect(s1Data.absentCount).toBe(1);
      expect(s1Data.percentage).toBe(66.7);

      const s2Data = students.find((s: any) => s.student.id === student2Id);
      expect(s2Data).toBeDefined();
      // Student 2: Session 1 (ABSENT), Session 2 (PRESENT), Session 3 (unrecorded)
      expect(s2Data.attendedCount).toBe(1);
      expect(s2Data.presentCount).toBe(1);
      expect(s2Data.absentCount).toBe(1);
      expect(s2Data.unrecordedCount).toBe(1);
      expect(s2Data.percentage).toBe(33.3);

      expect(pagination.total).toBe(2);
    });

    it("allows administrator to query attendance reports for any class", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance?classId=${unassignedClassId}`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.class.id).toBe(unassignedClassId);
    });

    it("supports search filter by student name or rollNumber", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance?classId=${testClassId}&search=Aarav`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.data.pagination.total).toBe(1);
      expect(data.data.students[0].student.name).toContain("Aarav");
    });

    it("validates mandatory classId parameter (400 BAD_REQUEST)", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("3. Administrator Institutional Summary (GET /api/v1/reports/admin/summary)", () => {
    it("rejects non-admin roles (403 FORBIDDEN)", async () => {
      const studentRes = await fetch(`${baseUrl}/reports/admin/summary`, {
        headers: { Cookie: student1Cookie },
      });
      expect(studentRes.status).toBe(403);

      const teacherRes = await fetch(`${baseUrl}/reports/admin/summary`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(teacherRes.status).toBe(403);
    });

    it("allows administrator to retrieve institution-level attendance summaries", async () => {
      const res = await fetch(`${baseUrl}/reports/admin/summary`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const { summary, departments, classes } = data.data;

      expect(summary.totalDepartments).toBeGreaterThan(0);
      expect(summary.totalClasses).toBeGreaterThan(0);
      expect(summary.totalActiveStudents).toBeGreaterThan(0);
      expect(summary.totalSessionsHeld).toBeGreaterThan(0);
      expect(typeof summary.overallAverageAttendance).toBe("number");

      expect(Array.isArray(departments)).toBe(true);
      expect(departments.some((d: any) => d.departmentId === testDeptId)).toBe(true);

      expect(Array.isArray(classes)).toBe(true);
      const repClassSummary = classes.find((c: any) => c.classId === testClassId);
      expect(repClassSummary).toBeDefined();
      expect(repClassSummary.sessionCount).toBe(3); // Cancelled session excluded
      expect(repClassSummary.studentCount).toBe(2);
    });

    it("supports filtering summary by departmentId", async () => {
      const res = await fetch(`${baseUrl}/reports/admin/summary?departmentId=${testDeptId}`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.data.departments.length).toBe(1);
      expect(data.data.departments[0].departmentId).toBe(testDeptId);
    });
  });
});
