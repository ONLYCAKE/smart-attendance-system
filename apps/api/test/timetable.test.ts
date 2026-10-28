import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, Server } from "http";
import { PrismaClient } from "@prisma/client";
import { createApp } from "../src/app.js";

describe("T-022B: Timetable Management Module", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;

  let teacher1Id: string;
  let teacher2Id: string;
  let cseClassId: string;
  let cseClass2Id: string;
  let cseSubject1Id: string;
  let cseSubject2Id: string;

  let assignment1Id: string; // Teacher 1 -> Class 1 -> Subject 1
  let assignment2Id: string; // Teacher 2 -> Class 1 -> Subject 2
  let assignment3Id: string; // Teacher 1 -> Class 2 -> Subject 1

  let createdEntry1Id: string;
  let createdEntry2Id: string;
  let seededEntryId: string;

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

    // Fetch teachers & department
    const [t1, t2, cseDept] = await Promise.all([
      prisma.user.findUnique({ where: { email: "prof.sharma@college.edu" } }),
      prisma.user.findUnique({ where: { email: "prof.verma@college.edu" } }),
      prisma.department.findUnique({ where: { code: "CSE" } }),
    ]);

    teacher1Id = t1!.id;
    teacher2Id = t2!.id;

    // Fetch or create classes
    const classes = await prisma.class.findMany({
      where: { departmentId: cseDept!.id },
      take: 2,
    });
    cseClassId = classes[0].id;

    if (classes.length > 1) {
      cseClass2Id = classes[1].id;
    } else {
      const year = await prisma.academicYear.findFirst();
      const newClass = await prisma.class.create({
        data: {
          departmentId: cseDept!.id,
          academicYearId: year!.id,
          semesterNumber: 6,
          division: "A",
          label: "CSE-Sem6-DivA",
        },
      });
      cseClass2Id = newClass.id;
    }

    // Fetch subjects
    const subjects = await prisma.subject.findMany({
      where: { departmentId: cseDept!.id },
      take: 2,
    });
    cseSubject1Id = subjects[0].id;
    cseSubject2Id = subjects.length > 1 ? subjects[1].id : subjects[0].id;

    // Create or find assignments
    const a1 = await prisma.teacherAssignment.upsert({
      where: {
        classId_subjectId: {
          classId: cseClassId,
          subjectId: cseSubject1Id,
        },
      },
      update: { active: true },
      create: {
        teacherUserId: teacher1Id,
        classId: cseClassId,
        subjectId: cseSubject1Id,
        active: true,
      },
    });
    assignment1Id = a1.id;

    const a2 = await prisma.teacherAssignment.upsert({
      where: {
        classId_subjectId: {
          classId: cseClassId,
          subjectId: cseSubject2Id,
        },
      },
      update: { active: true },
      create: {
        teacherUserId: teacher2Id,
        classId: cseClassId,
        subjectId: cseSubject2Id,
        active: true,
      },
    });
    assignment2Id = a2.id;

    const a3 = await prisma.teacherAssignment.upsert({
      where: {
        classId_subjectId: {
          classId: cseClass2Id,
          subjectId: cseSubject1Id,
        },
      },
      update: { active: true },
      create: {
        teacherUserId: teacher1Id,
        classId: cseClass2Id,
        subjectId: cseSubject1Id,
        active: true,
      },
    });
    assignment3Id = a3.id;

    // Find seeded entry for dependent protection test
    const seeded = await prisma.timetableEntry.findFirst({
      where: { sessions: { some: {} } },
    });
    if (seeded) seededEntryId = seeded.id;
  });

  beforeEach(async () => {
    adminCookie = await getCookie("admin@college.edu");
    teacherCookie = await getCookie("prof.sharma@college.edu");
    studentCookie = await getCookie("student.aarav@college.edu");
  });

  afterAll(async () => {
    if (createdEntry1Id) {
      await prisma.timetableEntry.deleteMany({ where: { id: createdEntry1Id } });
    }
    if (createdEntry2Id) {
      await prisma.timetableEntry.deleteMany({ where: { id: createdEntry2Id } });
    }
    await prisma.$disconnect();
    server.close();
  });

  it("denies unauthenticated and non-admin users from creating timetable entries", async () => {
    const res = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        teacherAssignmentId: assignment1Id,
        classId: cseClassId,
        subjectId: cseSubject1Id,
        dayOfWeek: 1,
        startTime: "09:00",
        endTime: "10:00",
      }),
    });
    expect(res.status).toBe(403);
  });

  it("validates time range: rejects when endTime is earlier than or equal to startTime", async () => {
    const res = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId: assignment1Id,
        classId: cseClassId,
        subjectId: cseSubject1Id,
        dayOfWeek: 1,
        startTime: "11:00",
        endTime: "09:00", // Invalid!
      }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_TIME_RANGE");
  });

  it("validates that class and subject match the referenced teacher assignment", async () => {
    const res = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId: assignment1Id,
        classId: cseClass2Id, // Mismatched class!
        subjectId: cseSubject1Id,
        dayOfWeek: 5,
        startTime: "09:00",
        endTime: "10:00",
      }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("CLASS_ASSIGNMENT_MISMATCH");
  });

  it("creates a valid timetable entry", async () => {
    // Clean up Day 5 test slots first
    await prisma.timetableEntry.deleteMany({
      where: {
        dayOfWeek: 5,
        startTime: { in: ["09:00", "10:00", "11:00"] },
      },
    });

    const res = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId: assignment1Id,
        classId: cseClassId,
        subjectId: cseSubject1Id,
        dayOfWeek: 5, // Friday
        startTime: "09:00",
        endTime: "10:00",
        room: "Lab-301",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.startTime).toBe("09:00");
    expect(json.data.endTime).toBe("10:00");
    createdEntry1Id = json.data.id;
  });

  it("permits boundary-touching half-open interval [10:00, 11:00) starting right when [09:00, 10:00) ends", async () => {
    const res = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId: assignment1Id,
        classId: cseClassId,
        subjectId: cseSubject1Id,
        dayOfWeek: 5,
        startTime: "10:00", // Exactly when previous ends
        endTime: "11:00",
        room: "Lab-301",
      }),
    });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    createdEntry2Id = json.data.id;
  });

  it("detects TEACHER schedule conflict when teacher is scheduled for another class in overlapping interval", async () => {
    // Teacher 1 is already teaching from 09:00 to 10:00 on Day 5.
    // Attempt to schedule Teacher 1 with Class 2 from 09:30 to 10:30 on Day 5.
    const res = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId: assignment3Id, // Teacher 1 with Class 2!
        classId: cseClass2Id,
        subjectId: cseSubject1Id,
        dayOfWeek: 5,
        startTime: "09:30",
        endTime: "10:30",
        room: "Room-402",
      }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("TEACHER_SCHEDULE_CONFLICT");
  });

  it("detects CLASS schedule conflict when same class has another subject scheduled in overlapping interval", async () => {
    // Class 1 already has a class from 09:00 to 10:00 on Day 5.
    // Attempt to schedule Teacher 2 with Class 1 from 09:15 to 09:45 on Day 5.
    const res = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId: assignment2Id, // Teacher 2 with Class 1
        classId: cseClassId,
        subjectId: cseSubject2Id,
        dayOfWeek: 5,
        startTime: "09:15",
        endTime: "09:45",
        room: "Room-501",
      }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("CLASS_SCHEDULE_CONFLICT");
  });

  it("detects ROOM conflict when different class attempts to occupy the same room in overlapping interval", async () => {
    // Lab-301 is occupied from 09:00 to 10:00 on Day 5.
    // Teacher 2 with Class 2 attempts to use Lab-301 from 09:15 to 10:15 on Day 5.
    // Create teacher 2 assignment with class 2 first if not exists
    const a4 = await prisma.teacherAssignment.upsert({
      where: {
        classId_subjectId: {
          classId: cseClass2Id,
          subjectId: cseSubject2Id,
        },
      },
      update: { active: true, teacherUserId: teacher2Id },
      create: {
        teacherUserId: teacher2Id,
        classId: cseClass2Id,
        subjectId: cseSubject2Id,
        active: true,
      },
    });

    const res = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId: a4.id,
        classId: cseClass2Id,
        subjectId: cseSubject2Id,
        dayOfWeek: 5,
        startTime: "09:15",
        endTime: "10:15",
        room: "Lab-301", // Already occupied by Class 1!
      }),
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("ROOM_SCHEDULE_CONFLICT");
  });

  it("allows self-update of a timetable entry without self-conflict", async () => {
    const res = await fetch(`${baseUrl}/timetable/${createdEntry1Id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        room: "Lab-301-Renovated",
      }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.room).toBe("Lab-301-Renovated");
  });

  it("prevents deletion of timetable entry when historical attendance sessions exist", async () => {
    if (!seededEntryId) return;

    const res = await fetch(`${baseUrl}/timetable/${seededEntryId}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error.code).toBe("DEPENDENT_RECORDS_EXIST");
  });

  it("handles concurrent conflicting requests safely", async () => {
    // Attempt two identical conflicting creates simultaneously on Day 6
    const payload = {
      teacherAssignmentId: assignment1Id,
      classId: cseClassId,
      subjectId: cseSubject1Id,
      dayOfWeek: 6,
      startTime: "14:00",
      endTime: "15:00",
      room: "Hall-A",
    };

    // Clean up Day 6 slot first
    await prisma.timetableEntry.deleteMany({
      where: { dayOfWeek: 6, startTime: "14:00" },
    });

    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/timetable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify(payload),
      }),
      fetch(`${baseUrl}/timetable`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: adminCookie },
        body: JSON.stringify(payload),
      }),
    ]);

    const statuses = [res1.status, res2.status];
    expect(statuses).toContain(201);
    expect(statuses).toContain(409);

    // Verify database state: exactly 1 record was committed, never 2
    const persistedCount = await prisma.timetableEntry.count({
      where: { dayOfWeek: 6, startTime: "14:00" },
    });
    expect(persistedCount).toBe(1);

    // Clean up created entry
    await prisma.timetableEntry.deleteMany({
      where: { dayOfWeek: 6, startTime: "14:00" },
    });
  });

  it("denies teacher and student from updating or deleting timetable entries", async () => {
    const patchRes = await fetch(`${baseUrl}/timetable/${createdEntry1Id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({ room: "Hacker-Room" }),
    });
    expect(patchRes.status).toBe(403);

    const deleteRes = await fetch(`${baseUrl}/timetable/${createdEntry1Id}`, {
      method: "DELETE",
      headers: { Cookie: studentCookie },
    });
    expect(deleteRes.status).toBe(403);
  });

  it("allows teacher to view their own schedule via GET /timetable/my-timetable", async () => {
    const res = await fetch(`${baseUrl}/timetable/my-timetable`, {
      headers: { Cookie: teacherCookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.role).toBe("TEACHER");
    expect(json.data.hasPlacement).toBe(true);
    expect(Array.isArray(json.data.entries)).toBe(true);
    json.data.entries.forEach((e: any) => {
      expect(e.teacherAssignment.teacherUserId).toBe(teacher1Id);
    });
  });

  it("allows student to view their class schedule via GET /timetable/my-timetable", async () => {
    const res = await fetch(`${baseUrl}/timetable/my-timetable`, {
      headers: { Cookie: studentCookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.role).toBe("STUDENT");
    expect(json.data.hasPlacement).toBe(true);
    expect(json.data.class).toBeDefined();
    expect(Array.isArray(json.data.entries)).toBe(true);
    json.data.entries.forEach((e: any) => {
      expect(e.classId).toBe(json.data.class.id);
    });
  });

  it("rejects unauthenticated requests to GET /timetable/my-timetable", async () => {
    const res = await fetch(`${baseUrl}/timetable/my-timetable`);
    expect(res.status).toBe(401);
  });

  it("returns clear explanation when student has pending registration status", async () => {
    await prisma.student.deleteMany({ where: { email: "pending.student@college.edu" } });
    await prisma.user.deleteMany({ where: { email: "pending.student@college.edu" } });

    const dept = await prisma.department.findFirstOrThrow();
    const year = await prisma.academicYear.findFirstOrThrow();
    const aarav = await prisma.user.findUniqueOrThrow({
      where: { email: "student.aarav@college.edu" },
    });
    const unapprovedUser = await prisma.user.create({
      data: {
        name: "Pending Student",
        email: "pending.student@college.edu",
        passwordHash: aarav.passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    const unapprovedStudent = await prisma.student.create({
      data: {
        userId: unapprovedUser.id,
        rollNumber: "PEND001",
        name: "Pending Student",
        email: "pending.student@college.edu",
        departmentId: dept.id,
        academicYearId: year.id,
        classId: cseClassId,
        status: "PENDING",
      },
    });

    const pendingCookie = await getCookie("pending.student@college.edu");
    const res = await fetch(`${baseUrl}/timetable/my-timetable`, {
      headers: { Cookie: pendingCookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.hasPlacement).toBe(false);
    expect(json.data.message).toContain("pending approval");

    await prisma.student.delete({ where: { id: unapprovedStudent.id } });
    await prisma.user.delete({ where: { id: unapprovedUser.id } });
  });

  it("enforces teacher scope on general GET /timetable preventing inspection of other teachers", async () => {
    // Teacher 1 attempts to query Teacher 2's schedule
    const res = await fetch(`${baseUrl}/timetable?teacherUserId=${teacher2Id}`, {
      headers: { Cookie: teacherCookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Even though teacher2Id was requested, server must strictly scope to Teacher 1
    json.data.forEach((e: any) => {
      expect(e.teacherAssignment.teacherUserId).toBe(teacher1Id);
    });
  });

  it("enforces student class scope on general GET /timetable preventing inspection of other classes", async () => {
    const student = await prisma.student.findFirstOrThrow({
      where: { email: "student.aarav@college.edu" },
    });
    // Student attempts to query another class
    const res = await fetch(`${baseUrl}/timetable?classId=${cseClass2Id}`, {
      headers: { Cookie: studentCookie },
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    // Server must strictly scope to student's own class cohort
    json.data.forEach((e: any) => {
      expect(e.classId).toBe(student.classId);
    });
  });

  it("rejects unauthenticated requests to GET /timetable/export with 401", async () => {
    const res = await fetch(`${baseUrl}/timetable/export`);
    expect(res.status).toBe(401);
  });

  it("exports timetable CSV for admin with UTF-8 BOM, headers, and filename", async () => {
    const res = await fetch(`${baseUrl}/timetable/export`, {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="institution_timetable_.*\.csv"/);

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    // Verify UTF-8 BOM (0xEF, 0xBB, 0xBF)
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);

    const text = Buffer.from(buf).toString("utf-8");
    const lines = text.trim().split("\r\n");
    expect(lines[0]).toBe(
      "Day of Week,Start Time,End Time,Subject Code,Subject Name,Room,Class Cohort,Department,Faculty Name,Faculty Email"
    );
    expect(lines.length).toBeGreaterThan(1);
    expect(text).toContain("09:00");
    expect(text).toContain("10:00");
  });

  it("scopes teacher CSV export strictly to teacher's assignments", async () => {
    // Teacher queries export with an arbitrary classId (cseClass2Id which teacher might not teach or to verify scoping)
    const res = await fetch(`${baseUrl}/timetable/export`, {
      headers: { Cookie: teacherCookie },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="teacher_schedule_.*\.csv"/);

    const text = await res.text();
    // Teacher 1 is Prof. Rajesh Sharma
    expect(text).toContain("Prof. Rajesh Sharma");
    expect(text).toContain("prof.sharma@college.edu");
    // Should NOT contain unrelated entries from other teachers if any exist
    expect(text).not.toContain("prof.verma@college.edu");
  });

  it("scopes student CSV export strictly to student's cohort", async () => {
    const student = await prisma.student.findFirstOrThrow({
      where: { email: "student.aarav@college.edu" },
      include: { class: true },
    });

    const cseClass = await prisma.class.findUniqueOrThrow({ where: { id: cseClassId } });
    const cseClass2 = await prisma.class.findUniqueOrThrow({ where: { id: cseClass2Id } });

    const originalClassId = student.classId;
    await prisma.student.update({
      where: { id: student.id },
      data: { classId: cseClassId },
    });

    try {
      // Student attempts to query another class cohort (cseClass2Id)
      const res = await fetch(`${baseUrl}/timetable/export?classId=${cseClass2Id}`, {
        headers: { Cookie: studentCookie },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="student_timetable_.*\.csv"/);

      const text = await res.text();
      // Server must strictly scope to student's assigned class cohort
      expect(text).toContain(cseClass.label);
      // And must ignore student's attempt to export cseClass2Id entries
      expect(text).not.toContain(cseClass2.label);
    } finally {
      await prisma.student.update({
        where: { id: student.id },
        data: { classId: originalClassId },
      });
    }
  });

  it("neutralizes spreadsheet formula injection in timetable CSV exports", async () => {
    // Create a temporary timetable entry with malicious formula in room
    const maliciousEntry = await prisma.timetableEntry.create({
      data: {
        classId: cseClassId,
        subjectId: cseSubject1Id,
        teacherAssignmentId: assignment1Id,
        dayOfWeek: 4, // Thursday
        startTime: "06:00",
        endTime: "07:00",
        room: "=cmd|' /C calc'!A0",
      },
    });

    try {
      const res = await fetch(`${baseUrl}/timetable/export`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      // Room value should be sanitized: prefixed with ' and quoted
      expect(text).toContain("\"'=cmd|' /C calc'!A0\"");
    } finally {
      await prisma.timetableEntry.delete({ where: { id: maliciousEntry.id } });
    }
  });

  it("rejects student timetable export when student status is not ACTIVE", async () => {
    await prisma.student.deleteMany({ where: { email: "pending.export@college.edu" } });
    await prisma.user.deleteMany({ where: { email: "pending.export@college.edu" } });

    const dept = await prisma.department.findFirstOrThrow();
    const year = await prisma.academicYear.findFirstOrThrow();
    const aarav = await prisma.user.findUniqueOrThrow({
      where: { email: "student.aarav@college.edu" },
    });
    const unapprovedUser = await prisma.user.create({
      data: {
        name: "Pending Export Student",
        email: "pending.export@college.edu",
        passwordHash: aarav.passwordHash,
        role: "STUDENT",
        status: "ACTIVE",
      },
    });
    const unapprovedStudent = await prisma.student.create({
      data: {
        userId: unapprovedUser.id,
        rollNumber: "PEXP001",
        name: "Pending Export Student",
        email: "pending.export@college.edu",
        departmentId: dept.id,
        academicYearId: year.id,
        classId: cseClassId,
        status: "PENDING",
      },
    });

    const pendingCookie = await getCookie("pending.export@college.edu");
    const res = await fetch(`${baseUrl}/timetable/export`, {
      headers: { Cookie: pendingCookie },
    });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error.code).toBe("FORBIDDEN");

    await prisma.student.delete({ where: { id: unapprovedStudent.id } });
    await prisma.user.delete({ where: { id: unapprovedUser.id } });
  });

  it("deletes timetable entry safely when no sessions exist", async () => {
    const res = await fetch(`${baseUrl}/timetable/${createdEntry1Id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(200);
    createdEntry1Id = "";

    const res2 = await fetch(`${baseUrl}/timetable/${createdEntry2Id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(res2.status).toBe(200);
    createdEntry2Id = "";
  });
});
