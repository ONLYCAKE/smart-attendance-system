import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, Server } from "http";
import { PrismaClient, Role, SessionStatus, StudentStatus, AttendanceStatus, AttendanceMethod } from "@prisma/client";
import { createApp } from "../src/app.js";
import { encryptDescriptor } from "../src/modules/enrollment/encryption.util.js";

describe("T-033 & T-035: Attendance Session Management & Recognition Integration", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacher1Cookie: string; // Prof. Sharma (Assigned)
  let teacher2Cookie: string; // Prof. Verma (Unassigned)
  let studentCookie: string;

  let teacher1UserId: string;
  let teacher2UserId: string;
  let cseClassId: string;
  let otherClassId: string;
  let cseSubjectId: string;
  let timetableEntryId: string;
  let activeStudentId: string;
  let activeStudent2Id: string;
  let pendingStudentId: string;
  let otherClassStudentId: string;

  let student1Vector: number[];
  let student2Vector: number[];

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
    const acadYear = await prisma.academicYear.findFirstOrThrow();
    const subject = await prisma.subject.findFirstOrThrow();
    cseSubjectId = subject.id;

    // Dedicated test class to avoid interfering with seeded CSE-Sem4-A active session
    const testClass = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: dept.id,
          academicYearId: acadYear.id,
          semesterNumber: 4,
          division: "SESS_TEST_A",
        },
      },
      update: {},
      create: {
        departmentId: dept.id,
        academicYearId: acadYear.id,
        semesterNumber: 4,
        division: "SESS_TEST_A",
        label: "CS-Sem4-SessTest",
      },
    });
    cseClassId = testClass.id;

    // Dedicated teacher assignment for teacher 1
    const assignment = await prisma.teacherAssignment.upsert({
      where: {
        classId_subjectId: {
          classId: cseClassId,
          subjectId: cseSubjectId,
        },
      },
      update: { active: true, teacherUserId: teacher1UserId },
      create: {
        teacherUserId: teacher1UserId,
        subjectId: cseSubjectId,
        classId: cseClassId,
        active: true,
      },
    });

    // Dedicated timetable entry
    let tt = await prisma.timetableEntry.findFirst({
      where: { teacherAssignmentId: assignment.id },
    });
    if (!tt) {
      tt = await prisma.timetableEntry.create({
        data: {
          classId: cseClassId,
          subjectId: cseSubjectId,
          teacherAssignmentId: assignment.id,
          dayOfWeek: 1,
          startTime: "10:00",
          endTime: "11:00",
          room: "Room-SessTest",
        },
      });
    }
    timetableEntryId = tt.id;

    // Dedicated test students
    const activeStudent = await prisma.student.upsert({
      where: { email: "sess.active@college.edu" },
      update: { classId: cseClassId, status: StudentStatus.ACTIVE },
      create: {
        name: "Session Active Student",
        email: "sess.active@college.edu",
        rollNumber: "SESS-001",
        departmentId: dept.id,
        academicYearId: acadYear.id,
        classId: cseClassId,
        status: StudentStatus.ACTIVE,
      },
    });
    activeStudentId = activeStudent.id;

    const activeStudent2 = await prisma.student.upsert({
      where: { email: "sess.active2@college.edu" },
      update: { classId: cseClassId, status: StudentStatus.ACTIVE },
      create: {
        name: "Session Active Student 2",
        email: "sess.active2@college.edu",
        rollNumber: "SESS-003",
        departmentId: dept.id,
        academicYearId: acadYear.id,
        classId: cseClassId,
        status: StudentStatus.ACTIVE,
      },
    });
    activeStudent2Id = activeStudent2.id;

    // Vector generation helper
    const generateVector = (seed: number, dim = 1024): number[] => {
      const vec = Array.from({ length: dim }, (_, i) => Math.sin(seed + i * 0.1));
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
      return vec.map((v) => v / norm);
    };

    student1Vector = generateVector(1);
    student2Vector = generateVector(50);

    const pendingStudent = await prisma.student.upsert({
      where: { email: "sess.pending@college.edu" },
      update: { classId: cseClassId, status: StudentStatus.PENDING },
      create: {
        name: "Session Pending Student",
        email: "sess.pending@college.edu",
        rollNumber: "SESS-002",
        departmentId: dept.id,
        academicYearId: acadYear.id,
        classId: cseClassId,
        status: StudentStatus.PENDING,
      },
    });
    pendingStudentId = pendingStudent.id;

    // Create a second class and student to test class cohort isolation
    const secondClass = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: dept.id,
          academicYearId: acadYear.id,
          semesterNumber: 6,
          division: "SESS_TEST_B",
        },
      },
      update: {},
      create: {
        departmentId: dept.id,
        academicYearId: acadYear.id,
        semesterNumber: 6,
        division: "SESS_TEST_B",
        label: "CS-Sem6-SessTestB",
      },
    });
    otherClassId = secondClass.id;

    const otherStudent = await prisma.student.upsert({
      where: { email: "rohan.other@college.edu" },
      update: { classId: otherClassId, status: StudentStatus.ACTIVE },
      create: {
        name: "Rohan Kumar",
        email: "rohan.other@college.edu",
        rollNumber: "CS-2026-888",
        departmentId: dept.id,
        academicYearId: acadYear.id,
        classId: otherClassId,
        status: StudentStatus.ACTIVE,
      },
    });
    otherClassStudentId = otherStudent.id;
  });

  afterAll(async () => {
    const sIds = [activeStudentId, activeStudent2Id, pendingStudentId, otherClassStudentId].filter(Boolean);
    const cIds = [cseClassId, otherClassId].filter(Boolean);

    if (sIds.length > 0) {
      await prisma.attendanceRecord.deleteMany({
        where: { studentId: { in: sIds } },
      });
      await prisma.faceEnrollment.deleteMany({
        where: { studentId: { in: sIds } },
      });
      await prisma.biometricConsent.deleteMany({
        where: { studentId: { in: sIds } },
      });
    }
    if (cIds.length > 0) {
      await prisma.attendanceSession.deleteMany({
        where: { classId: { in: cIds } },
      });
      await prisma.timetableEntry.deleteMany({
        where: { teacherAssignment: { classId: { in: cIds } } },
      });
      await prisma.teacherAssignment.deleteMany({
        where: { classId: { in: cIds } },
      });
    }
    if (sIds.length > 0) {
      await prisma.student.deleteMany({
        where: { id: { in: sIds } },
      });
    }
    if (cIds.length > 0) {
      await prisma.class.deleteMany({
        where: { id: { in: cIds } },
      });
    }

    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  beforeEach(async () => {
    const sIds = [activeStudentId, activeStudent2Id, pendingStudentId, otherClassStudentId].filter(Boolean);
    const cIds = [cseClassId, otherClassId].filter(Boolean);
    if (sIds.length > 0) {
      await prisma.attendanceRecord.deleteMany({
        where: { studentId: { in: sIds } },
      });
    }
    if (cIds.length > 0) {
      await prisma.attendanceSession.deleteMany({
        where: { classId: { in: cIds } },
      });
    }

    // Reset biometric consent and face enrollment for active test students
    if (activeStudentId && student1Vector) {
      await prisma.biometricConsent.upsert({
        where: { studentId: activeStudentId },
        update: { status: "GRANTED", revokedAt: null, consentVersion: "1.0" },
        create: { studentId: activeStudentId, status: "GRANTED", consentVersion: "1.0" },
      });
      await prisma.faceEnrollment.upsert({
        where: { studentId: activeStudentId },
        update: {
          status: "ACTIVE",
          provider: "human",
          modelVersion: "faceres-v1",
          descriptors: encryptDescriptor(student1Vector),
          deletedAt: null,
        },
        create: {
          studentId: activeStudentId,
          status: "ACTIVE",
          provider: "human",
          modelVersion: "faceres-v1",
          descriptors: encryptDescriptor(student1Vector),
        },
      });
    }

    if (activeStudent2Id && student2Vector) {
      await prisma.biometricConsent.upsert({
        where: { studentId: activeStudent2Id },
        update: { status: "GRANTED", revokedAt: null, consentVersion: "1.0" },
        create: { studentId: activeStudent2Id, status: "GRANTED", consentVersion: "1.0" },
      });
      await prisma.faceEnrollment.upsert({
        where: { studentId: activeStudent2Id },
        update: {
          status: "ACTIVE",
          provider: "human",
          modelVersion: "faceres-v1",
          descriptors: encryptDescriptor(student2Vector),
          deletedAt: null,
        },
        create: {
          studentId: activeStudent2Id,
          status: "ACTIVE",
          provider: "human",
          modelVersion: "faceres-v1",
          descriptors: encryptDescriptor(student2Vector),
        },
      });
    }
  });

  describe("1. Session Authorization & Creation", () => {
    it("denies unauthenticated users from creating sessions", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timetableEntryId }),
      });
      expect(res.status).toBe(401);
    });

    it("denies students from creating attendance sessions", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: studentCookie,
        },
        body: JSON.stringify({ timetableEntryId }),
      });
      expect(res.status).toBe(403);
    });

    it("denies non-assigned teacher from opening a session for another teacher's timetable entry", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: teacher2Cookie, // Prof. Verma (not assigned to this slot)
        },
        body: JSON.stringify({ timetableEntryId }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("TEACHER_NOT_ASSIGNED");
    });

    it("rejects non-existent timetable entry", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: teacher1Cookie,
        },
        body: JSON.stringify({ timetableEntryId: "00000000-0000-0000-0000-000000000000" }),
      });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error.code).toBe("TIMETABLE_ENTRY_NOT_FOUND");
    });

    it("allows assigned teacher to open an ACTIVE session for a valid timetable entry", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: teacher1Cookie,
        },
        body: JSON.stringify({ timetableEntryId }),
      });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe(SessionStatus.ACTIVE);
      expect(data.data.classId).toBe(cseClassId);
      expect(data.data.subjectId).toBe(cseSubjectId);
      expect(data.data.teacherUserId).toBe(teacher1UserId);

      // Verify audit log
      const log = await prisma.auditLog.findFirst({
        where: { action: "ATTENDANCE_SESSION_CREATED", entityId: data.data.id },
      });
      expect(log).toBeDefined();
    });

    it("enforces duplicate-session protection: rejects opening second active session for same class and subject", async () => {
      // First active session
      await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ timetableEntryId }),
      });

      // Second attempt
      const res2 = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ timetableEntryId }),
      });
      expect(res2.status).toBe(409);
      const data2 = await res2.json();
      expect(data2.error.code).toBe("ACTIVE_SESSION_EXISTS");
    });
  });

  describe("2. Session Lifecycle & State Transitions", () => {
    it("safely closes and finalizes an active session", async () => {
      const createRes = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ timetableEntryId }),
      });
      const session = (await createRes.json()).data;

      const closeRes = await fetch(`${baseUrl}/attendance-sessions/${session.id}/close`, {
        method: "POST",
        headers: { Cookie: teacher1Cookie },
      });
      expect(closeRes.status).toBe(200);
      const closeData = await closeRes.json();
      expect(closeData.data.status).toBe(SessionStatus.COMPLETED);
      expect(closeData.data.closedAt).toBeDefined();

      const log = await prisma.auditLog.findFirst({
        where: { action: "ATTENDANCE_SESSION_CLOSED", entityId: session.id },
      });
      expect(log).toBeDefined();
    });

    it("idempotently handles repeated close requests", async () => {
      const createRes = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ timetableEntryId }),
      });
      const session = (await createRes.json()).data;

      await fetch(`${baseUrl}/attendance-sessions/${session.id}/close`, {
        method: "POST",
        headers: { Cookie: teacher1Cookie },
      });

      const res2 = await fetch(`${baseUrl}/attendance-sessions/${session.id}/close`, {
        method: "POST",
        headers: { Cookie: teacher1Cookie },
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.message).toContain("already completed");
    });

    it("denies unassigned teacher from closing another teacher's session", async () => {
      const createRes = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ timetableEntryId }),
      });
      const session = (await createRes.json()).data;

      const res = await fetch(`${baseUrl}/attendance-sessions/${session.id}/close`, {
        method: "POST",
        headers: { Cookie: teacher2Cookie }, // Prof. Verma trying to close Prof. Sharma's session
      });
      expect(res.status).toBe(403);
    });
  });

  describe("3. Attendance Recording, Eligibility & Duplicate Protection", () => {
    let activeSessionId: string;

    beforeEach(async () => {
      const createRes = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ timetableEntryId }),
      });
      const session = (await createRes.json()).data;
      activeSessionId = session.id;
    });

    it("rejects marking attendance when session is COMPLETED", async () => {
      await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/close`, {
        method: "POST",
        headers: { Cookie: teacher1Cookie },
      });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("SESSION_NOT_ACTIVE");
    });

    it("rejects marking attendance for student belonging to a different class", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: otherClassStudentId, // Rohan is in Sem6-DivB, session is for Sem4-DivA
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("STUDENT_NOT_IN_CLASS");
    });

    it("rejects marking attendance for unapproved / PENDING student", async () => {
      // Temporarily link Diya Shah to cseClass to test status check
      await prisma.student.update({
        where: { id: pendingStudentId },
        data: { classId: cseClassId, status: StudentStatus.PENDING },
      });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: pendingStudentId,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("STUDENT_NOT_ACTIVE");
    });

    it("rejects method FACE_RECOGNITION if student has revoked or missing consent", async () => {
      // Ensure Aarav has no consent
      await prisma.biometricConsent.deleteMany({ where: { studentId: activeStudentId } });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.FACE_RECOGNITION,
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("CONSENT_REQUIRED_FOR_BIOMETRIC");
    });

    it("successfully marks eligible student attendance via MANUAL_TEACHER", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const record = await prisma.attendanceRecord.findUniqueOrThrow({
        where: {
          studentId_sessionId: {
            studentId: activeStudentId,
            sessionId: activeSessionId,
          },
        },
      });
      expect(record.status).toBe(AttendanceStatus.PRESENT);
      expect(record.method).toBe(AttendanceMethod.MANUAL_TEACHER);
    });

    it("safely and idempotently handles concurrent duplicate attendance submissions", async () => {
      const [resA, resB] = await Promise.all([
        fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            studentId: activeStudentId,
            status: AttendanceStatus.PRESENT,
            method: AttendanceMethod.MANUAL_TEACHER,
          }),
        }),
        fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            studentId: activeStudentId,
            status: AttendanceStatus.PRESENT,
            method: AttendanceMethod.MANUAL_TEACHER,
          }),
        }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // Verify exactly ONE database record exists
      const count = await prisma.attendanceRecord.count({
        where: {
          studentId: activeStudentId,
          sessionId: activeSessionId,
        },
      });
      expect(count).toBe(1);
    });

    it("allows teacher to update student status with audit logging", async () => {
      // Mark PRESENT
      await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });

      // Update to LATE with reason
      const updateRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          status: AttendanceStatus.LATE,
          method: AttendanceMethod.MANUAL_TEACHER,
          overrideReason: "Arrived 15 minutes late due to transit delay",
        }),
      });
      expect(updateRes.status).toBe(200);

      const record = await prisma.attendanceRecord.findUniqueOrThrow({
        where: {
          studentId_sessionId: {
            studentId: activeStudentId,
            sessionId: activeSessionId,
          },
        },
      });
      expect(record.status).toBe(AttendanceStatus.LATE);

      const auditLog = await prisma.auditLog.findFirst({
        where: { action: "ATTENDANCE_OVERRIDE", entityId: record.id },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.metadata?.includes("transit delay")).toBe(true);
    });

    it("returns session details, attendance tally, and student roster", async () => {
      // Mark Aarav PRESENT
      await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });

      const getRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(getRes.status).toBe(200);
      const data = await getRes.json();
      expect(data.data.session.id).toBe(activeSessionId);
      expect(data.data.summary.presentCount).toBe(1);
      expect(data.data.roster.length).toBeGreaterThan(0);
      expect(data.data.roster[0].attendance).toBeDefined();
    });
  });

  describe("4. Camera-Assisted Face Recognition & Ambiguity Handling", () => {
    let activeSessionId: string;

    beforeEach(async () => {
      const createRes = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ timetableEntryId }),
      });
      const session = (await createRes.json()).data;
      activeSessionId = session.id;
    });

    it("denies unauthenticated users from executing face recognition", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(res.status).toBe(401);
    });

    it("denies non-assigned teacher from executing face recognition on another teacher's session", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher2Cookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(res.status).toBe(403);
    });

    it("rejects recognition when session is not ACTIVE (COMPLETED)", async () => {
      // Close session
      await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/close`, {
        method: "POST",
        headers: { Cookie: teacher1Cookie },
      });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("SESSION_NOT_ACTIVE");
    });

    it("rejects incompatible model version or provider", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          provider: "compreface",
          modelVersion: "v2",
          descriptor: student1Vector,
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("INCOMPATIBLE_MODEL");
    });

    it("rejects malformed descriptor vectors (insufficient dimensions or non-finite numbers)", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          descriptor: [1.0, 2.0, 3.0], // only 3 floats
        }),
      });
      expect(res.status).toBe(400);
    });

    it("returns NO_MATCH when probe descriptor does not match any enrolled student in cohort", async () => {
      // Vector seed 9999 has negligible similarity with student1 and student2
      const unknownVector = Array.from({ length: 1024 }, (_, i) => Math.cos(9999 + i * 0.7));
      const norm = Math.sqrt(unknownVector.reduce((sum, v) => sum + v * v, 0));
      const normalizedUnknown = unknownVector.map((v) => v / norm);

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: normalizedUnknown }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.outcome).toBe("NO_MATCH");
      expect(data.data.confidence).toBeLessThan(0.82);
    });

    it("excludes students with revoked consent from matching pool", async () => {
      // Revoke consent for activeStudentId
      await prisma.biometricConsent.update({
        where: { studentId: activeStudentId },
        data: { status: "REVOKED", revokedAt: new Date(), revocationReason: "Privacy concern" },
      });

      // Probe with student1Vector
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      // Should not match activeStudentId since consent is revoked
      expect(data.data.outcome).toBe("NO_MATCH");
    });

    it("excludes students with deleted biometric enrollment from matching pool", async () => {
      // Delete biometric enrollment for activeStudentId
      await prisma.faceEnrollment.delete({ where: { studentId: activeStudentId } });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.outcome).toBe("NO_MATCH");
    });

    it("excludes unapproved / PENDING students from matching pool", async () => {
      // Enroll pending student
      const pendingVector = Array.from({ length: 1024 }, (_, i) => Math.sin(300 + i * 0.1));
      const norm = Math.sqrt(pendingVector.reduce((sum, v) => sum + v * v, 0));
      const normalizedPending = pendingVector.map((v) => v / norm);

      await prisma.biometricConsent.upsert({
        where: { studentId: pendingStudentId },
        update: { status: "GRANTED", revokedAt: null },
        create: { studentId: pendingStudentId, status: "GRANTED" },
      });
      await prisma.faceEnrollment.upsert({
        where: { studentId: pendingStudentId },
        update: {
          status: "ACTIVE",
          provider: "human",
          modelVersion: "faceres-v1",
          descriptors: encryptDescriptor(normalizedPending),
        },
        create: {
          studentId: pendingStudentId,
          status: "ACTIVE",
          provider: "human",
          modelVersion: "faceres-v1",
          descriptors: encryptDescriptor(normalizedPending),
        },
      });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: normalizedPending }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.outcome).toBe("NO_MATCH");
    });

    it("identifies candidate with high confidence (>= 0.82) without finalizing attendance (recognition alone never marks attendance)", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.outcome).toBe("MATCH_FOUND");
      expect(data.data.confidence).toBeGreaterThanOrEqual(0.82);
      expect(data.data.candidate.id).toBe(activeStudentId);
      expect(data.data.requiresTeacherConfirmation).toBe(true);
      expect(data.data.recorded).toBe(false);
      expect(data.data.isAlreadyMarked).toBe(false);

      // Invariant: Recognition result alone must NOT finalize attendance
      const count = await prisma.attendanceRecord.count({
        where: { studentId: activeStudentId, sessionId: activeSessionId },
      });
      expect(count).toBe(0);
    });

    it("allows authorized teacher to confirm recognized candidate and records attendance", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
          teacherConfirmed: true,
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const record = await prisma.attendanceRecord.findUniqueOrThrow({
        where: { studentId_sessionId: { studentId: activeStudentId, sessionId: activeSessionId } },
      });
      expect(record.status).toBe(AttendanceStatus.PRESENT);
      expect(record.method).toBe(AttendanceMethod.FACE_RECOGNITION);
      expect(record.confidence).toBe(0.94);
    });

    it("detects already marked student on re-scan and returns isAlreadyMarked: true without duplicate error", async () => {
      // Confirm candidate first
      await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
          teacherConfirmed: true,
        }),
      });

      // Subsequent recognition scan
      const res2 = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.data.outcome).toBe("MATCH_FOUND");
      expect(data2.data.isAlreadyMarked).toBe(true);
      expect(data2.data.existingRecord).toBeDefined();

      // Exactly 1 record in database
      const count = await prisma.attendanceRecord.count({
        where: { studentId: activeStudentId, sessionId: activeSessionId },
      });
      expect(count).toBe(1);
    });

    it("blocks unauthorized teacher and student from calling /recognize or /confirm-recognition (403 FORBIDDEN)", async () => {
      // Student cannot call recognize
      const studRec = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(studRec.status).toBe(403);

      // Student cannot call confirm-recognition
      const studConf = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
        }),
      });
      expect(studConf.status).toBe(403);

      // Unassigned teacher cannot call confirm-recognition
      const unassignedConf = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher2Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
        }),
      });
      expect(unassignedConf.status).toBe(403);
    });

    it("blocks recognition and confirmation on closed sessions (400 SESSION_NOT_ACTIVE)", async () => {
      // Close session
      await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/close`, {
        method: "POST",
        headers: { Cookie: teacher1Cookie },
      });

      const recRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(recRes.status).toBe(400);
      expect((await recRes.json()).error.code).toBe("SESSION_NOT_ACTIVE");

      const confRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
        }),
      });
      expect(confRes.status).toBe(400);
      expect((await confRes.json()).error.code).toBe("SESSION_NOT_ACTIVE");
    });

    it("transactional safeguard: rejects confirmation if biometric consent was revoked in-flight (400 CONSENT_REQUIRED_FOR_BIOMETRIC)", async () => {
      // In-flight consent revocation simulation
      await prisma.biometricConsent.update({
        where: { studentId: activeStudentId },
        data: { status: "REVOKED", revokedAt: new Date(), revocationReason: "Withdrawn during scan" },
      });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
          teacherConfirmed: true,
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("CONSENT_REQUIRED_FOR_BIOMETRIC");

      // Verify no record persisted
      const count = await prisma.attendanceRecord.count({
        where: { studentId: activeStudentId, sessionId: activeSessionId },
      });
      expect(count).toBe(0);
    });

    it("transactional safeguard: rejects confirmation if biometric enrollment was deleted in-flight", async () => {
      // Delete enrollment
      await prisma.faceEnrollment.delete({ where: { studentId: activeStudentId } });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
          teacherConfirmed: true,
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("BIOMETRIC_ENROLLMENT_REQUIRED");

      const count = await prisma.attendanceRecord.count({
        where: { studentId: activeStudentId, sessionId: activeSessionId },
      });
      expect(count).toBe(0);
    });

    it("rejects confirmation for inactive or non-cohort students (400 STUDENT_NOT_ACTIVE / STUDENT_NOT_IN_CLASS)", async () => {
      // Inactive student
      const inactiveRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: pendingStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
          teacherConfirmed: true,
        }),
      });
      expect(inactiveRes.status).toBe(400);
      expect((await inactiveRes.json()).error.code).toBe("STUDENT_NOT_ACTIVE");

      // Non-cohort student
      const nonCohortRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: otherClassStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
          teacherConfirmed: true,
        }),
      });
      expect(nonCohortRes.status).toBe(400);
      expect((await nonCohortRes.json()).error.code).toBe("STUDENT_NOT_IN_CLASS");
    });

    it("detects ambiguous match (UNCERTAIN_MATCH) when runner-up is within 0.08 margin", async () => {
      // Mix student1Vector with a small component of student2Vector so similarity is ~0.98
      const mixed = student1Vector.map((v, i) => v + (student2Vector[i] ?? 0) * 0.15);
      const normMixed = Math.sqrt(mixed.reduce((s, v) => s + v * v, 0));
      const ambiguousVector = mixed.map((v) => v / normMixed);

      // Enroll student 2 with the ambiguous close vector
      await prisma.faceEnrollment.update({
        where: { studentId: activeStudent2Id },
        data: { descriptors: encryptDescriptor(ambiguousVector) },
      });

      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ descriptor: student1Vector }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.outcome).toBe("UNCERTAIN_MATCH");
      expect(data.data.requiresTeacherConfirmation).toBe(true);
      expect(data.data.candidate.id).toBe(activeStudentId);
      expect(data.data.runnerUp.id).toBe(activeStudent2Id);
      expect(data.data.ambiguityMargin).toBeLessThan(0.08);

      // Verify no attendance was marked automatically for uncertain match
      const count = await prisma.attendanceRecord.count({
        where: { sessionId: activeSessionId },
      });
      expect(count).toBe(0);
    });

    it("allows teacher to confirm candidate from ambiguous match with audit logging", async () => {
      // Confirm candidate 1
      const confirmRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.88,
          status: AttendanceStatus.PRESENT,
          overrideReason: "Teacher visually verified student identity following ambiguous scan",
        }),
      });
      expect(confirmRes.status).toBe(200);

      const record = await prisma.attendanceRecord.findUniqueOrThrow({
        where: { studentId_sessionId: { studentId: activeStudentId, sessionId: activeSessionId } },
      });
      expect(record.status).toBe(AttendanceStatus.PRESENT);

      const log = await prisma.auditLog.findFirst({
        where: { action: "ATTENDANCE_RECORDED_RECOGNITION", entityId: record.id },
      });
      expect(log).toBeDefined();
      expect(log?.metadata?.includes("visually verified")).toBe(true);
      // Ensure zero vector numbers or images logged in audit log
      expect(log?.metadata?.includes("descriptor")).toBe(false);
    });

    it("safely and idempotently handles concurrent duplicate confirmation submissions", async () => {
      const [resA, resB] = await Promise.all([
        fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            studentId: activeStudentId,
            confidence: 0.94,
            status: AttendanceStatus.PRESENT,
            teacherConfirmed: true,
          }),
        }),
        fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            studentId: activeStudentId,
            confidence: 0.94,
            status: AttendanceStatus.PRESENT,
            teacherConfirmed: true,
          }),
        }),
      ]);

      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);

      // Exactly ONE attendance record exists
      const count = await prisma.attendanceRecord.count({
        where: { studentId: activeStudentId, sessionId: activeSessionId },
      });
      expect(count).toBe(1);
    });

    it("protects manual teacher attendance from silent unreasoned clobbering by recognition confirmation", async () => {
      // First, teacher manually marks student ABSENT
      await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          status: AttendanceStatus.ABSENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });

      // Try confirming face recognition PRESENT without overrideReason -> should be blocked
      const blockedRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
          teacherConfirmed: true,
        }),
      });
      expect(blockedRes.status).toBe(400);
      const blockedData = await blockedRes.json();
      expect(blockedData.error.code).toBe("MANUAL_RECORD_EXISTS");

      // Verify status is still ABSENT and method is MANUAL_TEACHER
      let record = await prisma.attendanceRecord.findUniqueOrThrow({
        where: { studentId_sessionId: { studentId: activeStudentId, sessionId: activeSessionId } },
      });
      expect(record.status).toBe(AttendanceStatus.ABSENT);
      expect(record.method).toBe(AttendanceMethod.MANUAL_TEACHER);

      // Now provide an explicit overrideReason -> succeeds and logs override
      const allowedRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          confidence: 0.94,
          status: AttendanceStatus.PRESENT,
          teacherConfirmed: true,
          overrideReason: "Student arrived after manual register was closed; confirmed by camera",
        }),
      });
      expect(allowedRes.status).toBe(200);

      record = await prisma.attendanceRecord.findUniqueOrThrow({
        where: { studentId_sessionId: { studentId: activeStudentId, sessionId: activeSessionId } },
      });
      expect(record.status).toBe(AttendanceStatus.PRESENT);
      expect(record.method).toBe(AttendanceMethod.FACE_RECOGNITION);

      const overrideLog = await prisma.auditLog.findFirst({
        where: { action: "ATTENDANCE_OVERRIDE", entityId: record.id },
      });
      expect(overrideLog).toBeDefined();
      expect(overrideLog?.metadata?.includes("previousMethod\":\"MANUAL_TEACHER")).toBe(true);
    });

    it("safely serializes concurrent session closure and recognition confirmation", async () => {
      // Launch concurrent session close and confirmation
      const [closeRes, confirmRes] = await Promise.all([
        fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/close`, {
          method: "POST",
          headers: { Cookie: teacher1Cookie },
        }),
        fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            studentId: activeStudentId,
            confidence: 0.94,
            status: AttendanceStatus.PRESENT,
            teacherConfirmed: true,
          }),
        }),
      ]);

      expect(closeRes.status).toBe(200);
      // confirmRes must either succeed (if serialized before close) or return 400 SESSION_NOT_ACTIVE (if serialized after close)
      // but must NEVER crash with 500 or leave dirty state
      expect([200, 400]).toContain(confirmRes.status);
      if (confirmRes.status === 400) {
        const data = await confirmRes.json();
        expect(data.error.code).toBe("SESSION_NOT_ACTIVE");
      }
    });
  });

  describe("5. Attendance Review, Audited Corrections & Finalization (T-036)", () => {
    let reviewSessionId: string;
    let record1Id: string;

    beforeEach(async () => {
      const createRes = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({ timetableEntryId }),
      });
      const session = (await createRes.json()).data;
      reviewSessionId = session.id;

      // Seed an initial record via manual teacher marking
      const markRes = await fetch(`${baseUrl}/attendance-sessions/${reviewSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudentId,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });
      const markedData = await markRes.json();
      record1Id = markedData.data.records[0].id;
    });

    it("allows authorized teacher to review session attendance roster with persisted metrics and timestamps", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${reviewSessionId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);

      const { session, summary, roster } = data.data;
      expect(session.id).toBe(reviewSessionId);
      expect(session.status).toBe(SessionStatus.ACTIVE);

      // Verify persisted summary counts
      expect(summary.totalStudents).toBeGreaterThan(0);
      expect(summary.recordedCount).toBe(1);
      expect(summary.presentCount).toBe(1);
      expect(summary.absentCount).toBe(0);

      // Verify roster details
      const studentEntry = roster.find((r: any) => r.studentId === activeStudentId);
      expect(studentEntry).toBeDefined();
      expect(studentEntry.rollNumber).toBe("SESS-001");
      expect(studentEntry.name).toBe("Session Active Student");
      expect(studentEntry.attendance).toBeDefined();
      expect(studentEntry.attendance.id).toBe(record1Id);
      expect(studentEntry.attendance.status).toBe(AttendanceStatus.PRESENT);
      expect(studentEntry.attendance.method).toBe(AttendanceMethod.MANUAL_TEACHER);
      expect(studentEntry.attendance.markedAt).toBeDefined();
    });

    it("rejects unauthorized users from reviewing session roster (403 FORBIDDEN)", async () => {
      // Unassigned teacher
      const unassignedRes = await fetch(`${baseUrl}/attendance-sessions/${reviewSessionId}`, {
        headers: { Cookie: teacher2Cookie },
      });
      expect(unassignedRes.status).toBe(403);

      // Student
      const studentRes = await fetch(`${baseUrl}/attendance-sessions/${reviewSessionId}`, {
        headers: { Cookie: studentCookie },
      });
      expect(studentRes.status).toBe(403);
    });

    it("allows authorized teacher to submit controlled attendance correction with mandatory reason", async () => {
      const res = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.LATE,
          correctionReason: "Student showed verified bus delay pass from transit authority",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe(AttendanceStatus.LATE);
      expect(data.data.correctionReason).toBe("Student showed verified bus delay pass from transit authority");

      // Verify audit trail entry
      const auditLog = await prisma.auditLog.findFirst({
        where: { action: "ATTENDANCE_CORRECTED", entityId: record1Id },
      });
      expect(auditLog).toBeDefined();
      expect(auditLog?.actorUserId).toBe(teacher1UserId);
      expect(auditLog?.metadata?.includes("bus delay pass")).toBe(true);
      expect(auditLog?.metadata?.includes("previousStatus\":\"PRESENT")).toBe(true);
      expect(auditLog?.metadata?.includes("newStatus\":\"LATE")).toBe(true);
    });

    it("supports attendance correction via nested route /attendance-sessions/records/:id as well", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.EXCUSED,
          correctionReason: "Medical clinic sick leave note provided and approved by faculty",
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.status).toBe(AttendanceStatus.EXCUSED);
    });

    it("rejects corrections without a mandatory correction reason (400)", async () => {
      const res = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.ABSENT,
          correctionReason: "    ", // empty / whitespace only
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(JSON.stringify(data.error).toLowerCase()).toContain("correction reason");
    });

    it("rejects unauthorized users from correcting attendance records (403 FORBIDDEN)", async () => {
      // Unassigned teacher
      const unassignedRes = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher2Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.ABSENT,
          correctionReason: "Unauthorized teacher change attempt",
        }),
      });
      expect(unassignedRes.status).toBe(403);

      // Student
      const studentRes = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({
          status: AttendanceStatus.PRESENT,
          correctionReason: "Self status update attempt",
        }),
      });
      expect(studentRes.status).toBe(403);
    });

    it("allows assigned teacher to correct records on a COMPLETED (finalized) session with audit reason", async () => {
      // Close session
      await fetch(`${baseUrl}/attendance-sessions/${reviewSessionId}/close`, {
        method: "POST",
        headers: { Cookie: teacher1Cookie },
      });

      // Verify initial marking is blocked on completed session
      const blockedMark = await fetch(`${baseUrl}/attendance-sessions/${reviewSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudent2Id,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });
      expect(blockedMark.status).toBe(400);

      // Controlled manual correction on existing record is allowed with mandatory reason
      const correctRes = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.PRESENT,
          correctionReason: "Post-lecture correction: student was present in back row and confirmed by attendance sheet",
        }),
      });
      expect(correctRes.status).toBe(200);
      const data = await correctRes.json();
      expect(data.data.status).toBe(AttendanceStatus.PRESENT);
    });

    it("rejects corrections if the attendance session was CANCELLED (400 SESSION_CANCELLED)", async () => {
      // Mark session CANCELLED in DB
      await prisma.attendanceSession.update({
        where: { id: reviewSessionId },
        data: { status: SessionStatus.CANCELLED },
      });

      const res = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.PRESENT,
          correctionReason: "Attempting correction on cancelled session",
        }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("SESSION_CANCELLED");
    });

    it("successive corrections preserve the full audit history without overwriting earlier audit events", async () => {
      // 1. First correction: PRESENT -> LATE
      const firstRes = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.LATE,
          correctionReason: "Verified arrival at 09:15 AM due to campus bus delay",
        }),
      });
      expect(firstRes.status).toBe(200);

      // 2. Second correction: LATE -> EXCUSED
      const secondRes = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.EXCUSED,
          correctionReason: "Head of Department approved medical certificate for morning session",
        }),
      });
      expect(secondRes.status).toBe(200);

      // 3. Query audit log entries for this record in chronological order
      const auditEntries = await prisma.auditLog.findMany({
        where: {
          entityId: record1Id,
          action: "ATTENDANCE_CORRECTED",
        },
        orderBy: { createdAt: "asc" },
      });

      expect(auditEntries.length).toBe(2);

      const firstMeta = JSON.parse(auditEntries[0].metadata!);
      expect(firstMeta.previousStatus).toBe(AttendanceStatus.PRESENT);
      expect(firstMeta.newStatus).toBe(AttendanceStatus.LATE);
      expect(firstMeta.correctionReason).toContain("campus bus delay");

      const secondMeta = JSON.parse(auditEntries[1].metadata!);
      expect(secondMeta.previousStatus).toBe(AttendanceStatus.LATE);
      expect(secondMeta.newStatus).toBe(AttendanceStatus.EXCUSED);
      expect(secondMeta.correctionReason).toContain("Head of Department approved");
    });

    it("duplicate correction requests are idempotent and do not create duplicate audit events", async () => {
      const correctionPayload = {
        status: AttendanceStatus.EXCUSED,
        correctionReason: "Clinic sick note validated by nurse",
      };

      // Initial correction
      const res1 = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify(correctionPayload),
      });
      expect(res1.status).toBe(200);

      const auditCountBefore = await prisma.auditLog.count({
        where: { entityId: record1Id, action: "ATTENDANCE_CORRECTED" },
      });
      expect(auditCountBefore).toBe(1);

      // Duplicate submission with identical status and reason
      const res2 = await fetch(`${baseUrl}/attendance-records/${record1Id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify(correctionPayload),
      });
      expect(res2.status).toBe(200);

      const auditCountAfter = await prisma.auditLog.count({
        where: { entityId: record1Id, action: "ATTENDANCE_CORRECTED" },
      });
      expect(auditCountAfter).toBe(auditCountBefore); // No redundant duplicate audit log created
    });

    it("concurrent corrections maintain consistent database counts and roster metrics", async () => {
      // Mark second student as ABSENT
      const mark2Res = await fetch(`${baseUrl}/attendance-sessions/${reviewSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: activeStudent2Id,
          status: AttendanceStatus.ABSENT,
          method: AttendanceMethod.MANUAL_TEACHER,
        }),
      });
      const marked2Data = await mark2Res.json();
      const record2Id = marked2Data.data.records[0].id;

      // Concurrently correct student 1 (PRESENT -> LATE) and student 2 (ABSENT -> PRESENT)
      const [corr1Res, corr2Res] = await Promise.all([
        fetch(`${baseUrl}/attendance-records/${record1Id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            status: AttendanceStatus.LATE,
            correctionReason: "Arrived late during lecture roll call",
          }),
        }),
        fetch(`${baseUrl}/attendance-records/${record2Id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            status: AttendanceStatus.PRESENT,
            correctionReason: "Entered class after attendance marker",
          }),
        }),
      ]);

      expect(corr1Res.status).toBe(200);
      expect(corr2Res.status).toBe(200);

      // Verify persisted session summary
      const sessionRes = await fetch(`${baseUrl}/attendance-sessions/${reviewSessionId}`, {
        headers: { Cookie: teacher1Cookie },
      });
      expect(sessionRes.status).toBe(200);
      const sessionData = await sessionRes.json();
      const { summary } = sessionData.data;

      expect(summary.recordedCount).toBe(2);
      expect(summary.lateCount).toBe(1);
      expect(summary.presentCount).toBe(1);
      expect(summary.absentCount).toBe(0);
      expect(summary.excusedCount).toBe(0);
    });
  });
});
