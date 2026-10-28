import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { createApp } from "../src/app.js";

describe("API Foundation & Health Endpoints", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("GET /api/v1/health should return 200 OK with status and service metadata", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("service", "smart-attendance-api");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("environment");
  });

  it("GET /api/v1/non-existent-route should return 404 with standard error envelope", async () => {
    const res = await fetch(`${baseUrl}/api/v1/non-existent-route`);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code", "NOT_FOUND");
    expect(body.error).toHaveProperty("message", "Route not found");
  });

  it("GET /api/v1/health/ready should return 200 OK with database and ledger verification", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health/ready`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("status", "ready");
    expect(body).toHaveProperty("database", "connected");
    expect(body).toHaveProperty("ledger", "verified");
  });

  it("GET /api/v1/health/ready returns 503 when quarantined student remains ACTIVE in database", async () => {
    const { prisma } = await import("../src/lib/prisma.js");
    const { appendBiometricLedgerEvent, getLedgerFilePath } = await import(
      "../src/modules/enrollment/biometric-ledger.js"
    );

    // 1. Pick or create a dedicated probe student with a valid user and face enrollment
    let user = await prisma.user.findUnique({ where: { email: "health.probe@test.local" } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "health.probe@test.local",
          passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
          role: "STUDENT",
          name: "Health Probe Student",
        },
      });
    }

    let student = await prisma.student.findFirst({
      where: { userId: user.id },
      include: { faceEnrollment: true },
    });

    if (!student) {
      const dept = await prisma.department.findFirst();
      const acadYear = await prisma.academicYear.findFirst();
      const testClass = await prisma.class.findFirst();
      student = await prisma.student.create({
        data: {
          userId: user.id,
          name: "Health Probe Student",
          email: "health.probe@test.local",
          rollNumber: "HP-001",
          departmentId: dept!.id,
          academicYearId: acadYear!.id,
          classId: testClass!.id,
        },
        include: { faceEnrollment: true },
      });
    }

    // Ensure enrollment is active
    await prisma.faceEnrollment.upsert({
      where: { studentId: student.id },
      update: { status: "ACTIVE" },
      create: {
        studentId: student.id,
        status: "ACTIVE",
        descriptors: "v1:test_quarantine_probe",
        modelVersion: "v1",
        provider: "human",
      },
    });

    // 2. Append deletion event for this student directly to ledger
    appendBiometricLedgerEvent({
      action: "BIOMETRIC_DELETED",
      studentId: student.id,
      actorUserId: user.id,
      reason: "Health ready unreconciled probe",
    });

    // 3. /ready must return 503 unready because deletion is pending reconciliation!
    const res = await fetch(`${baseUrl}/api/v1/health/ready`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("unready");
    expect(body.error).toMatch(/pending deletion\(s\) unreconciled/i);

    // 4. Mark student DELETED in DB (reconciled) -> /ready recovers to 200 OK!
    await prisma.faceEnrollment.update({
      where: { studentId: student.id },
      data: { status: "DELETED", descriptors: "" },
    });

    const resRecovered = await fetch(`${baseUrl}/api/v1/health/ready`);
    expect(resRecovered.status).toBe(200);

    // Cleanup faceEnrollment for probe student
    await prisma.faceEnrollment.deleteMany({ where: { studentId: student.id } });
  });
});
