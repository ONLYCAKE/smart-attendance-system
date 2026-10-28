import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient, StudentStatus, AttendanceStatus, AttendanceMethod, SessionStatus } from "@prisma/client";

describe("Database Relational Invariants & Concurrency Guards", () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.attendanceRecord.deleteMany({
      where: { student: { email: "temp.bio.test@college.edu" } },
    });
    await prisma.faceEnrollment.deleteMany({
      where: { student: { email: "temp.bio.test@college.edu" } },
    });
    await prisma.biometricConsent.deleteMany({
      where: { student: { email: "temp.bio.test@college.edu" } },
    });
    await prisma.student.deleteMany({
      where: { email: "temp.bio.test@college.edu" },
    });
  });

  afterAll(async () => {
    await prisma.attendanceRecord.deleteMany({
      where: { student: { email: "temp.bio.test@college.edu" } },
    });
    await prisma.faceEnrollment.deleteMany({
      where: { student: { email: "temp.bio.test@college.edu" } },
    });
    await prisma.biometricConsent.deleteMany({
      where: { student: { email: "temp.bio.test@college.edu" } },
    });
    await prisma.student.deleteMany({
      where: { email: "temp.bio.test@college.edu" },
    });
    await prisma.$disconnect();
  });

  it("Invariant 1: Academic Hierarchy is fully navigable", async () => {
    const classWithDept = await prisma.class.findFirst({
      where: { label: "CSE-Sem4-A" },
      include: {
        department: true,
        academicYear: true,
        students: true,
        teacherAssignments: {
          include: {
            teacher: true,
            subject: true,
          },
        },
      },
    });

    expect(classWithDept).not.toBeNull();
    expect(classWithDept?.department.code).toBe("CSE");
    expect(classWithDept?.academicYear.label).toBe("2025-2026");
    expect(classWithDept?.teacherAssignments.length).toBeGreaterThan(0);
    expect(classWithDept?.teacherAssignments.some((ta) => ta.subject.code === "CS401")).toBe(true);
  });

  it("Invariant 2: AttendanceRecord unique constraint prevents duplicate attendance", async () => {
    // Fetch seeded student and active session
    const student = await prisma.student.findFirst({
      where: { rollNumber: "CS001" },
    });
    const session = await prisma.attendanceSession.findFirst({
      where: { status: SessionStatus.ACTIVE },
    });

    expect(student).not.toBeNull();
    expect(session).not.toBeNull();

    // Verify existing record exists
    const existing = await prisma.attendanceRecord.findUnique({
      where: {
        studentId_sessionId: {
          studentId: student!.id,
          sessionId: session!.id,
        },
      },
    });
    expect(existing).not.toBeNull();

    // Attempting duplicate INSERT must throw Prisma unique constraint violation (P2002)
    await expect(
      prisma.attendanceRecord.create({
        data: {
          studentId: student!.id,
          sessionId: session!.id,
          status: AttendanceStatus.PRESENT,
          method: AttendanceMethod.FACE_RECOGNITION,
        },
      })
    ).rejects.toThrow();
  });

  it("Invariant 3: Foreign Key restrictions prevent deleting student with attendance history", async () => {
    const studentWithAttendance = await prisma.student.findFirst({
      where: {
        attendanceRecords: {
          some: {},
        },
      },
    });

    expect(studentWithAttendance).not.toBeNull();

    // Attempting to delete student must fail due to ON DELETE RESTRICT on AttendanceRecord
    await expect(
      prisma.student.delete({
        where: { id: studentWithAttendance!.id },
      })
    ).rejects.toThrow();
  });

  it("Invariant 4: Biometric consent and deletion lifecycle allows descriptor erasure without losing attendance", async () => {
    // Create an ephemeral student for biometric lifecycle testing
    const dept = await prisma.department.findFirst({ where: { code: "CSE" } });
    const year = await prisma.academicYear.findFirst({ where: { label: "2025-2026" } });
    const classCohort = await prisma.class.findFirst({ where: { label: "CSE-Sem4-A" } });
    const session = await prisma.attendanceSession.findFirst({ where: { status: SessionStatus.ACTIVE } });

    const ephemeralStudent = await prisma.student.create({
      data: {
        rollNumber: "TEMP_BIO_TEST_99",
        name: "Test Biometric Lifecycle",
        email: "temp.bio.test@college.edu",
        departmentId: dept!.id,
        academicYearId: year!.id,
        classId: classCohort!.id,
        status: StudentStatus.ACTIVE,
      },
    });

    // 1. Create Biometric Consent
    const consent = await prisma.biometricConsent.create({
      data: {
        studentId: ephemeralStudent.id,
        status: "GRANTED",
        consentVersion: "1.0",
        consentedAt: new Date(),
      },
    });
    expect(consent.revokedAt).toBeNull();

    // Create Face Enrollment
    const enrollment = await prisma.faceEnrollment.create({
      data: {
        studentId: ephemeralStudent.id,
        provider: "human",
        modelVersion: "v1",
        descriptors: JSON.stringify([0.1, 0.2, 0.3]),
        consentedAt: new Date(),
      },
    });
    expect(enrollment.id).toBeDefined();

    // 2. Mark attendance for this student
    const record = await prisma.attendanceRecord.create({
      data: {
        studentId: ephemeralStudent.id,
        sessionId: session!.id,
        status: AttendanceStatus.PRESENT,
        method: AttendanceMethod.FACE_RECOGNITION,
      },
    });
    expect(record.id).toBeDefined();

    // 3. Revoke consent (biometric deactivation)
    const revoked = await prisma.biometricConsent.update({
      where: { studentId: ephemeralStudent.id },
      data: {
        status: "REVOKED",
        revokedAt: new Date(),
        revocationReason: "Student requested deactivation",
      },
    });
    expect(revoked.status).toBe("REVOKED");
    expect(revoked.revokedAt).not.toBeNull();

    // 4. Delete biometric descriptors permanently
    await prisma.faceEnrollment.delete({
      where: { studentId: ephemeralStudent.id },
    });

    const bioAfterDelete = await prisma.faceEnrollment.findUnique({
      where: { studentId: ephemeralStudent.id },
    });
    expect(bioAfterDelete).toBeNull();

    // Verify historical attendance record is still intact
    const attendanceAfterBioDelete = await prisma.attendanceRecord.findUnique({
      where: {
        studentId_sessionId: {
          studentId: ephemeralStudent.id,
          sessionId: session!.id,
        },
      },
    });
    expect(attendanceAfterBioDelete).not.toBeNull();
    expect(attendanceAfterBioDelete?.status).toBe(AttendanceStatus.PRESENT);

    // Cleanup ephemeral record & student
    await prisma.attendanceRecord.delete({ where: { id: record.id } });
    await prisma.student.delete({ where: { id: ephemeralStudent.id } });
  });

  it("Invariant 5: Multi-operation transaction rollback maintains data integrity", async () => {
    const studentCountBefore = await prisma.student.count();

    // Execute an intentional failing transaction
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.student.create({
          data: {
            rollNumber: "ROLL_SHOULD_ROLLBACK",
            name: "Rollback Test",
            email: "rollback@college.edu",
            departmentId: "invalid-uuid-causes-foreign-key-failure",
            academicYearId: "invalid-uuid",
            classId: "invalid-uuid",
          },
        });
      })
    ).rejects.toThrow();

    const studentCountAfter = await prisma.student.count();
    expect(studentCountAfter).toBe(studentCountBefore);
  });
});
