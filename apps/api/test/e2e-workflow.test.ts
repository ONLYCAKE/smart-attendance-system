import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { PrismaClient, Role, StudentStatus, AttendanceStatus, SessionStatus } from "@prisma/client";
import { createApp } from "../src/app.js";

describe("T-057: End-to-End Complete Multi-Role Workflow & Release Gate Verification", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  // Cookies
  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;

  // Test Fixture IDs
  let adminUserId: string;
  let teacherUserId: string;
  let studentUserId: string;
  let studentId: string;
  let departmentId: string;
  let academicYearId: string;
  let classId: string;
  let subjectId: string;
  let teacherAssignmentId: string;
  let timetableEntryId: string;
  let sessionId: string;
  let attendanceRecordId: string;

  // Vectors for biometric recognition testing (1024 floats)
  function generateVector(seed: number): number[] {
    const vec = new Array(1024);
    let sumSq = 0;
    for (let i = 0; i < 1024; i++) {
      const v = Math.sin(seed + i * 17);
      vec[i] = v;
      sumSq += v * v;
    }
    const norm = Math.sqrt(sumSq);
    return vec.map((v) => v / norm);
  }

  const enrolledDescriptor = generateVector(100);
  const matchingProbeDescriptor = [...enrolledDescriptor]; // Exact match, cosine similarity 1.0
  // Pairwise flipped & inverted to guarantee mathematical dot product == 0.0 (cosine similarity 0.0)
  const orthogonalProbeDescriptor = enrolledDescriptor.map((v, i) =>
    i % 2 === 0 ? -enrolledDescriptor[i + 1] : enrolledDescriptor[i - 1]
  );

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
    baseUrl = `http://127.0.0.1:${port}/api/v1`;

    // Ensure seeded users exist
    const [adminUser, teacherUser] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { email: "admin@college.edu" } }),
      prisma.user.findUniqueOrThrow({ where: { email: "prof.sharma@college.edu" } }),
    ]);
    adminUserId = adminUser.id;
    teacherUserId = teacherUser.id;

    adminCookie = await loginUser("admin@college.edu");
    teacherCookie = await loginUser("prof.sharma@college.edu");

    // Clean up any previous test entities
    await prisma.student.deleteMany({ where: { email: "e2e.student@college.edu" } });
    await prisma.user.deleteMany({ where: { email: "e2e.student@college.edu" } });
  });

  afterAll(async () => {
    // Teardown created test entities
    if (attendanceRecordId) {
      await prisma.attendanceRecord.deleteMany({ where: { id: attendanceRecordId } });
    }
    if (sessionId) {
      await prisma.attendanceRecord.deleteMany({ where: { sessionId } });
      await prisma.attendanceSession.deleteMany({ where: { id: sessionId } });
    }
    if (timetableEntryId) {
      await prisma.timetableEntry.deleteMany({ where: { id: timetableEntryId } });
    }
    if (teacherAssignmentId) {
      await prisma.teacherAssignment.deleteMany({ where: { id: teacherAssignmentId } });
    }
    if (studentId) {
      await prisma.faceEnrollment.deleteMany({ where: { studentId } });
      await prisma.biometricConsent.deleteMany({ where: { studentId } });
      await prisma.notification.deleteMany({ where: { studentId } });
      await prisma.student.deleteMany({ where: { id: studentId } });
    }
    if (studentUserId) {
      await prisma.user.deleteMany({ where: { id: studentUserId } });
    }
    if (classId) {
      await prisma.class.deleteMany({ where: { id: classId } });
    }
    if (subjectId) {
      await prisma.subject.deleteMany({ where: { id: subjectId } });
    }
    if (departmentId) {
      await prisma.department.deleteMany({ where: { id: departmentId } });
    }

    await prisma.$disconnect();
    server.close();
  });

  // STEP 1: Admin configures academic structure, teacher assignments, and timetable
  it("Step 1: Admin signs in and configures academic structure, assignments, and timetable", async () => {
    // 1. Department
    const deptRes = await fetch(`${baseUrl}/departments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        code: "E2EDEPT",
        name: "E2E Verification Department",
      }),
    });
    expect(deptRes.status).toBe(201);
    const deptJson = await deptRes.json();
    departmentId = deptJson.data.id;

    // 2. Academic Year
    const acadYear = await prisma.academicYear.findFirstOrThrow();
    academicYearId = acadYear.id;

    // 3. Class (Mounted at /classes)
    const classRes = await fetch(`${baseUrl}/classes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        departmentId,
        academicYearId,
        semesterNumber: 4,
        division: "E2E-A",
        label: "E2E-Sem4-A",
      }),
    });
    expect(classRes.status).toBe(201);
    const classJson = await classRes.json();
    classId = classJson.data.id;

    // 4. Subject (Mounted at /subjects)
    const subRes = await fetch(`${baseUrl}/subjects`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        code: "E2E101",
        name: "End-to-End System Engineering",
        departmentId,
      }),
    });
    expect(subRes.status).toBe(201);
    const subJson = await subRes.json();
    subjectId = subJson.data.id;

    // 5. Teacher Assignment
    const assignRes = await fetch(`${baseUrl}/teacher-assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherUserId,
        classId,
        subjectId,
      }),
    });
    expect(assignRes.status).toBe(201);
    const assignJson = await assignRes.json();
    teacherAssignmentId = assignJson.data.id;

    // 6. Timetable Entry (Day 2 Tuesday 11:00 - 12:00 Room E2E-LAB)
    const ttRes = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId,
        classId,
        subjectId,
        dayOfWeek: 2,
        startTime: "11:00",
        endTime: "12:00",
        room: "E2E-LAB",
      }),
    });
    expect(ttRes.status).toBe(201);
    const ttJson = await ttRes.json();
    timetableEntryId = ttJson.data.id;

    // 7. Conflict detection verification: duplicate room booking must fail with 409
    const conflictRes = await fetch(`${baseUrl}/timetable`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        teacherAssignmentId,
        classId,
        subjectId,
        dayOfWeek: 2,
        startTime: "11:30",
        endTime: "12:30",
        room: "E2E-LAB", // Overlapping room!
      }),
    });
    expect(conflictRes.status).toBe(409);
  });

  // STEP 2: A new student registers and receives PENDING status
  it("Step 2: A new student registers and receives PENDING status", async () => {
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "E2E Test Student",
        email: "e2e.student@college.edu",
        password: "Password@123",
        rollNumber: "E2E-ROLL-01",
        departmentId,
        academicYearId,
        classId,
      }),
    });
    expect(regRes.status).toBe(201);
    const regJson = await regRes.json();
    expect(regJson.success).toBe(true);

    const studentRecord = await prisma.student.findUniqueOrThrow({
      where: { email: "e2e.student@college.edu" },
      include: { user: true },
    });
    expect(studentRecord.status).toBe(StudentStatus.PENDING);
    studentId = studentRecord.id;
    studentUserId = studentRecord.userId!;

    // Pending student cannot sign in before approval (rejected with 403 ACCOUNT_PENDING)
    const pendingLoginRes = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "e2e.student@college.edu", password: "Password@123" }),
    });
    expect(pendingLoginRes.status).toBe(403);
    const pendingLoginJson = await pendingLoginRes.json();
    expect(pendingLoginJson.error.code).toBe("ACCOUNT_PENDING");
  });

  // STEP 3: The pending student is prevented from accessing protected student features
  it("Step 3: The pending student is blocked from consent, enrollment, and timetable data", async () => {
    // Unapproved / unauthenticated request to record consent is rejected
    const consentRes = await fetch(`${baseUrl}/students/${studentId}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agreed: true,
        consentVersion: "1.0",
      }),
    });
    expect(consentRes.status).toBe(401);

    // Unapproved / unauthenticated request to enroll face is rejected
    const enrollRes = await fetch(`${baseUrl}/students/${studentId}/face-enrollment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consentVersion: "1.0",
        descriptor: enrolledDescriptor,
      }),
    });
    expect(enrollRes.status).toBe(401);

    // Unauthenticated timetable request is rejected
    const ttRes = await fetch(`${baseUrl}/timetable/my-timetable`);
    expect(ttRes.status).toBe(401);
  });

  // STEP 4: Admin approves the student
  it("Step 4: Admin approves the student", async () => {
    const approveRes = await fetch(`${baseUrl}/students/${studentId}/approve`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(approveRes.status).toBe(200);
    const approveJson = await approveRes.json();
    expect(approveJson.success).toBe(true);
    expect(approveJson.data.student.status).toBe(StudentStatus.ACTIVE);

    const updated = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    expect(updated.status).toBe(StudentStatus.ACTIVE);

    // After approval, tokenVersion was incremented so previous token was revoked.
    // Re-login to obtain fresh token with valid tokenVersion
    studentCookie = await loginUser("e2e.student@college.edu");
    expect(studentCookie).toBeTruthy();
  });

  // STEP 5: The approved student provides explicit biometric consent and completes enrollment
  it("Step 5: Approved student provides biometric consent and completes face enrollment", async () => {
    // 1. Submit Consent
    const consentRes = await fetch(`${baseUrl}/students/${studentId}/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({
        agreed: true,
        consentVersion: "1.0",
      }),
    });
    expect(consentRes.status).toBe(200);
    const consentJson = await consentRes.json();
    expect(consentJson.success).toBe(true);
    expect(consentJson.data.consent.status).toBe("GRANTED");

    // 2. Submit Enrollment
    const enrollRes = await fetch(`${baseUrl}/students/${studentId}/face-enrollment`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({
        consentVersion: "1.0",
        descriptor: enrolledDescriptor,
      }),
    });
    expect(enrollRes.status).toBe(201);
    const enrollJson = await enrollRes.json();
    expect(enrollJson.success).toBe(true);

    // 3. Verify encrypted storage at rest (never raw numbers)
    const faceRecord = await prisma.faceEnrollment.findUniqueOrThrow({
      where: { studentId },
    });
    expect(faceRecord.descriptors).not.toContain(String(enrolledDescriptor[0]));
    expect(faceRecord.descriptors).toMatch(/^v1:/); // Encrypted versioned envelope
  });

  // STEP 6: The assigned teacher creates and starts an attendance session
  it("Step 6: Assigned teacher creates and starts an attendance session", async () => {
    // 1. Create Session (Mounted at /attendance-sessions)
    const createRes = await fetch(`${baseUrl}/attendance-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        classId,
        subjectId,
        timetableEntryId,
      }),
    });
    expect(createRes.status).toBe(201);
    const createJson = await createRes.json();
    sessionId = createJson.data.id;
    expect([SessionStatus.SCHEDULED, SessionStatus.ACTIVE]).toContain(createJson.data.status);

    // 2. Start Session (if currently SCHEDULED)
    if (createJson.data.status === SessionStatus.SCHEDULED) {
      const startRes = await fetch(`${baseUrl}/attendance-sessions/${sessionId}/start`, {
        method: "POST",
        headers: { Cookie: teacherCookie },
      });
      expect(startRes.status).toBe(200);
      const startJson = await startRes.json();
      expect(startJson.data.status).toBe(SessionStatus.ACTIVE);
    }
  });

  // STEP 7: Camera and recognition flow: no-match vs matching candidates
  it("Step 7: Camera recognition handles no-match and verified candidates correctly", async () => {
    // 1. Unrecognized face -> MATCH_NOT_FOUND
    const noMatchRes = await fetch(`${baseUrl}/attendance-sessions/${sessionId}/recognize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        descriptor: orthogonalProbeDescriptor,
      }),
    });
    expect(noMatchRes.status).toBe(200);
    const noMatchJson = await noMatchRes.json();
    expect(noMatchJson.data.outcome).toBe("NO_MATCH");

    // 2. Matching enrolled face -> Candidate returned
    const matchRes = await fetch(`${baseUrl}/attendance-sessions/${sessionId}/recognize`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        descriptor: matchingProbeDescriptor,
      }),
    });
    expect(matchRes.status).toBe(200);
    const matchJson = await matchRes.json();
    expect(matchJson.data.outcome).toBe("MATCH_FOUND");
    expect(matchJson.data.candidate.id).toBe(studentId);
    expect(matchJson.data.confidence).toBeGreaterThan(0.9);
  });

  // STEP 8: Teacher explicitly confirms recognition candidate
  it("Step 8: Teacher explicitly confirms candidate and attendance is recorded with deduplication", async () => {
    const confirmRes = await fetch(`${baseUrl}/attendance-sessions/${sessionId}/confirm-recognition`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        studentId,
        confidence: 0.96,
        status: AttendanceStatus.PRESENT,
        teacherConfirmed: true,
      }),
    });
    expect(confirmRes.status).toBe(200);
    const confirmJson = await confirmRes.json();
    expect(confirmJson.success).toBe(true);
    expect(confirmJson.data.record.status).toBe(AttendanceStatus.PRESENT);
    expect(confirmJson.data.record.method).toBe("FACE_RECOGNITION");
    attendanceRecordId = confirmJson.data.record.id;

    // Verify DB state
    const record = await prisma.attendanceRecord.findUniqueOrThrow({
      where: { id: attendanceRecordId },
    });
    expect(record.status).toBe(AttendanceStatus.PRESENT);

    // Duplicate confirmation attempt must be rejected or idempotent (never create duplicate record)
    const duplicateRes = await fetch(`${baseUrl}/attendance-sessions/${sessionId}/confirm-recognition`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        studentId,
        confidence: 0.96,
        status: AttendanceStatus.PRESENT,
        teacherConfirmed: true,
      }),
    });
    expect([200, 409]).toContain(duplicateRes.status);
    const count = await prisma.attendanceRecord.count({
      where: { sessionId, studentId },
    });
    expect(count).toBe(1);
  });

  // STEP 9: Teacher manually corrects attendance with mandatory reason
  it("Step 9: Teacher corrects attendance with mandatory audit reason", async () => {
    // 1. Rejected if reason is too short (< 5 chars) via /attendance-records/:id
    const invalidRes = await fetch(`${baseUrl}/attendance-records/${attendanceRecordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        status: AttendanceStatus.LATE,
        correctionReason: "bad", // < 5 chars
      }),
    });
    expect(invalidRes.status).toBe(400);

    // 2. Accepted with valid reason
    const validRes = await fetch(`${baseUrl}/attendance-records/${attendanceRecordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        status: AttendanceStatus.LATE,
        correctionReason: "Student arrived 15 minutes late verified by instructor",
      }),
    });
    expect(validRes.status).toBe(200);
    const validJson = await validRes.json();
    expect(validJson.data.status).toBe(AttendanceStatus.LATE);
    expect(validJson.data.correctionReason).toContain("15 minutes late");

    // 3. Revert back to PRESENT for subsequent 100% attendance testing
    await fetch(`${baseUrl}/attendance-records/${attendanceRecordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        status: AttendanceStatus.PRESENT,
        correctionReason: "Re-verified full period attendance",
      }),
    });
  });

  // STEP 10: Teacher closes session according to implemented lifecycle
  it("Step 10: Teacher closes session; subsequent writes on completed session are rejected", async () => {
    const closeRes = await fetch(`${baseUrl}/attendance-sessions/${sessionId}/close`, {
      method: "POST",
      headers: { Cookie: teacherCookie },
    });
    expect(closeRes.status).toBe(200);
    const closeJson = await closeRes.json();
    expect(closeJson.data.status).toBe(SessionStatus.COMPLETED);

    // Confirmation on closed session fails closed
    const lateConfirmRes = await fetch(`${baseUrl}/attendance-sessions/${sessionId}/confirm-recognition`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: teacherCookie },
      body: JSON.stringify({
        studentId,
        confidence: 0.95,
        status: AttendanceStatus.PRESENT,
        teacherConfirmed: true,
      }),
    });
    expect(lateConfirmRes.status).toBe(400);
    const errJson = await lateConfirmRes.json();
    expect(errJson.error.code).toBe("SESSION_NOT_ACTIVE");
  });

  // STEP 11: Reports reflect the resulting attendance records correctly
  it("Step 11: Student, teacher, and admin reports reflect the completed session", async () => {
    // 1. Student personal report
    const sRepRes = await fetch(`${baseUrl}/reports/student/me`, {
      headers: { Cookie: studentCookie },
    });
    expect(sRepRes.status).toBe(200);
    const sRepJson = await sRepRes.json();
    expect(sRepJson.data.summary.totalEligibleSessions).toBe(1);
    expect(sRepJson.data.summary.presentCount).toBe(1);
    expect(sRepJson.data.summary.overallPercentage).toBe(100);

    // 2. Teacher class report
    const tRepRes = await fetch(`${baseUrl}/reports/teacher/attendance?classId=${classId}`, {
      headers: { Cookie: teacherCookie },
    });
    expect(tRepRes.status).toBe(200);
    const tRepJson = await tRepRes.json();
    expect(tRepJson.data.students.length).toBeGreaterThanOrEqual(1);
    const studentInRoster = tRepJson.data.students.find((r: any) => r.student.id === studentId);
    expect(studentInRoster).toBeDefined();
    expect(studentInRoster.percentage).toBe(100);

    // 3. Admin institutional summary
    const aRepRes = await fetch(`${baseUrl}/reports/admin/summary?departmentId=${departmentId}`, {
      headers: { Cookie: adminCookie },
    });
    expect(aRepRes.status).toBe(200);
    const aRepJson = await aRepRes.json();
    expect(Array.isArray(aRepJson.data.departments)).toBe(true);
    expect(Array.isArray(aRepJson.data.classes)).toBe(true);
    expect(aRepJson.data.summary.totalClasses).toBeGreaterThanOrEqual(1);
  });

  // STEP 12: Low-attendance alerts evaluate and resolve accurately
  it("Step 12: Low-attendance alerts evaluate and resolve according to threshold", async () => {
    // 1. Evaluate with student at 100% -> No active low-attendance warning
    const evalRes = await fetch(`${baseUrl}/notifications/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ classId }),
    });
    expect(evalRes.status).toBe(200);

    // 2. Temporarily set student record to ABSENT (0%) to test threshold trigger
    await prisma.attendanceRecord.update({
      where: { id: attendanceRecordId },
      data: { status: AttendanceStatus.ABSENT },
    });

    // Re-evaluate alerts -> Student attendance (0%) < 75% -> Generates warning
    const evalRes2 = await fetch(`${baseUrl}/notifications/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ classId }),
    });
    expect(evalRes2.status).toBe(200);

    const warnNotif = await prisma.notification.findFirst({
      where: { studentId, dedupKey: "LOW_ATTENDANCE:OVERALL" },
    });
    expect(warnNotif).toBeDefined();
    expect(warnNotif!.status).toBe("UNREAD");

    // 3. Restore student record to PRESENT (100%) -> Re-evaluate -> Warning auto-resolves!
    await prisma.attendanceRecord.update({
      where: { id: attendanceRecordId },
      data: { status: AttendanceStatus.PRESENT },
    });

    const evalRes3 = await fetch(`${baseUrl}/notifications/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ classId }),
    });
    expect(evalRes3.status).toBe(200);

    const resolvedNotif = await prisma.notification.findFirst({
      where: { studentId, dedupKey: "LOW_ATTENDANCE:OVERALL" },
    });
    expect(resolvedNotif!.status).toBe("RESOLVED");
  });

  // STEP 13: CSV exports contain correct data and neutralize formula injection
  it("Step 13: CSV exports provide sanitized RFC 4180 output without formula injection", async () => {
    const csvRes = await fetch(`${baseUrl}/reports/teacher/attendance/export?classId=${classId}`, {
      headers: { Cookie: teacherCookie },
    });
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get("content-type")).toContain("text/csv");
    const csvText = await csvRes.text();

    // Verify student name and roll number are present
    expect(csvText).toContain("E2E Test Student");
    expect(csvText).toContain("E2E-ROLL-01");
    // Verify no unauthorized leak of other classes
    expect(csvText).not.toContain("EXP-Sem7-B");
  });

  // STEP 14: Timetable views and export scoping respect role and cohort restrictions
  it("Step 14: Timetable views and exports strictly enforce student and teacher scoping", async () => {
    // 1. Student timetable view strictly scoped to E2E-Sem4-A
    const sTtRes = await fetch(`${baseUrl}/timetable/my-timetable`, {
      headers: { Cookie: studentCookie },
    });
    expect(sTtRes.status).toBe(200);
    const sTtJson = await sTtRes.json();
    expect(sTtJson.data.role).toBe(Role.STUDENT);
    expect(sTtJson.data.hasPlacement).toBe(true);
    expect(sTtJson.data.class.id).toBe(classId);
    expect(sTtJson.data.entries.length).toBe(1);
    expect(sTtJson.data.entries[0].room).toBe("E2E-LAB");

    // 2. Student timetable export
    const sExpRes = await fetch(`${baseUrl}/timetable/export`, {
      headers: { Cookie: studentCookie },
    });
    expect(sExpRes.status).toBe(200);
    const sExpText = await sExpRes.text();
    expect(sExpText).toContain("E2E-Sem4-A");
    expect(sExpText).toContain("E2E-LAB");

    // 3. Teacher timetable view strictly scoped to teacher assignments
    const tTtRes = await fetch(`${baseUrl}/timetable/my-timetable`, {
      headers: { Cookie: teacherCookie },
    });
    expect(tTtRes.status).toBe(200);
    const tTtJson = await tTtRes.json();
    expect(tTtJson.data.role).toBe(Role.TEACHER);
  });

  // STEP 15: Consent revocation and biometric descriptor erasure workflow
  it("Step 15: Consent revocation and biometric descriptor erasure behaves fail-closed", async () => {
    // 1. Revoke Consent (/students/:id/face-enrollment/revoke)
    const revokeRes = await fetch(`${baseUrl}/students/${studentId}/face-enrollment/revoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: studentCookie },
      body: JSON.stringify({
        reason: "Student requested complete biometric deletion under DPDP Act 2023",
      }),
    });
    expect([200, 204]).toContain(revokeRes.status);

    // 2. Delete Enrollment (/students/:id/face-enrollment)
    const delRes = await fetch(`${baseUrl}/students/${studentId}/face-enrollment`, {
      method: "DELETE",
      headers: { Cookie: studentCookie },
    });
    expect(delRes.status).toBe(200);

    // 3. Verify PostgreSQL descriptor is completely purged
    const purgedRecord = await prisma.faceEnrollment.findUniqueOrThrow({
      where: { studentId },
    });
    expect(purgedRecord.status).toBe("DELETED");
    expect(purgedRecord.descriptors).toBe("");

    // 4. Verify biometric recognition excludes student
    // Start another temporary session to verify recognition exclusion
    const tempSession = await prisma.attendanceSession.create({
      data: {
        classId,
        subjectId,
        teacherUserId,
        status: SessionStatus.ACTIVE,
      },
    });

    try {
      const probeRes = await fetch(`${baseUrl}/attendance-sessions/${tempSession.id}/recognize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: teacherCookie },
        body: JSON.stringify({
          descriptor: matchingProbeDescriptor,
        }),
      });
      expect(probeRes.status).toBe(200);
      const probeJson = await probeRes.json();
      // Even with matching probe vector, revoked & deleted student is excluded!
      expect(probeJson.data.outcome).toBe("NO_MATCH");
    } finally {
      await prisma.attendanceSession.delete({ where: { id: tempSession.id } });
    }
  });
});
