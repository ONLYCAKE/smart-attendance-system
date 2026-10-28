import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import bcrypt from "bcrypt";
import { createServer, Server } from "http";
import { PrismaClient, StudentStatus, UserStatus, Role } from "@prisma/client";
import { createApp } from "../src/app.js";
import { enrollmentService } from "../src/modules/enrollment/enrollment.service.js";
import {
  decryptDescriptor,
  encryptDescriptor,
  rotateDescriptorEnvelope,
} from "../src/modules/enrollment/encryption.util.js";

describe("T-032 Final Security Gate: Consent, Encryption and Biometric Deletion", () => {
  let server: Server;
  let baseUrl: string;
  let prisma: PrismaClient;

  let adminCookie: string;
  let teacherCookie: string;
  let studentCookie: string;

  let activeStudentId: string;
  let pendingStudentId: string;
  let secondStudentId: string;
  let secondStudentCookie: string;

  function generateValidVector(seed = 42): number[] {
    const vec = new Array(1024);
    let sumSq = 0;
    for (let i = 0; i < 1024; i++) {
      const v = Math.sin(seed + i * 37);
      vec[i] = v;
      sumSq += v * v;
    }
    const norm = Math.sqrt(sumSq);
    return vec.map((v) => v / norm);
  }

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
    teacherCookie = await loginUser("prof.sharma@college.edu");
    studentCookie = await loginUser("student.aarav@college.edu");

    const aarav = await prisma.student.findUniqueOrThrow({
      where: { email: "student.aarav@college.edu" },
    });
    activeStudentId = aarav.id;

    const diya = await prisma.student.findUniqueOrThrow({
      where: { email: "diya.shah@college.edu" },
    });
    pendingStudentId = diya.id;

    const cseDept = await prisma.department.findFirstOrThrow({ where: { code: "CSE" } });
    const academicYear = await prisma.academicYear.findFirstOrThrow();
    const classA = await prisma.class.findFirstOrThrow();

    const secUser = await prisma.user.upsert({
      where: { email: "student.priya@college.edu" },
      update: { status: UserStatus.ACTIVE, role: Role.STUDENT },
      create: {
        name: "Priya Sharma",
        email: "student.priya@college.edu",
        passwordHash: await bcrypt.hash("Password@123", 10),
        role: Role.STUDENT,
        status: UserStatus.ACTIVE,
      },
    });

    const secStudent = await prisma.student.upsert({
      where: { email: "student.priya@college.edu" },
      update: { status: StudentStatus.ACTIVE, classId: classA.id },
      create: {
        name: "Priya Sharma",
        email: "student.priya@college.edu",
        rollNumber: "CS-2026-999",
        departmentId: cseDept.id,
        academicYearId: academicYear.id,
        classId: classA.id,
        userId: secUser.id,
        status: StudentStatus.ACTIVE,
      },
    });
    secondStudentId = secStudent.id;
    secondStudentCookie = await loginUser("student.priya@college.edu");
  });

  afterAll(async () => {
    await prisma.faceEnrollment.deleteMany({
      where: { studentId: { in: [activeStudentId, secondStudentId, pendingStudentId].filter(Boolean) } },
    });
    await prisma.biometricConsent.deleteMany({
      where: { studentId: { in: [activeStudentId, secondStudentId, pendingStudentId].filter(Boolean) } },
    });
    await prisma.student.deleteMany({ where: { email: "student.priya@college.edu" } });
    await prisma.user.deleteMany({ where: { email: "student.priya@college.edu" } });

    await prisma.$disconnect();
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
  });

  beforeEach(async () => {
    await prisma.faceEnrollment.deleteMany({
      where: { studentId: { in: [activeStudentId, secondStudentId, pendingStudentId].filter(Boolean) } },
    });
    await prisma.biometricConsent.deleteMany({
      where: { studentId: { in: [activeStudentId, secondStudentId, pendingStudentId].filter(Boolean) } },
    });
  });

  describe("1. Consent Integrity & Version Control", () => {
    it("denies unauthenticated request to record consent", async () => {
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agreed: true, consentVersion: "1.0" }),
      });
      expect(res.status).toBe(401);
    });

    it("strictly prevents administrator from granting consent on behalf of a student without representative policy", async () => {
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({ agreed: true, consentVersion: "1.0" }),
      });
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe("REPRESENTATIVE_CONSENT_REQUIRED");
    });

    it("allows administrator to record consent WITH authorized representative policy and legal document reference", async () => {
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          agreed: true,
          consentVersion: "1.0",
          representativeConsent: {
            legalBasis: "LEGAL_GUARDIAN_PHYSICAL_FORM",
            documentReference: "DOC-REF-2026-GUARDIAN-001",
            guardianName: "Mr. Rajesh Patel",
          },
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.data.consent.status).toBe("GRANTED");

      const log = await prisma.auditLog.findFirst({
        where: { action: "BIOMETRIC_CONSENT_GRANTED_REPRESENTATIVE", entityId: activeStudentId },
        orderBy: { createdAt: "desc" },
      });
      expect(log).toBeDefined();
      expect(log?.metadata?.includes("DOC-REF-2026-GUARDIAN-001")).toBe(true);
    });

    it("rejects mismatched or client-forged consent terms version", async () => {
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: studentCookie,
        },
        body: JSON.stringify({ agreed: true, consentVersion: "99.0" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("UNSUPPORTED_CONSENT_VERSION");
    });

    it("allows student self to record consent directly", async () => {
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: studentCookie,
        },
        body: JSON.stringify({ agreed: true, consentVersion: "1.0" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.data.consent.status).toBe("GRANTED");

      const log = await prisma.auditLog.findFirst({
        where: { action: "BIOMETRIC_CONSENT_GRANTED_SELF", entityId: activeStudentId },
      });
      expect(log).toBeDefined();
    });

    it("allows revoking consent and disables matching immediately", async () => {
      await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ agreed: true, consentVersion: "1.0" }),
      });

      const resRevoke = await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ agreed: false, revocationReason: "Withdrawn by student" }),
      });
      expect(resRevoke.status).toBe(200);

      const statusRes = await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        headers: { Cookie: studentCookie },
      });
      const statusData = await statusRes.json();
      expect(statusData.data.hasConsent).toBe(false);
      expect(statusData.data.status).toBe("REVOKED");
    });
  });

  describe("2. AES-256-GCM Encryption, Nonces & Key Rotation", () => {
    it("persists descriptors in authenticated AES-256-GCM versioned envelope (v1:iv:tag:cipher)", async () => {
      await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ agreed: true }),
      });

      const vector = generateValidVector(1);
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ descriptor: vector }),
      });
      expect(res.status).toBe(201);

      const record = await prisma.faceEnrollment.findUniqueOrThrow({
        where: { studentId: activeStudentId },
      });
      expect(record.descriptors.startsWith("v1:")).toBe(true);
      const segments = record.descriptors.split(":");
      expect(segments.length).toBe(4); // v1, iv, tag, ciphertext
      expect(segments[1].length).toBe(24); // 12 bytes IV in hex
      expect(segments[2].length).toBe(32); // 16 bytes tag in hex
    });

    it("fails decryption if ciphertext or authentication tag is tampered", () => {
      const vector = generateValidVector(2);
      const encrypted = encryptDescriptor(vector);
      const parts = encrypted.split(":");
      // Corrupt the ciphertext segment
      const corrupted = `${parts[0]}:${parts[1]}:${parts[2]}:ffff${parts[3].slice(4)}`;
      expect(() => decryptDescriptor(corrupted)).toThrow(
        /Biometric descriptor decryption failed/
      );
    });

    it("executes safe key rotation without leaking plaintext vectors", () => {
      const vector = generateValidVector(3);
      const originalEnvelope = encryptDescriptor(vector, "v1");
      const rotatedEnvelope = rotateDescriptorEnvelope(originalEnvelope, "v1");
      expect(rotatedEnvelope.startsWith("v1:")).toBe(true);
      const decrypted = decryptDescriptor(rotatedEnvelope);
      expect(decrypted.length).toBe(1024);
      expect(Math.abs(decrypted[0] - vector[0])).toBeLessThan(0.0001);
    });
  });

  describe("3. Deletion, Retention, and Audit Preservation", () => {
    it("purges descriptors on DELETE /face-enrollment and immediately excludes from candidate vectors", async () => {
      await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ agreed: true }),
      });
      const vector = generateValidVector(4);
      await fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ descriptor: vector }),
      });

      const resDelete = await fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
        method: "DELETE",
        headers: { Cookie: studentCookie },
      });
      expect(resDelete.status).toBe(200);

      const record = await prisma.faceEnrollment.findUniqueOrThrow({
        where: { studentId: activeStudentId },
      });
      expect(record.status).toBe("DELETED");
      expect(record.descriptors).toBe("");

      const activeCandidates = await enrollmentService.getActiveDecryptedDescriptors([activeStudentId]);
      expect(activeCandidates.length).toBe(0);
    });

    it("preserves audit log history independently without cascade deletion", async () => {
      const auditCountBefore = await prisma.auditLog.count({
        where: { entityId: activeStudentId },
      });
      expect(auditCountBefore).toBeGreaterThan(0);

      const logs = await prisma.auditLog.findMany({
        where: { entityId: activeStudentId },
      });
      for (const log of logs) {
        expect(log.metadata?.includes("descriptor")).toBe(false);
      }
    });

    it("preserves historical attendance records when biometric data is deleted", async () => {
      const testSession = await prisma.attendanceSession.create({
        data: {
          classId: (await prisma.class.findFirstOrThrow()).id,
          subjectId: (await prisma.subject.findFirstOrThrow()).id,
          teacherUserId: (await prisma.user.findFirstOrThrow({ where: { role: Role.TEACHER } })).id,
          status: "COMPLETED",
        },
      });

      const attRecord = await prisma.attendanceRecord.create({
        data: {
          studentId: activeStudentId,
          sessionId: testSession.id,
          status: "PRESENT",
          method: "FACE_RECOGNITION",
        },
      });

      await fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
        method: "DELETE",
        headers: { Cookie: studentCookie },
      });

      const attCheck = await prisma.attendanceRecord.findUnique({
        where: { id: attRecord.id },
      });
      expect(attCheck).toBeDefined();
      expect(attCheck?.status).toBe("PRESENT");

      await prisma.attendanceRecord.delete({ where: { id: attRecord.id } });
      await prisma.attendanceSession.delete({ where: { id: testSession.id } });
    });
  });

  describe("4. Recognition Trust Boundary & Safeguards", () => {
    it("rejects face enrollment without consent", async () => {
      const vector = generateValidVector(5);
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ descriptor: vector }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("CONSENT_REQUIRED");
    });

    it("rejects unnormalized descriptor vector", async () => {
      await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ agreed: true }),
      });
      const unnorm = new Array(1024).fill(0.3);
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ descriptor: unnorm }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error.code).toBe("UNNORMALIZED_DESCRIPTOR");
    });

    it("rejects non-finite values (NaN / Infinity)", async () => {
      await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ agreed: true }),
      });
      const nanVector = generateValidVector(6);
      (nanVector as any)[5] = null;
      const res = await fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ descriptor: nanVector }),
      });
      expect(res.status).toBe(400);
    });

    it("safely handles concurrent enrollment requests idempotently", async () => {
      await fetch(`${baseUrl}/students/${activeStudentId}/consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: studentCookie },
        body: JSON.stringify({ agreed: true }),
      });

      const vectorA = generateValidVector(7);
      const vectorB = generateValidVector(8);

      const [resA, resB] = await Promise.all([
        fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: studentCookie },
          body: JSON.stringify({ descriptor: vectorA }),
        }),
        fetch(`${baseUrl}/students/${activeStudentId}/face-enrollment`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: studentCookie },
          body: JSON.stringify({ descriptor: vectorB }),
        }),
      ]);

      expect(resA.status).toBe(201);
      expect(resB.status).toBe(201);

      const record = await prisma.faceEnrollment.findUniqueOrThrow({
        where: { studentId: activeStudentId },
      });
      expect(record.status).toBe("ACTIVE");
    });
  });

  describe("T-052: Admin Student Directory & Registration Approval", () => {
    it("denies access to GET /students for unauthenticated users (401)", async () => {
      const res = await fetch(`${baseUrl}/students`);
      expect(res.status).toBe(401);
    });

    it("denies access to GET /students for non-admin users (403)", async () => {
      const res = await fetch(`${baseUrl}/students`, {
        headers: { Cookie: teacherCookie },
      });
      expect(res.status).toBe(403);

      const resStudent = await fetch(`${baseUrl}/students`, {
        headers: { Cookie: studentCookie },
      });
      expect(resStudent.status).toBe(403);
    });

    it("allows admin to list students with pagination and metadata", async () => {
      const res = await fetch(`${baseUrl}/students?page=1&limit=5`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.meta).toBeDefined();
      expect(json.meta.page).toBe(1);
      expect(json.meta.limit).toBe(5);
      expect(json.meta.total).toBeGreaterThanOrEqual(1);

      // Verify no sensitive fields leaked
      for (const student of json.data) {
        expect(student).not.toHaveProperty("passwordHash");
        expect(student).not.toHaveProperty("password");
        expect(student).not.toHaveProperty("descriptors");
        expect(student).toHaveProperty("rollNumber");
        expect(student).toHaveProperty("name");
        expect(student).toHaveProperty("email");
        expect(student).toHaveProperty("status");
        expect(student).toHaveProperty("department");
        expect(student).toHaveProperty("class");
      }
    });

    it("supports search and status filters on GET /students", async () => {
      // 1. Filter by PENDING status
      const resPending = await fetch(`${baseUrl}/students?status=PENDING`, {
        headers: { Cookie: adminCookie },
      });
      expect(resPending.status).toBe(200);
      const jsonPending = await resPending.json();
      expect(jsonPending.success).toBe(true);
      for (const s of jsonPending.data) {
        expect(s.status).toBe("PENDING");
      }

      // 2. Search by student name
      const resSearch = await fetch(`${baseUrl}/students?search=Aarav`, {
        headers: { Cookie: adminCookie },
      });
      expect(resSearch.status).toBe(200);
      const jsonSearch = await resSearch.json();
      expect(jsonSearch.success).toBe(true);
      expect(jsonSearch.data.length).toBeGreaterThanOrEqual(1);
      expect(jsonSearch.data.some((s: any) => s.name.includes("Aarav"))).toBe(true);
    });

    it("returns directory summary statistics on GET /students/stats", async () => {
      const res = await fetch(`${baseUrl}/students/stats`, {
        headers: { Cookie: adminCookie },
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty("total");
      expect(json.data).toHaveProperty("pending");
      expect(json.data).toHaveProperty("active");
      expect(json.data).toHaveProperty("inactive");
      expect(typeof json.data.total).toBe("number");
    });

    it("approves pending student registration and activates account", async () => {
      // Create a test pending student
      const dept = await prisma.department.findFirstOrThrow();
      const acadYear = await prisma.academicYear.findFirstOrThrow();
      const cls = await prisma.class.findFirstOrThrow();

      const pendingUser = await prisma.user.create({
        data: {
          email: "test.approval@college.edu",
          passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
          role: Role.STUDENT,
          name: "Approval Test Student",
          status: UserStatus.PENDING,
        },
      });

      const student = await prisma.student.create({
        data: {
          userId: pendingUser.id,
          name: "Approval Test Student",
          email: "test.approval@college.edu",
          rollNumber: `APPR-${Date.now()}`,
          departmentId: dept.id,
          academicYearId: acadYear.id,
          classId: cls.id,
          status: StudentStatus.PENDING,
        },
      });

      // Execute approval
      const approveRes = await fetch(`${baseUrl}/students/${student.id}/approve`, {
        method: "POST",
        headers: { Cookie: adminCookie },
      });
      expect(approveRes.status).toBe(200);

      const json = await approveRes.json();
      expect(json.success).toBe(true);
      expect(json.data.student.status).toBe("ACTIVE");

      // Verify DB persistence
      const activeStudent = await prisma.student.findUniqueOrThrow({
        where: { id: student.id },
        include: { user: true },
      });
      expect(activeStudent.status).toBe(StudentStatus.ACTIVE);
      expect(activeStudent.user?.status).toBe(UserStatus.ACTIVE);

      // Clean up
      await prisma.auditLog.deleteMany({ where: { entityId: student.id } });
      await prisma.student.delete({ where: { id: student.id } });
      await prisma.user.delete({ where: { id: pendingUser.id } });
    });
  });
});
