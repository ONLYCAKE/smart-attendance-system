import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, Server } from "http";
import { PrismaClient, UserStatus, Role } from "@prisma/client";
import { createApp } from "../src/app.js";

describe("T-022A: Teacher Assignments Management", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;

  let teacher1Id: string;
  let teacher2Id: string;
  let studentUserId: string;
  let inactiveTeacherId: string;

  let cseDeptId: string;
  let eceDeptId: string;
  let academicYearId: string;

  let cseClassId: string;
  let eceClassId: string;

  let cseSubject1Id: string;
  let cseSubject2Id: string;
  let eceSubjectId: string;

  let createdAssignmentId: string;
  let seededAssignmentId: string;

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

    // Fetch seeded users and CSE dept
    const [t1, t2, stu, cseDept] = await Promise.all([
      prisma.user.findUnique({ where: { email: "prof.sharma@college.edu" } }),
      prisma.user.findUnique({ where: { email: "prof.verma@college.edu" } }),
      prisma.user.findUnique({ where: { email: "student.aarav@college.edu" } }),
      prisma.department.findUnique({ where: { code: "CSE" } }),
    ]);

    teacher1Id = t1!.id;
    teacher2Id = t2!.id;
    studentUserId = stu!.id;
    cseDeptId = cseDept!.id;

    // Upsert ECE department for mismatch testing
    const eceDept = await prisma.department.upsert({
      where: { code: "ECE_TEST" },
      update: {},
      create: {
        code: "ECE_TEST",
        name: "Electronics & Communication",
        active: true,
      },
    });
    eceDeptId = eceDept.id;

    // Create an inactive teacher for test
    const inactiveTeacher = await prisma.user.upsert({
      where: { email: "inactive.teacher@college.edu" },
      update: { status: UserStatus.INACTIVE, role: Role.TEACHER },
      create: {
        name: "Inactive Teacher",
        email: "inactive.teacher@college.edu",
        passwordHash: "hash",
        role: Role.TEACHER,
        status: UserStatus.INACTIVE,
      },
    });
    inactiveTeacherId = inactiveTeacher.id;

    // Fetch an academic year
    const year = await prisma.academicYear.findFirst({ where: { active: true } });
    academicYearId = year!.id;

    // Ensure CSE class exists
    const cseClass = await prisma.class.findFirst({ where: { departmentId: cseDeptId } });
    cseClassId = cseClass!.id;

    // Create ECE subject for department mismatch testing
    const eceSub = await prisma.subject.upsert({
      where: {
        departmentId_code: {
          departmentId: eceDeptId,
          code: "ECE_TEST_101",
        },
      },
      update: {},
      create: {
        code: "ECE_TEST_101",
        name: "Signals & Systems",
        departmentId: eceDeptId,
        active: true,
      },
    });
    eceSubjectId = eceSub.id;

    // Fetch subjects
    const cseSub1 = await prisma.subject.findFirst({ where: { departmentId: cseDeptId } });
    cseSubject1Id = cseSub1!.id;

    const cseSub2 = await prisma.subject.findFirst({
      where: { departmentId: cseDeptId, id: { not: cseSub1!.id } },
    });
    cseSubject2Id = cseSub2 ? cseSub2.id : cseSub1!.id;

    // Get a seeded assignment for dependent tests
    const seededAssignment = await prisma.teacherAssignment.findFirst({
      where: { timetableEntries: { some: {} } },
    });
    if (seededAssignment) {
      seededAssignmentId = seededAssignment.id;
    }
  });

  beforeEach(async () => {
    adminCookie = await getCookie("admin@college.edu");
    teacherCookie = await getCookie("prof.sharma@college.edu");
    studentCookie = await getCookie("student.aarav@college.edu");
  });

  afterAll(async () => {
    if (createdAssignmentId) {
      await prisma.teacherAssignment.deleteMany({ where: { id: createdAssignmentId } });
    }
    await prisma.user.deleteMany({ where: { email: "inactive.teacher@college.edu" } });
    await prisma.$disconnect();
    server.close();
  });

  it("denies unauthenticated and non-admin users from creating teacher assignments", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        teacherUserId: teacher2Id,
        classId: cseClassId,
        subjectId: cseSubject2Id,
      }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects assignment if the user does not have TEACHER role", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherUserId: studentUserId, // Student role!
        classId: cseClassId,
        subjectId: cseSubject2Id,
      }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_ROLE");
  });

  it("rejects assignment if teacher account is INACTIVE", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherUserId: inactiveTeacherId,
        classId: cseClassId,
        subjectId: cseSubject2Id,
      }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("TEACHER_INACTIVE");
  });

  it("rejects assignment if subject department does not match class department", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherUserId: teacher2Id,
        classId: cseClassId, // CSE
        subjectId: eceSubjectId, // ECE subject!
      }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("DEPARTMENT_MISMATCH");
  });

  it("allows admin to create a valid teacher assignment", async () => {
    // Delete any existing assignment for this tuple
    await prisma.teacherAssignment.deleteMany({
      where: {
        teacherUserId: teacher2Id,
        classId: cseClassId,
        subjectId: cseSubject2Id,
      },
    });

    const res = await fetch(`${baseUrl}/teacher-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherUserId: teacher2Id,
        classId: cseClassId,
        subjectId: cseSubject2Id,
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.teacherUserId).toBe(teacher2Id);
    expect(json.data.classId).toBe(cseClassId);
    expect(json.data.subjectId).toBe(cseSubject2Id);
    createdAssignmentId = json.data.id;
  });

  it("rejects duplicate assignment for same teacher, class, and subject", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherUserId: teacher2Id,
        classId: cseClassId,
        subjectId: cseSubject2Id,
      }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("DUPLICATE_ASSIGNMENT");
  });

  it("lists teacher assignments with pagination and search", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments?search=Verma`, {
      headers: { Cookie: teacherCookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.length).toBeGreaterThanOrEqual(1);
    expect(json.data[0].teacher.name).toContain("Verma");
  });

  it("updates teacher assignment active status", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments/${createdAssignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.active).toBe(false);
  });

  it("prevents deletion of assignment with existing timetable entries or attendance sessions", async () => {
    if (!seededAssignmentId) return;

    const res = await fetch(`${baseUrl}/teacher-assignments/${seededAssignmentId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("DEPENDENT_RECORDS_EXIST");
  });

  it("prevents modifying teacher assignment tuple when timetable entries are already linked", async () => {
    if (!seededAssignmentId) return;

    // Attempt to change subject on seeded assignment with timetable entries
    const res = await fetch(`${baseUrl}/teacher-assignments/${seededAssignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        subjectId: cseSubject2Id,
      }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("DEPENDENT_RECORDS_EXIST");
  });

  it("denies teacher and student from updating or deleting teacher assignments", async () => {
    const patchRes = await fetch(`${baseUrl}/teacher-assignments/${createdAssignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({ active: true }),
    });
    expect(patchRes.status).toBe(403);

    const deleteRes = await fetch(`${baseUrl}/teacher-assignments/${createdAssignmentId}`, {
      method: "DELETE",
      headers: { Cookie: studentCookie },
    });
    expect(deleteRes.status).toBe(403);
  });

  it("allows teacher to query their active assignments via /my-assignments", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments/my-assignments`, {
      headers: { Cookie: teacherCookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    // All returned assignments must belong to teacher1
    json.data.forEach((item: any) => {
      expect(item.teacherUserId).toBe(teacher1Id);
      expect(item.active).toBe(true);
      expect(item.class).toBeDefined();
      expect(item.subject).toBeDefined();
    });
  });

  it("denies unauthenticated access to /my-assignments", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments/my-assignments`);
    expect(res.status).toBe(401);
  });

  it("deletes teacher assignment safely when no timetable entries or sessions exist", async () => {
    const res = await fetch(`${baseUrl}/teacher-assignments/${createdAssignmentId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    createdAssignmentId = "";
  });
});
