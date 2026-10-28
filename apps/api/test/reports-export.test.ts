import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http, { createServer, Server } from "http";
import {
  PrismaClient,
  SessionStatus,
  StudentStatus,
  AttendanceStatus,
  AttendanceMethod,
} from "@prisma/client";
import { createApp } from "../src/app.js";
import {
  sanitizeCsvCell,
  formatCsvRow,
  UTF8_BOM,
} from "../src/modules/reports/csv-export.util.js";

describe("T-041: Attendance Reports & Streaming CSV Export", () => {
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
  let testSubject1Id: string;
  let testSubject2Id: string;

  let student1Id: string;
  let student2Id: string;
  let formulaStudentId: string;

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

    // Academic fixtures
    const dept = await prisma.department.findFirstOrThrow();
    testDeptId = dept.id;
    const acadYear = await prisma.academicYear.findFirstOrThrow();
    testAcadYearId = acadYear.id;

    // Subjects
    const sub1 = await prisma.subject.upsert({
      where: {
        departmentId_code: {
          departmentId: testDeptId,
          code: "EXP101",
        },
      },
      update: {},
      create: { code: "EXP101", name: "Export Engineering", departmentId: testDeptId },
    });
    testSubject1Id = sub1.id;

    const sub2 = await prisma.subject.upsert({
      where: {
        departmentId_code: {
          departmentId: testDeptId,
          code: "EXP102",
        },
      },
      update: {},
      create: { code: "EXP102", name: "Streaming Data", departmentId: testDeptId },
    });
    testSubject2Id = sub2.id;

    // Classes
    const c1 = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 7,
          division: "EXP-A",
        },
      },
      update: { active: true },
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 7,
        division: "EXP-A",
        label: "EXP-Sem7-A",
        active: true,
      },
    });
    testClassId = c1.id;

    const c2 = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 7,
          division: "EXP-B",
        },
      },
      update: { active: true },
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 7,
        division: "EXP-B",
        label: "EXP-Sem7-B",
        active: true,
      },
    });
    unassignedClassId = c2.id;

    const c3 = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 7,
          division: "EXP-C",
        },
      },
      update: { active: true },
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 7,
        division: "EXP-C",
        label: "EXP-Sem7-Empty",
        active: true,
      },
    });
    emptyClassId = c3.id;

    // Assign Teacher 1 to testClassId with testSubject1Id
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

    // Reassign Student 1 to testClassId
    const s1 = await prisma.student.findFirstOrThrow({ where: { email: "student.aarav@college.edu" } });
    student1Id = s1.id;
    await prisma.student.update({
      where: { id: student1Id },
      data: { classId: testClassId },
    });

    // Create student 2 in testClassId
    const s2 = await prisma.student.upsert({
      where: { email: "export.student2@college.edu" },
      update: { classId: testClassId, status: StudentStatus.ACTIVE },
      create: {
        name: "Test Student Two",
        email: "export.student2@college.edu",
        rollNumber: "EXP-002",
        classId: testClassId,
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        status: StudentStatus.ACTIVE,
      },
    });
    student2Id = s2.id;

    // Create student 3 with formula injection attempt in rollNumber and name
    const s3 = await prisma.student.upsert({
      where: { email: "formula.student@college.edu" },
      update: { classId: testClassId, status: StudentStatus.ACTIVE },
      create: {
        name: "=cmd|' /C calc'!A0",
        email: "formula.student@college.edu",
        rollNumber: "+EXP-999",
        classId: testClassId,
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        status: StudentStatus.ACTIVE,
      },
    });
    formulaStudentId = s3.id;

    // Sessions:
    // Session 1: ACTIVE (Subject 1) - Student 1 PRESENT
    const s1Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject1Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.ACTIVE,
        startsAt: new Date(Date.now() - 3600000), // 1 hour ago
      },
    });
    activeSession1Id = s1Sess.id;

    await prisma.attendanceRecord.create({
      data: {
        studentId: student1Id,
        sessionId: activeSession1Id,
        status: AttendanceStatus.PRESENT,
        method: AttendanceMethod.FACE_RECOGNITION,
        confidence: 0.94,
      },
    });

    // Session 2: COMPLETED (Subject 1) - Student 1 PRESENT, Student 2 ABSENT
    const s2Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject1Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.COMPLETED,
        startsAt: new Date(Date.now() - 3 * 86400000), // 3 days ago
        closedAt: new Date(Date.now() - 3 * 86400000 + 3600000),
      },
    });
    completedSession2Id = s2Sess.id;

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
        {
          studentId: formulaStudentId,
          sessionId: completedSession2Id,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
          correctionReason: "=HYPERLINK(\"http://evil.com\", \"Click\")",
        },
      ],
    });

    // Session 3: COMPLETED (Subject 2) - Student 1 LATE, Student 2 PRESENT
    const s3Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject2Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.COMPLETED,
        startsAt: new Date(Date.now() - 2 * 86400000), // 2 days ago
        closedAt: new Date(Date.now() - 2 * 86400000 + 3600000),
      },
    });
    completedSession3Id = s3Sess.id;

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
          method: AttendanceMethod.FACE_RECOGNITION,
        },
      ],
    });

    // Session 4: CANCELLED session - must be excluded from counts
    const s4Sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubject1Id,
        teacherUserId: teacher1UserId,
        status: SessionStatus.CANCELLED,
        startsAt: new Date(Date.now() - 86400000),
      },
    });
    cancelledSessionId = s4Sess.id;

    await prisma.attendanceRecord.create({
      data: {
        studentId: student1Id,
        sessionId: cancelledSessionId,
        status: AttendanceStatus.PRESENT,
        method: AttendanceMethod.MANUAL_TEACHER,
      },
    });
  });

  afterAll(async () => {
    // Clean records and sessions
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
      where: { email: { in: ["export.student2@college.edu", "formula.student@college.edu"] } },
    });

    await prisma.class.deleteMany({
      where: { id: { in: [testClassId, unassignedClassId, emptyClassId].filter(Boolean) } },
    });

    await prisma.subject.deleteMany({
      where: { id: { in: [testSubject1Id, testSubject2Id].filter(Boolean) } },
    });

    await prisma.$disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("1. CSV Utilities & Formula Injection Sanitization", () => {
    it("neutralizes formula triggers (=, +, -, @, \\t, \\r) by prepending single quote and quoting", () => {
      expect(sanitizeCsvCell("=SUM(A1:B10)")).toBe("\"'=SUM(A1:B10)\"");
      expect(sanitizeCsvCell("+12345")).toBe("\"'+12345\"");
      expect(sanitizeCsvCell("-DANGEROUS")).toBe("\"'-DANGEROUS\"");
      expect(sanitizeCsvCell("@EVIL")).toBe("\"'@EVIL\"");
      expect(sanitizeCsvCell("\tTAB_FORMULA")).toBe("\"'\tTAB_FORMULA\"");
      expect(sanitizeCsvCell("  =cmd|' /C calc'!A0")).toBe("\"'  =cmd|' /C calc'!A0\"");
    });

    it("escapes quotes, commas, and newlines per RFC 4180", () => {
      expect(sanitizeCsvCell("Normal String")).toBe("Normal String");
      expect(sanitizeCsvCell("Doe, John")).toBe("\"Doe, John\"");
      expect(sanitizeCsvCell("He said \"Hello\"")).toBe("\"He said \"\"Hello\"\"\"");
      expect(sanitizeCsvCell("Line1\nLine2")).toBe("\"Line1\nLine2\"");
      expect(sanitizeCsvCell("Line1\r\nLine2")).toBe("\"Line1\r\nLine2\"");
    });

    it("formats clean numbers, booleans, dates, and nulls", () => {
      expect(sanitizeCsvCell(42)).toBe("42");
      expect(sanitizeCsvCell(85.5)).toBe("85.5");
      expect(sanitizeCsvCell(true)).toBe("TRUE");
      expect(sanitizeCsvCell(false)).toBe("FALSE");
      expect(sanitizeCsvCell(null)).toBe("");
      expect(sanitizeCsvCell(undefined)).toBe("");
    });

    it("formats full CSV row with CRLF termination", () => {
      const row = formatCsvRow(["Roll", "Name", "=SUM(1,2)", 100]);
      expect(row).toBe("Roll,Name,\"'=SUM(1,2)\",100\r\n");
    });
  });

  describe("2. Student Attendance CSV Export (GET /reports/student/me/export)", () => {
    it("rejects unauthenticated export request with 401", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me/export`);
      expect(res.status).toBe(401);
    });

    it("rejects teacher or admin attempting student personal export with 403", async () => {
      const resTeacher = await fetch(`${baseUrl}/reports/student/me/export`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(resTeacher.status).toBe(403);

      const resAdmin = await fetch(`${baseUrl}/reports/student/me/export`, {
        headers: { Cookie: adminCookie },
      });
      expect(resAdmin.status).toBe(403);
    });

    it("exports authenticated student attendance data with correct CSV headers and UTF-8 BOM", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me/export`, {
        headers: { Cookie: student1Cookie },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="student-attendance-.*\.csv"/);
      expect(res.headers.get("cache-control")).toContain("no-cache");

      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // Verify raw bytes contain UTF-8 BOM (0xEF, 0xBB, 0xBF)
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);

      const text = Buffer.from(buf).toString("utf-8");
      const lines = text.trim().split("\r\n");
      expect(lines.length).toBeGreaterThanOrEqual(4); // Header + 3 sessions (active, completed2, completed3)

      const header = lines[0];
      expect(header).toBe("Date,Session Time,Subject Code,Subject Name,Teacher,Status,Method,Marked At,Correction Reason");

      // Verify records are present and cancelled session is excluded
      expect(text).toContain("EXP101");
      expect(text).toContain("EXP102");
      // Check that CANCELLED session is strictly excluded
      expect(text).not.toContain("CANCELLED");
    });

    it("supports status filtering in student export", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me/export?status=LATE`, {
        headers: { Cookie: student1Cookie },
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.replace(UTF8_BOM, "").trim().split("\r\n");

      // Header + 1 late record
      expect(lines.length).toBe(2);
      expect(lines[1]).toContain("LATE");
      expect(lines[1]).not.toContain("PRESENT");
    });

    it("supports subject filtering in student export", async () => {
      const res = await fetch(`${baseUrl}/reports/student/me/export?subjectId=${testSubject2Id}`, {
        headers: { Cookie: student1Cookie },
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.replace(UTF8_BOM, "").trim().split("\r\n");

      // Header + 1 session for subject 2
      expect(lines.length).toBe(2);
      expect(lines[1]).toContain("EXP102");
      expect(lines[1]).not.toContain("EXP101");
    });
  });

  describe("3. Teacher Class Attendance CSV Export (GET /reports/teacher/attendance/export)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${testClassId}`);
      expect(res.status).toBe(401);
    });

    it("rejects student access with 403", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${testClassId}`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(403);
    });

    it("rejects teacher attempting to export unassigned class with 403 FORBIDDEN", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${unassignedClassId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("FORBIDDEN");
    });

    it("allows assigned teacher to export class roster summary CSV", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${testClassId}`, {
        headers: { Cookie: teacher1Cookie },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="class-attendance-EXP-Sem7-A-roster-.*\.csv"/);

      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);

      const text = Buffer.from(buf).toString("utf-8");
      const lines = text.trim().split("\r\n");
      expect(lines[0]).toBe("Roll Number,Student Name,Email,Total Sessions,Present,Late,Absent,Excused,Unrecorded,Attended Count,Attendance Percentage,Status");

      // Verify Student 1 Aarav stats: 3 eligible sessions, 2 present, 1 late = 3 attended = 100%
      expect(text).toContain("student.aarav@college.edu");
      expect(text).toContain("100%");
      expect(text).toContain("Good Standing");
    });

    it("allows teacher to export detailed session-by-session records (format=sessions)", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${testClassId}&format=sessions`, {
        headers: { Cookie: teacher1Cookie },
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.replace(UTF8_BOM, "").trim().split("\r\n");

      expect(lines[0]).toBe("Roll Number,Student Name,Date,Session Time,Subject Code,Subject Name,Status,Method,Marked At,Correction Reason");
      expect(text).toContain("EXP101");
      expect(text).toContain("FACE_RECOGNITION");
      expect(text).toContain("MANUAL_TEACHER");
    });

    it("neutralizes spreadsheet formula injection in student data during CSV export", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${testClassId}`, {
        headers: { Cookie: teacher1Cookie },
      });

      expect(res.status).toBe(200);
      const text = await res.text();

      // Student 3 had name "=cmd|' /C calc'!A0" and rollNumber "+EXP-999"
      // They should be safely prefixed with single quote `'` and enclosed in double quotes
      expect(text).toContain("\"'=cmd|' /C calc'!A0\"");
      expect(text).toContain("\"'+EXP-999\"");
    });

    it("handles class with 0 sessions gracefully returning empty roster with status 200", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${emptyClassId}`, {
        headers: { Cookie: adminCookie },
      });

      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.replace(UTF8_BOM, "").trim().split("\r\n");
      expect(lines[0]).toBe("Roll Number,Student Name,Email,Total Sessions,Present,Late,Absent,Excused,Unrecorded,Attended Count,Attendance Percentage,Status");
      // 0 students in empty class -> only header
      expect(lines.length).toBe(1);
    });

    it("allows Admin to export any class attendance report", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${unassignedClassId}`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
    });
  });

  describe("4. Admin Institutional Summary CSV Export (GET /reports/admin/summary/export)", () => {
    it("rejects unauthenticated requests with 401", async () => {
      const res = await fetch(`${baseUrl}/reports/admin/summary/export`);
      expect(res.status).toBe(401);
    });

    it("rejects student and teacher roles with 403", async () => {
      const resStudent = await fetch(`${baseUrl}/reports/admin/summary/export`, {
        headers: { Cookie: student1Cookie },
      });
      expect(resStudent.status).toBe(403);

      const resTeacher = await fetch(`${baseUrl}/reports/admin/summary/export`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(resTeacher.status).toBe(403);
    });

    it("allows Admin to export institution summary CSV with proper aggregations", async () => {
      const res = await fetch(`${baseUrl}/reports/admin/summary/export`, {
        headers: { Cookie: adminCookie },
      });

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="institution-attendance-summary-.*\.csv"/);

      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      expect(bytes[0]).toBe(0xef);
      expect(bytes[1]).toBe(0xbb);
      expect(bytes[2]).toBe(0xbf);

      const text = Buffer.from(buf).toString("utf-8");
      const lines = text.trim().split("\r\n");
      expect(lines[0]).toBe("Department Code,Department Name,Class Label,Academic Year,Active Students,Total Sessions Held,Attended Count,Total Opportunities,Average Attendance %,Status");
      expect(text).toContain("EXP-Sem7-A");
    });
  });

  describe("5. API Spec Compatibility Alias (GET /reports/attendance/export)", () => {
    it("dispatches to class attendance export when classId is provided", async () => {
      const res = await fetch(`${baseUrl}/reports/attendance/export?classId=${testClassId}`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
    });

    it("dispatches to admin summary export when called by admin without classId", async () => {
      const res = await fetch(`${baseUrl}/reports/attendance/export`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="institution-attendance-summary-.*\.csv"/);
    });
  });

  describe("6. Stream Lifecycle & Client Disconnect Handling", () => {
    it("handles abrupt client disconnect without unhandled exceptions or resource leaks", async () => {
      await new Promise<void>((resolve, reject) => {
        const url = new URL(`${baseUrl}/reports/teacher/attendance/export?classId=${testClassId}`);
        const clientReq = http.request(
          url,
          {
            headers: { Cookie: adminCookie },
          },
          (res) => {
            // Read initial data chunk, then immediately destroy client socket to simulate disconnect
            res.once("data", () => {
              clientReq.destroy();
              setTimeout(() => {
                resolve();
              }, 100);
            });
          }
        );
        clientReq.on("error", (err: any) => {
          if (err.code === "ECONNRESET" || err.message.includes("socket hang up") || err.message.includes("aborted")) {
            resolve();
          } else {
            reject(err);
          }
        });
        clientReq.end();
      });
    });

    it("verifies staged CSV export safely cleans up and rejects before headers are sent on failure", async () => {
      // Simulate mid-generation failure
      let headersWereSent = false;
      const mockRes: any = {
        headersSent: false,
        writableEnded: false,
        setHeader: () => {
          headersWereSent = true;
          mockRes.headersSent = true;
        },
        write: () => true,
        end: () => {
          mockRes.writableEnded = true;
        },
        on: () => {},
        off: () => {},
      };

      // Import reportsService and global prisma instance directly
      const { reportsService } = await import("../src/modules/reports/reports.service.js");
      const { prisma: globalPrisma } = await import("../src/lib/prisma.js");
      
      // Temporarily mock globalPrisma.student.findMany to throw an error during the batch loop
      const originalFindMany = globalPrisma.student.findMany;
      (globalPrisma.student as any).findMany = async (...args: any[]) => {
        if (args[0]?.where?.classId) {
          throw new Error("Simulated transient database connection drop during staged export");
        }
        return (originalFindMany as any).apply(globalPrisma.student, args);
      };

      let caughtError: any = null;
      try {
        await reportsService.exportTeacherAttendanceCsv(
          teacher1UserId,
          "TEACHER" as any,
          { classId: testClassId, format: "roster" } as any,
          mockRes
        );
      } catch (err) {
        caughtError = err;
      } finally {
        globalPrisma.student.findMany = originalFindMany;
      }

      // Headers must NEVER have been sent - preventing HTTP 200 with partial/corrupted CSV
      expect(headersWereSent).toBe(false);
      expect(caughtError).toBeDefined();
      expect(caughtError.message).toContain("Simulated transient database connection drop during staged export");
    });
  });
});
