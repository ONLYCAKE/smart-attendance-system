import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, Server } from "http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

describe("T-020: Department Management Module", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;

  let createdDeptId: string;
  let seededDeptId: string;

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

    // Clean up any previous test departments
    await prisma.department.deleteMany({
      where: { code: { in: ["TEST_MECH", "TEST_CIVIL", "TEMP_DEPT"] } },
    });

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

    // Get seeded CSE department ID
    const cseDept = await prisma.department.findUnique({ where: { code: "CSE" } });
    seededDeptId = cseDept!.id;
  });

  beforeEach(async () => {
    adminCookie = await getCookie("admin@college.edu");
    teacherCookie = await getCookie("prof.sharma@college.edu");
    studentCookie = await getCookie("student.aarav@college.edu");
  });

  const getFreshAdminCookie = async () => {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@college.edu", password: "Password@123" }),
    });
    return extractCookie(res);
  };

  afterAll(async () => {
    // Clean up test departments
    await prisma.department.deleteMany({
      where: { code: { in: ["TEST_MECH", "TEST_CIVIL", "TEMP_DEPT", "TEST_MECH_MOD"] } },
    });
    await prisma.$disconnect();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe("1. Department Creation & Authorization", () => {
    it("should reject unauthenticated request with 401 UNAUTHORIZED", async () => {
      const res = await fetch(`${baseUrl}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Mechanical Engineering", code: "TEST_MECH" }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject Teacher attempt to create department with 403 FORBIDDEN", async () => {
      const res = await fetch(`${baseUrl}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacherCookie },
        body: JSON.stringify({ name: "Mechanical Engineering", code: "TEST_MECH" }),
      });
      expect(res.status).toBe(403);
    });

    it("should reject Student attempt to create department with 403 FORBIDDEN", async () => {
      const res = await fetch(`${baseUrl}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ name: "Mechanical Engineering", code: "TEST_MECH" }),
      });
      expect(res.status).toBe(403);
    });

    it("should reject creation with invalid validation payload (400)", async () => {
      const res = await fetch(`${baseUrl}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ name: "A", code: "" }),
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should allow Admin to create a new Department successfully (201)", async () => {
      const res = await fetch(`${baseUrl}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ name: "Mechanical Engineering", code: "TEST_MECH" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.data.code).toBe("TEST_MECH");
      expect(body.data.name).toBe("Mechanical Engineering");
      expect(body.data.active).toBe(true);
      createdDeptId = body.data.id;

      // Verify audit log
      const audit = await prisma.auditLog.findFirst({
        where: { action: "DEPARTMENT_CREATED", entityId: createdDeptId },
      });
      expect(audit).not.toBeNull();
    });

    it("should reject duplicate department code with 409 DUPLICATE_CODE", async () => {
      const res = await fetch(`${baseUrl}/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ name: "Mechanical Sciences", code: "TEST_MECH" }),
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("DUPLICATE_CODE");
    });
  });

  describe("2. Department Listing & Filtering", () => {
    it("should list departments with pagination and count metadata", async () => {
      const res = await fetch(`${baseUrl}/departments?limit=10&page=1`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.meta.total).toBeGreaterThanOrEqual(2);
      expect(body.meta.page).toBe(1);
    });

    it("should filter departments by search query (name or code)", async () => {
      const res = await fetch(`${baseUrl}/departments?search=MECH`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.length).toBe(1);
      expect(body.data[0].code).toBe("TEST_MECH");
    });

    it("should allow Student to view department listings for registration and cohort context", async () => {
      const res = await fetch(`${baseUrl}/departments`, {
        headers: { Cookie: studentCookie },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it("should return department statistics for Admin (GET /departments/stats)", async () => {
      const res = await fetch(`${baseUrl}/departments/stats`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toHaveProperty("total");
      expect(body.data).toHaveProperty("active");
      expect(body.data).toHaveProperty("inactive");
    });

    it("should forbid Teacher from accessing department stats (403)", async () => {
      const res = await fetch(`${baseUrl}/departments/stats`, {
        headers: { Cookie: teacherCookie },
      });
      expect(res.status).toBe(403);
    });
  });

  describe("3. Department Detail & Update", () => {
    it("should fetch single department by ID with relationship counts", async () => {
      const freshAdmin = await getFreshAdminCookie();
      const res = await fetch(`${baseUrl}/departments/${createdDeptId}`, {
        headers: { Cookie: freshAdmin },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.id).toBe(createdDeptId);
      expect(body.data._count).toHaveProperty("classes");
      expect(body.data._count).toHaveProperty("subjects");
      expect(body.data._count).toHaveProperty("students");
    });

    it("should update department name and code successfully (PATCH)", async () => {
      const freshAdmin = await getFreshAdminCookie();
      const res = await fetch(`${baseUrl}/departments/${createdDeptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: freshAdmin },
        body: JSON.stringify({ name: "Mechanical & Automation Engineering" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.name).toBe("Mechanical & Automation Engineering");
    });

    it("should forbid non-admin from updating department (403)", async () => {
      const res = await fetch(`${baseUrl}/departments/${createdDeptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: teacherCookie },
        body: JSON.stringify({ name: "Malicious Change" }),
      });
      expect(res.status).toBe(403);
    });

    it("should reject updating code to an already existing department code (409)", async () => {
      const freshAdmin = await getFreshAdminCookie();
      const res = await fetch(`${baseUrl}/departments/${createdDeptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: freshAdmin },
        body: JSON.stringify({ code: "CSE" }), // CSE already exists
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("DUPLICATE_CODE");
    });
  });

  describe("4. Safe Deletion & Dependency Protection", () => {
    it("should prevent deletion of a department that has active dependencies (409 DEPENDENT_RECORDS_EXIST)", async () => {
      const freshAdmin = await getFreshAdminCookie();
      // Seeded CSE department has classes, students, and subjects
      const res = await fetch(`${baseUrl}/departments/${seededDeptId}`, {
        method: "DELETE",
        headers: { Cookie: freshAdmin },
      });
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error.code).toBe("DEPENDENT_RECORDS_EXIST");
      expect(body.error.message).toContain("dependencies");
    });

    it("should allow soft-deactivation of a department via PATCH (active: false)", async () => {
      const freshAdmin = await getFreshAdminCookie();
      const res = await fetch(`${baseUrl}/departments/${createdDeptId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: freshAdmin },
        body: JSON.stringify({ active: false }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.active).toBe(false);
    });

    it("should permanently delete a department when it has zero dependencies (200)", async () => {
      const freshAdmin = await getFreshAdminCookie();
      const res = await fetch(`${baseUrl}/departments/${createdDeptId}`, {
        method: "DELETE",
        headers: { Cookie: freshAdmin },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify record is gone
      const dbDept = await prisma.department.findUnique({ where: { id: createdDeptId } });
      expect(dbDept).toBeNull();
    });
  });
});
