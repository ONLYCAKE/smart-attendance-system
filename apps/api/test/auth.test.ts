import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { PrismaClient, UserStatus, StudentStatus } from "@prisma/client";
import { createApp } from "../src/app.js";

describe("T-010: Authentication and Authorization Module", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  // Stored state between sequential workflow steps
  let adminCookie: string;
  let teacherCookie: string;
  let approvedStudentCookie: string;
  let pendingStudentId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const cleanup = async () => {
      const testEmails = ["rohan.varma@college.edu", "another.unique.email@college.edu"];
      await prisma.attendanceRecord.deleteMany({ where: { student: { email: { in: testEmails } } } });
      await prisma.faceEnrollment.deleteMany({ where: { student: { email: { in: testEmails } } } });
      await prisma.student.deleteMany({ where: { email: { in: testEmails } } });
      await prisma.user.deleteMany({ where: { email: { in: testEmails } } });
    };

    await cleanup();

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;
  });

  afterAll(async () => {
    const testEmails = ["rohan.varma@college.edu", "another.unique.email@college.edu"];
    await prisma.attendanceRecord.deleteMany({ where: { student: { email: { in: testEmails } } } });
    await prisma.faceEnrollment.deleteMany({ where: { student: { email: { in: testEmails } } } });
    await prisma.student.deleteMany({ where: { email: { in: testEmails } } });
    await prisma.user.deleteMany({ where: { email: { in: testEmails } } });

    await prisma.$disconnect();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // Helper to extract session_token cookie header
  const extractCookie = (res: globalThis.Response): string => {
    const rawCookie = res.headers.get("set-cookie") || "";
    const match = rawCookie.match(/session_token=[^;]+/);
    return match ? match[0] : "";
  };

  describe("1. Login Workflow", () => {
    it("should login successfully with valid credentials and set secure HTTP-only cookie", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@college.edu",
          password: "Password@123",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe("admin@college.edu");
      expect(body.data.user.role).toBe("ADMIN");
      expect(body.data.user).not.toHaveProperty("passwordHash");

      // Verify cookie
      adminCookie = extractCookie(res);
      expect(adminCookie).toContain("session_token=");
      const setCookieHeader = res.headers.get("set-cookie");
      expect(setCookieHeader).toContain("HttpOnly");
      expect(setCookieHeader).toContain("SameSite=Lax");
    });

    it("should login teacher and student users successfully", async () => {
      const teacherRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "prof.sharma@college.edu",
          password: "Password@123",
        }),
      });
      expect(teacherRes.status).toBe(200);
      teacherCookie = extractCookie(teacherRes);

      const studentRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "student.aarav@college.edu",
          password: "Password@123",
        }),
      });
      expect(studentRes.status).toBe(200);
      approvedStudentCookie = extractCookie(studentRes);
    });

    it("should reject incorrect password with generic 401 message (no account enumeration)", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@college.edu",
          password: "WrongPassword999!",
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
      expect(body.error.message).toBe("Invalid email or password");
    });

    it("should reject unknown account with identical generic 401 message", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "nonexistent.user.12345@college.edu",
          password: "Password@123",
        }),
      });

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_CREDENTIALS");
      expect(body.error.message).toBe("Invalid email or password");
    });

    it("should reject missing or invalid credentials with 400 validation error", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "not-an-email",
          password: "short",
        }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.details.length).toBeGreaterThan(0);
    });
  });

  describe("2. Protected Profile (GET /auth/me) & Logout", () => {
    it("should return profile for authenticated user via cookie", async () => {
      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: adminCookie },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.email).toBe("admin@college.edu");
      expect(body.data.role).toBe("ADMIN");
      expect(body.data).not.toHaveProperty("passwordHash");
    });

    it("should reject unauthenticated request with 401 UNAUTHORIZED", async () => {
      const res = await fetch(`${baseUrl}/auth/me`);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should reject invalid/tampered token with 401 UNAUTHORIZED", async () => {
      const res = await fetch(`${baseUrl}/auth/me`, {
        headers: { Cookie: "session_token=malicious_fake_token_value_abc" },
      });
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("should logout successfully and clear session cookie", async () => {
      const res = await fetch(`${baseUrl}/auth/logout`, {
        method: "POST",
        headers: { Cookie: adminCookie },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      const setCookie = res.headers.get("set-cookie") || "";
      expect(setCookie).toContain("session_token=;");
    });
  });

  describe("3. Student Self-Registration Workflow (POST /auth/register)", () => {
    let deptId: string;
    let yearId: string;
    let classId: string;

    beforeAll(async () => {
      const dept = await prisma.department.findFirst({ where: { code: "CSE" } });
      const year = await prisma.academicYear.findFirst({ where: { label: "2025-2026" } });
      const cohort = await prisma.class.findFirst({ where: { label: "CSE-Sem4-A" } });
      deptId = dept!.id;
      yearId = year!.id;
      classId = cohort!.id;
    });

    it("should register a new student in PENDING status", async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rohan Varma",
          email: "rohan.varma@college.edu",
          password: "SecureStudentPass!123",
          rollNumber: "CS099",
          departmentId: deptId,
          academicYearId: yearId,
          classId: classId,
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe(StudentStatus.PENDING);
      expect(body.data.rollNumber).toBeUndefined(); // Minimizes leakage
      pendingStudentId = body.data.studentId;

      // Verify database state: User is PENDING with STUDENT role
      const dbUser = await prisma.user.findUnique({
        where: { email: "rohan.varma@college.edu" },
      });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.status).toBe(UserStatus.PENDING);
      expect(dbUser?.role).toBe("STUDENT"); // Escalation impossible
    });

    it("should prevent pending student from logging in", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "rohan.varma@college.edu",
          password: "SecureStudentPass!123",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("ACCOUNT_PENDING");
    });

    it("should reject duplicate registration with identical email (409 Conflict)", async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Rohan Varma Impostor",
          email: "rohan.varma@college.edu",
          password: "SecureStudentPass!123",
          rollNumber: "CS100",
          departmentId: deptId,
          academicYearId: yearId,
          classId: classId,
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("EMAIL_EXISTS");
    });

    it("should reject duplicate registration with identical rollNumber in same class (409 Conflict)", async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Another Student",
          email: "another.unique.email@college.edu",
          password: "SecureStudentPass!123",
          rollNumber: "CS099", // already used by Rohan in this class
          departmentId: deptId,
          academicYearId: yearId,
          classId: classId,
        }),
      });

      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("ROLL_NUMBER_EXISTS");
    });
  });

  describe("4. Administrator Approval Workflow (POST /students/:id/approve)", () => {
    it("should forbid unauthenticated approval request (401)", async () => {
      const res = await fetch(`${baseUrl}/students/${pendingStudentId}/approve`, {
        method: "POST",
      });
      expect(res.status).toBe(401);
    });

    it("should forbid Teacher from approving students (403 FORBIDDEN)", async () => {
      const res = await fetch(`${baseUrl}/students/${pendingStudentId}/approve`, {
        method: "POST",
        headers: { Cookie: teacherCookie },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("should forbid Student from approving students (403 FORBIDDEN)", async () => {
      const res = await fetch(`${baseUrl}/students/${pendingStudentId}/approve`, {
        method: "POST",
        headers: { Cookie: approvedStudentCookie },
      });
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("should allow Administrator to approve pending student successfully", async () => {
      // Re-login admin to get fresh session cookie
      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@college.edu",
          password: "Password@123",
        }),
      });
      const validAdminCookie = extractCookie(loginRes);

      const res = await fetch(`${baseUrl}/students/${pendingStudentId}/approve`, {
        method: "POST",
        headers: { Cookie: validAdminCookie },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.student.status).toBe(StudentStatus.ACTIVE);

      // Verify User record was also activated
      const updatedUser = await prisma.user.findUnique({
        where: { email: "rohan.varma@college.edu" },
      });
      expect(updatedUser?.status).toBe(UserStatus.ACTIVE);

      // Verify AuditLog entry was recorded
      const audit = await prisma.auditLog.findFirst({
        where: {
          action: "STUDENT_APPROVED",
          entityId: pendingStudentId,
        },
      });
      expect(audit).not.toBeNull();
    });

    it("should now allow newly approved student to sign in", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "rohan.varma@college.edu",
          password: "SecureStudentPass!123",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe("rohan.varma@college.edu");
    });
  });

  describe("5. Resource-Level Access Boundaries", () => {
    it("should forbid student from accessing another student's profile (403)", async () => {
      // Rohan attempts to access Aarav's profile
      const aaravStudent = await prisma.student.findFirst({
        where: { rollNumber: "CS001" },
      });

      const rohanLogin = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "rohan.varma@college.edu",
          password: "SecureStudentPass!123",
        }),
      });
      const rohanCookie = extractCookie(rohanLogin);

      const res = await fetch(`${baseUrl}/students/${aaravStudent!.id}`, {
        headers: { Cookie: rohanCookie },
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("should allow student to access their own profile (200)", async () => {
      const rohanLogin = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "rohan.varma@college.edu",
          password: "SecureStudentPass!123",
        }),
      });
      const rohanCookie = extractCookie(rohanLogin);

      const res = await fetch(`${baseUrl}/students/${pendingStudentId}`, {
        headers: { Cookie: rohanCookie },
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.name).toBe("Rohan Varma");
      expect(body.data.rollNumber).toBe("CS099");
    });
  });
});
