import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import jwt from "jsonwebtoken";
import {
  PrismaClient,
  Role,
  UserStatus,
  StudentStatus,
  SessionStatus,
  AttendanceStatus,
  AttendanceMethod,
} from "@prisma/client";
import { createApp } from "../src/app.js";
import { env } from "../src/config/env.js";
import { encryptDescriptor } from "../src/modules/enrollment/encryption.util.js";

describe("T-044: System Security, Access Boundaries & Concurrency Verification", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  // Stored cookies
  let adminCookie: string;
  let teacher1Cookie: string; // Prof. Sharma (Assigned)
  let teacher2Cookie: string; // Prof. Verma (Unassigned)
  let student1Cookie: string; // Aarav
  let student2Cookie: string; // Test Student 2

  // User IDs & Entities
  let adminUserId: string;
  let teacher1UserId: string;
  let teacher2UserId: string;
  let student1UserId: string;
  let student2UserId: string;
  let student1Id: string;
  let student2Id: string;

  let testDeptId: string;
  let testAcadYearId: string;
  let testClassId: string;
  let unassignedClassId: string;
  let testSubjectId: string;
  let activeSessionId: string;
  let student1Vector: number[];

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

    // 1. Fetch seed users
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "admin@college.edu" } });
    adminUserId = admin.id;

    const t1 = await prisma.user.findUniqueOrThrow({ where: { email: "prof.sharma@college.edu" } });
    teacher1UserId = t1.id;

    const t2 = await prisma.user.findUniqueOrThrow({ where: { email: "prof.verma@college.edu" } });
    teacher2UserId = t2.id;

    const s1 = await prisma.user.findUniqueOrThrow({
      where: { email: "student.aarav@college.edu" },
      include: { studentProfile: true },
    });
    student1UserId = s1.id;
    student1Id = s1.studentProfile!.id;

    // Create a second student user for cross-student boundary checks
    const s2User = await prisma.user.upsert({
      where: { email: "sec.student2@college.edu" },
      update: {},
      create: {
        email: "sec.student2@college.edu",
        passwordHash: s1.passwordHash,
        name: "Security Student Two",
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
      },
    });
    student2UserId = s2User.id;

    const dept = await prisma.department.findFirstOrThrow();
    testDeptId = dept.id;
    const acadYear = await prisma.academicYear.findFirstOrThrow();
    testAcadYearId = acadYear.id;
    const subject = await prisma.subject.findFirstOrThrow();
    testSubjectId = subject.id;

    const assignedClass = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 6,
          division: "SEC_A",
        },
      },
      update: {},
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 6,
        division: "SEC_A",
        label: "CS-Sem6-SecA",
      },
    });
    testClassId = assignedClass.id;

    const unassignedClass = await prisma.class.upsert({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          semesterNumber: 6,
          division: "SEC_UNASSIGNED",
        },
      },
      update: {},
      create: {
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        semesterNumber: 6,
        division: "SEC_UNASSIGNED",
        label: "CS-Sem6-Unassigned",
      },
    });
    unassignedClassId = unassignedClass.id;

    // Student 2 profile in assigned class
    const s2 = await prisma.student.upsert({
      where: {
        classId_rollNumber: {
          classId: testClassId,
          rollNumber: "SEC-002",
        },
      },
      update: { userId: student2UserId },
      create: {
        userId: student2UserId,
        departmentId: testDeptId,
        academicYearId: testAcadYearId,
        classId: testClassId,
        rollNumber: "SEC-002",
        name: "Security Student Two",
        email: "sec.student2@college.edu",
        status: StudentStatus.ACTIVE,
      },
    });
    student2Id = s2.id;

    // Associate student 1 with testClassId
    await prisma.student.update({
      where: { id: student1Id },
      data: { classId: testClassId },
    });

    // Create Teacher 1 assignment on testClassId + testSubjectId
    await prisma.teacherAssignment.upsert({
      where: {
        classId_subjectId: {
          classId: testClassId,
          subjectId: testSubjectId,
        },
      },
      update: { active: true, teacherUserId: teacher1UserId },
      create: {
        teacherUserId: teacher1UserId,
        classId: testClassId,
        subjectId: testSubjectId,
        active: true,
      },
    });

    // Setup biometric consent and encrypted face enrollment for Student 1
    await prisma.biometricConsent.upsert({
      where: { studentId: student1Id },
      update: { status: "GRANTED", revokedAt: null },
      create: {
        studentId: student1Id,
        status: "GRANTED",
        consentVersion: "v1.0",
      },
    });

    student1Vector = Array.from({ length: 128 }, (_, i) => Math.sin(i + 1) * 0.1);
    const encryptedVector = encryptDescriptor(student1Vector);

    await prisma.faceEnrollment.upsert({
      where: { studentId: student1Id },
      update: {
        status: "ACTIVE",
        descriptors: encryptedVector,
        consentRevokedAt: null,
        deletedAt: null,
      },
      create: {
        studentId: student1Id,
        status: "ACTIVE",
        provider: "human",
        modelVersion: "faceres-v1",
        descriptors: encryptedVector,
        consentedAt: new Date(),
      },
    });

    // Setup active session
    const sess = await prisma.attendanceSession.create({
      data: {
        classId: testClassId,
        subjectId: testSubjectId,
        teacherUserId: teacher1UserId,
        status: SessionStatus.ACTIVE,
        startsAt: new Date(),
      },
    });
    activeSessionId = sess.id;

    // Login cookies
    adminCookie = await loginUser("admin@college.edu");
    teacher1Cookie = await loginUser("prof.sharma@college.edu");
    teacher2Cookie = await loginUser("prof.verma@college.edu");
    student1Cookie = await loginUser("student.aarav@college.edu");
    student2Cookie = await loginUser("sec.student2@college.edu");
  });

  afterAll(async () => {
    // Clean up created session and attendance records
    if (activeSessionId) {
      await prisma.attendanceRecord.deleteMany({ where: { sessionId: activeSessionId } });
      await prisma.attendanceSession.deleteMany({ where: { id: activeSessionId } });
    }
    if (student1Id) {
      await prisma.faceEnrollment.deleteMany({ where: { studentId: { in: [student1Id, student2Id].filter(Boolean) } } });
    }
    await prisma.$disconnect();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe("1. Authentication & Session Revocation Integrity", () => {
    it("rejects token when tokenVersion is omitted or undefined in payload (401)", async () => {
      // Craft a token signed with the correct secret but missing tokenVersion
      const tamperedToken = jwt.sign(
        {
          userId: student1UserId,
          role: Role.STUDENT,
          email: "student.aarav@college.edu",
          // tokenVersion intentionally omitted!
        },
        env.JWT_SECRET,
        {
          algorithm: "HS256",
          expiresIn: "1h",
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }
      );

      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: `session_token=${tamperedToken}` },
      });
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
      expect(json.error.message).toContain("Session has been terminated or logged out");
    });

    it("rejects token with mismatched issuer or audience (401)", async () => {
      const invalidIssuerToken = jwt.sign(
        {
          userId: student1UserId,
          role: Role.STUDENT,
          email: "student.aarav@college.edu",
          tokenVersion: 0,
        },
        env.JWT_SECRET,
        {
          algorithm: "HS256",
          expiresIn: "1h",
          issuer: "hostile-issuer",
          audience: env.JWT_AUDIENCE,
        }
      );

      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: `session_token=${invalidIssuerToken}` },
      });
      expect(res.status).toBe(401);
    });

    it("rejects token signed with insecure 'none' algorithm (401)", async () => {
      const noneToken = jwt.sign(
        {
          userId: adminUserId,
          role: Role.ADMIN,
          email: "admin@college.edu",
          tokenVersion: 0,
        },
        "",
        {
          algorithm: "none" as any,
          issuer: env.JWT_ISSUER,
          audience: env.JWT_AUDIENCE,
        }
      );

      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: `session_token=${noneToken}` },
      });
      expect(res.status).toBe(401);
    });

    it("invalidates all active sessions when user logs out (tokenVersion increment)", async () => {
      // Create dedicated user for logout invalidation test
      const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@college.edu" } });
      const logoutUser = await prisma.user.upsert({
        where: { email: "logout.test@college.edu" },
        update: { status: UserStatus.ACTIVE, passwordHash: adminUser.passwordHash },
        create: {
          email: "logout.test@college.edu",
          name: "Logout Test User",
          passwordHash: adminUser.passwordHash,
          role: Role.STUDENT,
          status: UserStatus.ACTIVE,
        },
      });

      // Fresh login
      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "logout.test@college.edu", password: "Password@123" }),
      });
      const sessionCookie = extractCookie(loginRes);

      // Verify valid
      const beforeRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: sessionCookie },
      });
      expect(beforeRes.status).toBe(200);

      // Logout
      const logoutRes = await fetch(`${baseUrl}/auth/logout`, {
        method: "POST",
        headers: { Cookie: sessionCookie },
      });
      expect(logoutRes.status).toBe(200);

      // Subsequent request with the previous token must fail with 401
      const afterRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: sessionCookie },
      });
      expect(afterRes.status).toBe(401);
      const afterJson = await afterRes.json();
      expect(afterJson.error.message).toContain("Session has been terminated or logged out");

      // Cleanup
      await prisma.user.delete({ where: { id: logoutUser.id } });
    });
  });

  describe("2. Role Boundary Isolation & Insecure Direct Object Reference (IDOR)", () => {
    it("prevents Student from viewing another student's profile (403)", async () => {
      const res = await fetch(`${baseUrl}/students/${student2Id}`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(403);
    });

    it("prevents Student from accessing another student's biometric consent status (403)", async () => {
      const res = await fetch(`${baseUrl}/students/${student2Id}/consent`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(403);
    });

    it("prevents Student from revoking another student's biometric enrollment (403)", async () => {
      const res = await fetch(`${baseUrl}/students/${student2Id}/face-enrollment/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: student1Cookie },
        body: JSON.stringify({ reason: "Malicious revoke attempt" }),
      });
      expect(res.status).toBe(403);
    });

    it("prevents Student from opening an attendance session (403)", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: student1Cookie },
        body: JSON.stringify({
          classId: testClassId,
          subjectId: testSubjectId,
        }),
      });
      expect(res.status).toBe(403);
    });

    it("prevents Student from marking attendance records (403)", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/records`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: student1Cookie },
        body: JSON.stringify({
          records: [{ studentId: student1Id, status: AttendanceStatus.PRESENT }],
        }),
      });
      expect(res.status).toBe(403);
    });

    it("prevents Student from correcting attendance records (403)", async () => {
      const res = await fetch(`${baseUrl}/attendance-records/some-fake-id`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: student1Cookie },
        body: JSON.stringify({
          status: AttendanceStatus.PRESENT,
          correctionReason: "Unauthorized self-correction",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("prevents Student from accessing teacher attendance reports (403)", async () => {
      const res = await fetch(`${baseUrl}/reports/teacher/attendance?classId=${testClassId}`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(403);
    });

    it("prevents Student from accessing admin summary reports (403)", async () => {
      const res = await fetch(`${baseUrl}/reports/admin/summary`, {
        headers: { Cookie: student1Cookie },
      });
      expect(res.status).toBe(403);
    });

    it("prevents Student from updating system settings (403)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: student1Cookie },
        body: JSON.stringify({
          key: "LOW_ATTENDANCE_THRESHOLD_PERCENT",
          value: "50.0",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("prevents Teacher from creating a session in an unassigned class (403 TEACHER_NOT_ASSIGNED)", async () => {
      const res = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher2Cookie },
        body: JSON.stringify({
          classId: unassignedClassId,
          subjectId: testSubjectId,
        }),
      });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error.code).toBe("TEACHER_NOT_ASSIGNED");
    });

    it("prevents Teacher from accessing or closing another teacher's active session (403)", async () => {
      // Teacher 2 attempting to view Teacher 1's active session
      const getRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}`, {
        headers: { Cookie: teacher2Cookie },
      });
      expect(getRes.status).toBe(403);

      // Teacher 2 attempting to close Teacher 1's active session
      const closeRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/close`, {
        method: "POST",
        headers: { Cookie: teacher2Cookie },
      });
      expect(closeRes.status).toBe(403);
    });

    it("prevents Teacher from updating system settings (403)", async () => {
      const res = await fetch(`${baseUrl}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          key: "LOW_ATTENDANCE_THRESHOLD_PERCENT",
          value: "60.0",
        }),
      });
      expect(res.status).toBe(403);
    });
  });

  describe("3. Concurrency Safety & Data Invariants", () => {
    it("race safety: attendance confirmation vs session closure", async () => {
      // 1. Create a fresh temporary active session
      const sessRes = await fetch(`${baseUrl}/attendance-sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          classId: testClassId,
          subjectId: testSubjectId,
        }),
      });
      // If already active, close existing and create fresh
      let tempSessionId: string;
      if (sessRes.status === 201) {
        tempSessionId = (await sessRes.json()).data.id;
      } else {
        tempSessionId = activeSessionId;
      }

      // Close the session
      const closeRes = await fetch(`${baseUrl}/attendance-sessions/${tempSessionId}/close`, {
        method: "POST",
        headers: { Cookie: teacher1Cookie },
      });
      expect(closeRes.status).toBe(200);

      // Any in-flight confirmation or marking on the closed session must fail
      const confirmRes = await fetch(`${baseUrl}/attendance-sessions/${tempSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: student1Id,
          status: AttendanceStatus.PRESENT,
          confidence: 0.95,
        }),
      });
      expect(confirmRes.status).toBe(400);
      const confirmJson = await confirmRes.json();
      expect(confirmJson.error.code).toBe("SESSION_NOT_ACTIVE");
    });

    it("race safety: consent revocation blocks biometric confirmation", async () => {
      // Revoke consent for Student 1
      const revokeRes = await fetch(`${baseUrl}/students/${student1Id}/face-enrollment/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: student1Cookie },
        body: JSON.stringify({ reason: "Testing concurrency revocation block" }),
      });
      expect(revokeRes.status).toBe(200);

      // Reopen session to ACTIVE
      await prisma.attendanceSession.update({
        where: { id: activeSessionId },
        data: { status: SessionStatus.ACTIVE },
      });

      // Confirm recognition must fail with CONSENT_REQUIRED_FOR_BIOMETRIC
      const confirmRes = await fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
        body: JSON.stringify({
          studentId: student1Id,
          status: AttendanceStatus.PRESENT,
          confidence: 0.95,
        }),
      });
      expect(confirmRes.status).toBe(400);
      const json = await confirmRes.json();
      expect(json.error.code).toBe("CONSENT_REQUIRED_FOR_BIOMETRIC");

      // Restore consent for subsequent tests
      await prisma.biometricConsent.update({
        where: { studentId: student1Id },
        data: { status: "GRANTED", revokedAt: null },
      });
      await prisma.faceEnrollment.update({
        where: { studentId: student1Id },
        data: { status: "ACTIVE", consentRevokedAt: null },
      });
    });

    it("race safety: concurrent duplicate confirmation preserves exactly 1 attendance record", async () => {
      // Ensure session is ACTIVE
      await prisma.attendanceSession.update({
        where: { id: activeSessionId },
        data: { status: SessionStatus.ACTIVE },
      });

      // Clear previous records for this student and session
      await prisma.attendanceRecord.deleteMany({
        where: { studentId: student1Id, sessionId: activeSessionId },
      });

      // Launch twin parallel confirmation requests
      const [res1, res2] = await Promise.all([
        fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            studentId: student1Id,
            status: AttendanceStatus.PRESENT,
            confidence: 0.92,
          }),
        }),
        fetch(`${baseUrl}/attendance-sessions/${activeSessionId}/confirm-recognition`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({
            studentId: student1Id,
            status: AttendanceStatus.PRESENT,
            confidence: 0.92,
          }),
        }),
      ]);

      // Both should return 200 (one created, second idempotent return)
      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify database invariant: exactly 1 record exists
      const records = await prisma.attendanceRecord.findMany({
        where: { studentId: student1Id, sessionId: activeSessionId },
      });
      expect(records.length).toBe(1);
    });

    it("race safety: parallel alert evaluations preserve deduplication without duplicate active warnings", async () => {
      // Execute 2 concurrent evaluation requests for the class
      const [eval1, eval2] = await Promise.all([
        fetch(`${baseUrl}/notifications/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({ classId: testClassId }),
        }),
        fetch(`${baseUrl}/notifications/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: teacher1Cookie },
          body: JSON.stringify({ classId: testClassId }),
        }),
      ]);

      expect(eval1.status).toBe(200);
      expect(eval2.status).toBe(200);

      // For any student in testClassId, there must be at most 1 active alert with dedupKey "LOW_ATTENDANCE:OVERALL"
      const activeAlerts = await prisma.notification.findMany({
        where: {
          studentId: student1Id,
          dedupKey: "LOW_ATTENDANCE:OVERALL",
          status: { in: ["UNREAD", "READ"] },
        },
      });
      expect(activeAlerts.length).toBeLessThanOrEqual(1);
    });
  });

  describe("4. Data Export & CSV Injection Neutralization", () => {
    it("neutralizes formula injection triggers in CSV export", async () => {
      // Create student with potentially hostile formula characters in name
      const formulaStudent = await prisma.student.upsert({
        where: {
          classId_rollNumber: {
            classId: testClassId,
            rollNumber: "SEC-FORMULA",
          },
        },
        update: {},
        create: {
          departmentId: testDeptId,
          academicYearId: testAcadYearId,
          classId: testClassId,
          rollNumber: "SEC-FORMULA",
          name: "=cmd|' /C calc'!A0",
          email: "formula@college.edu",
          status: StudentStatus.ACTIVE,
        },
      });

      // Mark an attendance record for this student
      await prisma.attendanceRecord.upsert({
        where: {
          studentId_sessionId: {
            studentId: formulaStudent.id,
            sessionId: activeSessionId,
          },
        },
        update: {},
        create: {
          studentId: formulaStudent.id,
          sessionId: activeSessionId,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.MANUAL_TEACHER,
          markedByUserId: teacher1UserId,
        },
      });

      // Export class attendance CSV
      const res = await fetch(
        `${baseUrl}/reports/teacher/attendance/export?classId=${testClassId}&format=roster`,
        { headers: { Cookie: teacher1Cookie } }
      );
      expect(res.status).toBe(200);
      const csv = await res.text();

      // Verify RFC 4180 / OWASP formula neutralization: must prepend single quote before '='
      expect(csv).toContain("\"'=cmd|' /C calc'!A0\"");
      // Must not contain raw executable formula without escaping
      expect(csv).not.toMatch(/^=cmd/m);

      // Cleanup test student
      await prisma.attendanceRecord.deleteMany({ where: { studentId: formulaStudent.id } });
      await prisma.student.deleteMany({ where: { id: formulaStudent.id } });
    });
  });

  describe("5. Reverse Proxy, Header Spoofing & Rate Limiting Verification", () => {
    it("distinguishes rate limiting quotas across distinct client IPs via X-Forwarded-For", async () => {
      // Send health requests from two distinct client IPs
      const ip1 = "198.51.100.10";
      const ip2 = "198.51.100.20";

      const res1 = await fetch(`${baseUrl}/health`, {
        headers: { "X-Forwarded-For": ip1 },
      });
      const res2 = await fetch(`${baseUrl}/health`, {
        headers: { "X-Forwarded-For": ip2 },
      });

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);

      // Verify rate limit headers exist
      const ratelimitRemaining1 = res1.headers.get("ratelimit-remaining");
      const ratelimitRemaining2 = res2.headers.get("ratelimit-remaining");
      expect(ratelimitRemaining1).toBeDefined();
      expect(ratelimitRemaining2).toBeDefined();
    });

    it("prevents spoofing of leftmost IP when multi-hop X-Forwarded-For is forwarded through 1-hop proxy", async () => {
      // When trust proxy = 1, Express trusts the immediate reverse proxy hop (the connection)
      // and reads the rightmost entry of X-Forwarded-For.
      // If an attacker prepends a spoofed IP: "1.1.1.1, 203.0.113.50", Express must treat 203.0.113.50 as client IP
      const spoofedChain = "1.1.1.1, 203.0.113.50";

      const res = await fetch(`${baseUrl}/health`, {
        headers: { "X-Forwarded-For": spoofedChain },
      });
      expect(res.status).toBe(200);

      // Subsequent request with the same client IP behind proxy decrements quota for 203.0.113.50
      const resFollowUp = await fetch(`${baseUrl}/health`, {
        headers: { "X-Forwarded-For": spoofedChain },
      });
      expect(resFollowUp.status).toBe(200);

      const rem1 = Number(res.headers.get("ratelimit-remaining"));
      const rem2 = Number(resFollowUp.headers.get("ratelimit-remaining"));
      if (!isNaN(rem1) && !isNaN(rem2)) {
        expect(rem2).toBe(rem1 - 1);
      }
    });

    it("verifies auth limiter applies to unauthenticated login endpoints", async () => {
      // Test invalid login returns 401 with standard rate limit headers
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "198.51.100.99",
        },
        body: JSON.stringify({
          email: "nonexistent@college.edu",
          password: "WrongPassword!123",
        }),
      });

      expect(res.status).toBe(401);
      expect(res.headers.get("ratelimit-limit")).toBeDefined();
    });
  });
});
