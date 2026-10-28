import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, Server } from "http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

describe("T-021: Academic Years, Classes, and Subjects Management", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;

  let seededDeptId: string;
  let createdYearId: string;
  let createdClassId: string;
  let createdSubjectId: string;

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

    // Clean up any previous test records
    await prisma.class.deleteMany({
      where: { label: { in: ["TEST-Sem1-DivA", "TEST-Sem1-DivB", "TEST-UPDATED"] } },
    });
    await prisma.subject.deleteMany({
      where: { code: { in: ["TEST_SUB1", "TEST_SUB2"] } },
    });
    await prisma.academicYear.deleteMany({
      where: { label: { in: ["2030-2031", "2031-2032", "2099-2100"] } },
    });

    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}/api/v1`;

    const cseDept = await prisma.department.findUnique({ where: { code: "CSE" } });
    seededDeptId = cseDept!.id;
  });

  beforeEach(async () => {
    adminCookie = await getCookie("admin@college.edu");
    teacherCookie = await getCookie("prof.sharma@college.edu");
    studentCookie = await getCookie("student.aarav@college.edu");
  });

  afterAll(async () => {
    // Clean up
    if (createdClassId) {
      await prisma.class.deleteMany({ where: { id: createdClassId } });
    }
    if (createdSubjectId) {
      await prisma.subject.deleteMany({ where: { id: createdSubjectId } });
    }
    if (createdYearId) {
      await prisma.academicYear.deleteMany({ where: { id: createdYearId } });
    }
    await prisma.$disconnect();
    server.close();
  });

  // --- ACADEMIC YEARS ---
  describe("Academic Years CRUD & Rules", () => {
    it("denies unauthenticated or student access to create academic years", async () => {
      const res = await fetch(`${baseUrl}/academic-years`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({
          label: "2030-2031",
          startDate: "2030-08-01T00:00:00.000Z",
          endDate: "2031-06-30T00:00:00.000Z",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("validates date range (end date must be after start date)", async () => {
      const res = await fetch(`${baseUrl}/academic-years`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          label: "2030-2031",
          startDate: "2031-06-30T00:00:00.000Z",
          endDate: "2030-08-01T00:00:00.000Z",
        }),
      });
      expect(res.status).toBe(422);
      const json = await res.json();
      expect(json.error.code).toBe("INVALID_DATE_RANGE");
    });

    it("allows admin to create an academic year", async () => {
      const res = await fetch(`${baseUrl}/academic-years`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          label: "2030-2031",
          startDate: "2030-08-01T00:00:00.000Z",
          endDate: "2031-06-30T00:00:00.000Z",
        }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.label).toBe("2030-2031");
      createdYearId = json.data.id;
    });

    it("rejects duplicate academic year label", async () => {
      const res = await fetch(`${baseUrl}/academic-years`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          label: "2030-2031",
          startDate: "2030-08-01T00:00:00.000Z",
          endDate: "2031-06-30T00:00:00.000Z",
        }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe("DUPLICATE_LABEL");
    });

    it("lists academic years with pagination and search", async () => {
      const res = await fetch(`${baseUrl}/academic-years?search=2030`, {
        headers: { Cookie: teacherCookie },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      expect(json.data[0].label).toContain("2030");
    });

    it("updates academic year properties", async () => {
      const res = await fetch(`${baseUrl}/academic-years/${createdYearId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ label: "2031-2032" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.label).toBe("2031-2032");
    });
  });

  // --- CLASSES ---
  describe("Classes CRUD, Cohort Uniqueness & Relations", () => {
    it("creates a class linked to department and academic year", async () => {
      const res = await fetch(`${baseUrl}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          departmentId: seededDeptId,
          academicYearId: createdYearId,
          semesterNumber: 1,
          division: "A",
          label: "TEST-Sem1-DivA",
        }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.label).toBe("TEST-Sem1-DivA");
      expect(json.data.division).toBe("A");
      createdClassId = json.data.id;
    });

    it("strictly rejects duplicate cohort (same department, year, semester, division)", async () => {
      const res = await fetch(`${baseUrl}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          departmentId: seededDeptId,
          academicYearId: createdYearId,
          semesterNumber: 1,
          division: "a", // case normalization check
          label: "Duplicate-Attempt",
        }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe("DUPLICATE_COHORT");
    });

    it("allows another division for the same semester and year", async () => {
      const res = await fetch(`${baseUrl}/classes`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          departmentId: seededDeptId,
          academicYearId: createdYearId,
          semesterNumber: 1,
          division: "B",
          label: "TEST-Sem1-DivB",
        }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.division).toBe("B");
      // clean up DivB
      await prisma.class.delete({ where: { id: json.data.id } });
    });

    it("filters classes by department and semester", async () => {
      const res = await fetch(`${baseUrl}/classes?departmentId=${seededDeptId}&semesterNumber=1`, {
        headers: { Cookie: teacherCookie },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.some((c: any) => c.id === createdClassId)).toBe(true);
    });

    it("updates class label and properties", async () => {
      const res = await fetch(`${baseUrl}/classes/${createdClassId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({ label: "TEST-UPDATED" }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.label).toBe("TEST-UPDATED");
    });

    it("prevents deletion of academic year when classes depend on it", async () => {
      const res = await fetch(`${baseUrl}/academic-years/${createdYearId}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe("DEPENDENT_RECORDS_EXIST");
    });
  });

  // --- SUBJECTS ---
  describe("Subjects CRUD & Department Scope", () => {
    it("creates a subject linked to department", async () => {
      const res = await fetch(`${baseUrl}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          code: "TEST_SUB1",
          name: "Test Subject One",
          departmentId: seededDeptId,
        }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.code).toBe("TEST_SUB1");
      createdSubjectId = json.data.id;
    });

    it("enforces duplicate code prevention on subjects", async () => {
      const res = await fetch(`${baseUrl}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          code: "TEST_SUB1",
          name: "Duplicate Subject",
          departmentId: seededDeptId,
        }),
      });
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error.code).toBe("DUPLICATE_CODE");
    });

    it("lists subjects filterable by department", async () => {
      const res = await fetch(`${baseUrl}/subjects?departmentId=${seededDeptId}&search=TEST_SUB1`, {
        headers: { Cookie: studentCookie },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.length).toBe(1);
      expect(json.data[0].code).toBe("TEST_SUB1");
    });

    it("autogenerates subject code on basis of department prefix", async () => {
      // Create a test IT department
      const itDept = await prisma.department.upsert({
        where: { code: "IT" },
        update: {},
        create: { code: "IT", name: "Information Technology", active: true },
      });

      // Query next-code endpoint
      const nextRes = await fetch(`${baseUrl}/subjects/next-code?departmentId=${itDept.id}`, {
        headers: { Cookie: adminCookie },
      });
      expect(nextRes.status).toBe(200);
      const nextJson = await nextRes.json();
      expect(nextJson.success).toBe(true);
      expect(nextJson.data.nextCode).toMatch(/^IT\d{3}$/);

      // Create subject without explicit code -> automatically uses generated next code
      const createRes = await fetch(`${baseUrl}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          name: "Web Technologies",
          departmentId: itDept.id,
        }),
      });
      expect(createRes.status).toBe(201);
      const createdJson = await createRes.json();
      expect(createdJson.data.code).toBe(nextJson.data.nextCode);

      // Clean up created subject
      await prisma.subject.delete({ where: { id: createdJson.data.id } });
    });

    it("allows different departments to have identical subject codes", async () => {
      // Create a second department (e.g. ECE)
      const eceDept = await prisma.department.upsert({
        where: { code: "ECE_TEST" },
        update: {},
        create: { code: "ECE_TEST", name: "Electronics & Comm", active: true },
      });

      // Create subject in ECE with SAME code as createdSubject in seededDeptId ("TEST_SUB1")
      const res = await fetch(`${baseUrl}/subjects`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify({
          code: "TEST_SUB1",
          name: "ECE Test Subject One",
          departmentId: eceDept.id,
        }),
      });
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.data.code).toBe("TEST_SUB1");

      // Clean up
      await prisma.subject.delete({ where: { id: json.data.id } });
    });

    it("deletes a subject with no active dependencies", async () => {
      const res = await fetch(`${baseUrl}/subjects/${createdSubjectId}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      createdSubjectId = "";
    });
  });

  // --- CLEANUP DELETION CHECKS ---
  describe("Cascade & Clean Deletion", () => {
    it("deletes class when unreferenced", async () => {
      const res = await fetch(`${baseUrl}/classes/${createdClassId}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      createdClassId = "";
    });

    it("allows academic year deletion once dependent class is deleted", async () => {
      const res = await fetch(`${baseUrl}/academic-years/${createdYearId}`, {
        method: "DELETE",
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      createdYearId = "";
    });
  });
});
