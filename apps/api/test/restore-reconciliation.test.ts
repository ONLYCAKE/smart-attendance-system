import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { PrismaClient, StudentStatus, UserStatus, Role } from "@prisma/client";
import { reconcileBiometricDeletions } from "../src/scripts/reconcile-biometric-restore.js";
import { enrollmentService } from "../src/modules/enrollment/enrollment.service.js";
import {
  appendBiometricLedgerEvent,
  getLedgerFilePath,
} from "../src/modules/enrollment/biometric-ledger.js";

describe("T-046: Backup Restore Biometric Reconciliation & Rollback Boundary Verification", () => {
  let prisma: PrismaClient;
  let testStudentId: string;
  let testUserId: string;
  const testLedgerPath = path.resolve(process.cwd(), "./data/biometric-ledger/test-rollback-ledger.jsonl");

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Clean up any test ledger file
    if (fs.existsSync(testLedgerPath)) {
      fs.unlinkSync(testLedgerPath);
    }

    // 1. Setup Department & Academic Year
    const dept = await prisma.department.findFirst();
    const acadYear = await prisma.academicYear.findFirst();
    const testClass = await prisma.class.findFirst();

    // 2. Create test user and student
    const user = await prisma.user.upsert({
      where: { email: "restore.test@college.edu" },
      update: {},
      create: {
        email: "restore.test@college.edu",
        passwordHash: "$2a$10$abcdefghijklmnopqrstuvwxyz123456",
        role: Role.STUDENT,
        name: "Restore Test Student",
        status: UserStatus.ACTIVE,
      },
    });
    testUserId = user.id;

    const student = await prisma.student.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        name: "Restore Test Student",
        email: "restore.test@college.edu",
        rollNumber: "RESTORE-001",
        status: StudentStatus.ACTIVE,
        departmentId: dept!.id,
        academicYearId: acadYear!.id,
        classId: testClass!.id,
      },
    });
    testStudentId = student.id;

    // Grant active biometric consent
    await prisma.biometricConsent.upsert({
      where: { studentId: student.id },
      update: { status: "GRANTED", revokedAt: null },
      create: {
        studentId: student.id,
        status: "GRANTED",
        consentVersion: "1.0",
        consentedAt: new Date(),
      },
    });

    // Create active face enrollment
    await prisma.faceEnrollment.upsert({
      where: { studentId: student.id },
      update: {
        status: "ACTIVE",
        descriptors: "v1:mock_iv:mock_tag:mock_cipher_embedding",
        deletedAt: null,
        consentRevokedAt: null,
      },
      create: {
        studentId: student.id,
        status: "ACTIVE",
        descriptors: "v1:mock_iv:mock_tag:mock_cipher_embedding",
        modelVersion: "v1",
        provider: "human",
      },
    });
  });

  afterAll(async () => {
    // Cleanup test records
    await prisma.auditLog.deleteMany({
      where: {
        OR: [
          { entityId: testStudentId },
          { actorUserId: testUserId },
          { entityId: "PostRestoreBiometricSync" },
        ],
      },
    });
    await prisma.faceEnrollment.deleteMany({ where: { studentId: testStudentId } });
    await prisma.biometricConsent.deleteMany({ where: { studentId: testStudentId } });
    await prisma.student.deleteMany({ where: { id: testStudentId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });

    // Cleanup test ledger
    if (fs.existsSync(testLedgerPath)) {
      fs.unlinkSync(testLedgerPath);
    }
    await prisma.$disconnect();
  });

  it("proves deletions survive database rollback via out-of-band durable ledger", async () => {
    // 1. Mark simulated snapshot timestamp BEFORE the deletion
    const snapshotTimestamp = new Date(Date.now() - 5000);

    // 2. Student requests permanent biometric deletion
    // Write deletion event to both DB and the test ledger path
    await enrollmentService.deleteEnrollment(testUserId, testStudentId);
    appendBiometricLedgerEvent(
      {
        action: "BIOMETRIC_DELETED",
        studentId: testStudentId,
        actorUserId: testUserId,
        timestamp: new Date().toISOString(),
      },
      testLedgerPath
    );

    // Verify live DB has descriptors zeroed out
    const deletedEnrollment = await prisma.faceEnrollment.findUnique({
      where: { studentId: testStudentId },
    });
    expect(deletedEnrollment?.descriptors).toBe("");
    expect(deletedEnrollment?.status).toBe("DELETED");

    // 3. FAITHFUL DATABASE ROLLBACK SIMULATION:
    // Restoring an old snapshot resets PostgreSQL to snapshotTimestamp.
    // This rolls back:
    //   a) FaceEnrollment to ACTIVE with stale descriptors
    //   b) BiometricConsent to GRANTED
    //   c) CRITICALLY: It WIPES all post-snapshot AuditLog rows from the database!
    await prisma.faceEnrollment.update({
      where: { studentId: testStudentId },
      data: {
        status: "ACTIVE",
        descriptors: "v1:restored_stale_embedding_must_be_purged",
        deletedAt: null,
        consentRevokedAt: null,
      },
    });
    await prisma.biometricConsent.update({
      where: { studentId: testStudentId },
      data: {
        status: "GRANTED",
        revokedAt: null,
      },
    });
    // Wipe all post-snapshot audit events from the DB to simulate complete database rollback boundary loss
    await prisma.auditLog.deleteMany({
      where: {
        createdAt: { gte: new Date(snapshotTimestamp) },
      },
    });

    // Verify the database now has NO post-snapshot deletion records!
    const postRollbackDbAudit = await prisma.auditLog.findMany({
      where: {
        action: { in: ["BIOMETRIC_DELETED", "BIOMETRIC_ENROLLMENT_REVOKED", "FACE_ENROLLMENT_DELETED"] },
        createdAt: { gte: new Date(snapshotTimestamp) },
      },
    });
    expect(postRollbackDbAudit.length).toBe(0);

    // 4. Operator runs post-restore reconciliation script against the surviving durable ledger
    const reconcileResult = await reconcileBiometricDeletions(
      prisma,
      snapshotTimestamp,
      {
        actorUserId: testUserId,
        customLedgerPath: testLedgerPath,
      }
    );

    expect(reconcileResult.success).toBe(true);
    expect(reconcileResult.sourceCounts.durableLedger).toBe(1);
    expect(reconcileResult.sourceCounts.databaseAuditLog).toBe(0); // Proves DB had 0 records, ledger provided the recovery data!
    expect(reconcileResult.reconciledCount).toBe(1);
    expect(reconcileResult.studentIds).toContain(testStudentId);

    // 5. Verify restored descriptors are purged and consent is revoked
    const reconciledEnrollment = await prisma.faceEnrollment.findUnique({
      where: { studentId: testStudentId },
    });
    expect(reconciledEnrollment?.status).toBe("DELETED");
    expect(reconciledEnrollment?.descriptors).toBe(""); // Completely purged

    const reconciledConsent = await prisma.biometricConsent.findUnique({
      where: { studentId: testStudentId },
    });
    expect(reconciledConsent?.status).toBe("REVOKED");

    // 6. Verify recognition candidate query rejects restored deleted student
    const candidates = await enrollmentService.getActiveDecryptedDescriptors([testStudentId]);
    expect(candidates.length).toBe(0);

    // 7. Verify Idempotency: Running reconciliation a second time causes zero regressions
    const repeatResult = await reconcileBiometricDeletions(
      prisma,
      snapshotTimestamp,
      {
        actorUserId: testUserId,
        customLedgerPath: testLedgerPath,
      }
    );
    expect(repeatResult.success).toBe(true);
    const postRepeatEnrollment = await prisma.faceEnrollment.findUnique({
      where: { studentId: testStudentId },
    });
    expect(postRepeatEnrollment?.status).toBe("DELETED");
    expect(postRepeatEnrollment?.descriptors).toBe("");
  });

  it("fails closed when recovery ledger contains tampered or malformed entries", async () => {
    const corruptLedgerPath = path.resolve(process.cwd(), "./data/biometric-ledger/corrupt-ledger.jsonl");
    const dir = path.dirname(corruptLedgerPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Write a ledger entry with tampered hash
    const corruptEntry = {
      eventId: "tampered-event-1",
      sequence: 1,
      action: "BIOMETRIC_DELETED",
      studentId: "student-1",
      actorUserId: testUserId,
      timestamp: new Date().toISOString(),
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      hash: "tampered_fake_hash_1234567890abcdef",
    };
    fs.writeFileSync(corruptLedgerPath, JSON.stringify(corruptEntry) + "\n", "utf-8");

    // Reconciliation must fail closed and refuse to proceed with tampered recovery data
    await expect(
      reconcileBiometricDeletions(prisma, new Date(Date.now() - 10000), {
        actorUserId: testUserId,
        customLedgerPath: corruptLedgerPath,
      })
    ).rejects.toThrow(/integrity compromised|mismatch/i);

    if (fs.existsSync(corruptLedgerPath)) {
      fs.unlinkSync(corruptLedgerPath);
    }
  });

  it("fails closed when recovery ledger sequence is out of order or broken", async () => {
    const brokenSeqPath = path.resolve(process.cwd(), "./data/biometric-ledger/broken-seq-ledger.jsonl");
    const dir = path.dirname(brokenSeqPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Write entry with sequence 2 when sequence 1 is missing
    const brokenSeqEntry = {
      eventId: "seq-event-2",
      sequence: 2, // Out of order sequence
      action: "BIOMETRIC_DELETED",
      studentId: "student-2",
      actorUserId: testUserId,
      timestamp: new Date().toISOString(),
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      hash: "somehash",
    };
    fs.writeFileSync(brokenSeqPath, JSON.stringify(brokenSeqEntry) + "\n", "utf-8");

    await expect(
      reconcileBiometricDeletions(prisma, new Date(Date.now() - 10000), {
        actorUserId: testUserId,
        customLedgerPath: brokenSeqPath,
      })
    ).rejects.toThrow(/sequence broken/i);

    if (fs.existsSync(brokenSeqPath)) {
      fs.unlinkSync(brokenSeqPath);
    }
  });

  it("handles concurrent ledger appends safely without sequence collisions or broken hash chains", async () => {
    const concurrentLedgerPath = path.resolve(process.cwd(), "./data/biometric-ledger/concurrent-test-ledger.jsonl");
    if (fs.existsSync(concurrentLedgerPath)) fs.unlinkSync(concurrentLedgerPath);

    const { appendBiometricLedgerEvent, readBiometricLedgerEntries } = await import(
      "../src/modules/enrollment/biometric-ledger.js"
    );

    // Launch 5 concurrent appends in parallel
    const appendPromises = Array.from({ length: 5 }).map((_, i) =>
      new Promise<void>((resolve, reject) => {
        try {
          appendBiometricLedgerEvent(
            {
              action: "BIOMETRIC_DELETED",
              studentId: `concurrent-student-${i + 1}`,
              actorUserId: testUserId,
              reason: `Concurrent test ${i + 1}`,
            },
            concurrentLedgerPath
          );
          resolve();
        } catch (err) {
          reject(err);
        }
      })
    );

    await Promise.all(appendPromises);

    // Verify all 5 entries were written with strict monotonically increasing sequences 1..5
    const entries = readBiometricLedgerEntries(concurrentLedgerPath);
    expect(entries.length).toBe(5);
    for (let i = 0; i < 5; i++) {
      expect(entries[i]?.sequence).toBe(i + 1);
      if (i > 0) {
        expect(entries[i]?.prevHash).toBe(entries[i - 1]?.hash);
      }
    }

    if (fs.existsSync(concurrentLedgerPath)) fs.unlinkSync(concurrentLedgerPath);
    if (fs.existsSync(`${concurrentLedgerPath}.lock`)) fs.unlinkSync(`${concurrentLedgerPath}.lock`);
  });

  it("fails closed and aborts deletion when durable ledger storage is unavailable", async () => {
    // Attempting deletion with an invalid/unwritable ledger path must throw and NOT delete in DB
    const student = await prisma.student.findUnique({
      where: { id: testStudentId },
      include: { faceEnrollment: true },
    });
    expect(student).toBeDefined();

    // Re-enroll student with active descriptor
    await prisma.faceEnrollment.upsert({
      where: { studentId: testStudentId },
      create: {
        studentId: testStudentId,
        provider: "FACE_API_JS",
        modelVersion: "1.0",
        descriptors: "v1:dummy-encrypted-vector",
        status: "ACTIVE",
        consentVersion: "1.0",
        consentedAt: new Date(),
        enrolledAt: new Date(),
      },
      update: {
        descriptors: "v1:dummy-encrypted-vector",
        status: "ACTIVE",
      },
    });

    // Set process.env.BIOMETRIC_LEDGER_PATH to an unwritable / non-existent storage path
    const originalEnvPath = process.env.BIOMETRIC_LEDGER_PATH;
    process.env.BIOMETRIC_LEDGER_PATH = "Z:\\nonexistent_unwritable_volume\\ledger.jsonl";

    try {
      await expect(
        enrollmentService.deleteEnrollment(testUserId, testStudentId)
      ).rejects.toThrow(/durable audit ledger is unavailable/i);

      // Verify PostgreSQL database was NOT updated: descriptor must still be active!
      const unaffectedEnrollment = await prisma.faceEnrollment.findUnique({
        where: { studentId: testStudentId },
      });
      expect(unaffectedEnrollment?.status).toBe("ACTIVE");
      expect(unaffectedEnrollment?.descriptors).toBe("v1:dummy-encrypted-vector");
    } finally {
      process.env.BIOMETRIC_LEDGER_PATH = originalEnvPath;
    }
  });

  it("fails closed when recovery ledger contains a torn write or truncated JSON line", async () => {
    const tornLedgerPath = path.resolve(process.cwd(), "./data/biometric-ledger/torn-test-ledger.jsonl");
    const dir = path.dirname(tornLedgerPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // Write a truncated, incomplete JSON line (simulating mid-append process crash or power loss)
    fs.writeFileSync(tornLedgerPath, '{"eventId": "torn-event", "sequence": 1, "action": "BIOMETRIC_\n', "utf-8");

    await expect(
      reconcileBiometricDeletions(prisma, new Date(Date.now() - 10000), {
        actorUserId: testUserId,
        customLedgerPath: tornLedgerPath,
      })
    ).rejects.toThrow(/Invalid JSON payload|corrupted/i);

    if (fs.existsSync(tornLedgerPath)) fs.unlinkSync(tornLedgerPath);
  });

  it("simulates crashed lock holder and verifies safe stale-lock recovery without stealing live lock", async () => {
    const lockTestPath = path.resolve(process.cwd(), "./data/biometric-ledger/stale-lock-test.jsonl");
    const lockPath = `${lockTestPath}.lock`;
    const dir = path.dirname(lockTestPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const { acquireLedgerLock, releaseLedgerLock } = await import(
      "../src/modules/enrollment/biometric-ledger.js"
    );

    // 1. Simulate dead/crashed process holding lock (PID 99999999 does not exist)
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999999, createdAt: Date.now() - 500 }), "utf-8");

    // Acquire lock should detect dead PID (ESRCH), reclaim lock immediately without waiting 10s
    const lockHandle = acquireLedgerLock(lockPath, 2000);
    expect(lockHandle.fd).toBeGreaterThanOrEqual(0);
    releaseLedgerLock(lockHandle);
    expect(fs.existsSync(lockPath)).toBe(false);

    // 2. Simulate live process holding lock (current process.pid is alive)
    const liveFd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR);
    fs.writeFileSync(liveFd, JSON.stringify({ pid: process.pid, createdAt: Date.now() }), "utf-8");

    // Attempting to acquire lock while held by live process MUST NOT steal it and should timeout
    expect(() => acquireLedgerLock(lockPath, 150)).toThrow(/Failed to acquire biometric ledger lock after 150ms/i);

    fs.closeSync(liveFd);
    if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
    if (fs.existsSync(lockTestPath)) fs.unlinkSync(lockTestPath);
  });

  it("serializes concurrent writers across independent OS child processes without sequence collisions", async () => {
    const multiprocLedgerPath = path.resolve(process.cwd(), "./data/biometric-ledger/multiproc-test-ledger.jsonl");
    if (fs.existsSync(multiprocLedgerPath)) fs.unlinkSync(multiprocLedgerPath);
    if (fs.existsSync(`${multiprocLedgerPath}.lock`)) fs.unlinkSync(`${multiprocLedgerPath}.lock`);

    const { readBiometricLedgerEntries } = await import(
      "../src/modules/enrollment/biometric-ledger.js"
    );

    const tsxCli = path.resolve(process.cwd(), "./node_modules/tsx/dist/cli.mjs");
    const script = `
      import { appendBiometricLedgerEvent } from "./src/modules/enrollment/biometric-ledger.ts";
      const targetLedger = process.argv[1];
      const workerId = process.argv[2];
      for (let i = 1; i <= 3; i++) {
        appendBiometricLedgerEvent({
          action: "BIOMETRIC_DELETED",
          studentId: "worker-" + workerId + "-student-" + i,
          actorUserId: "worker-" + workerId,
          reason: "Multi-process concurrency test",
        }, targetLedger);
      }
    `;

    // Spawn 3 independent OS child processes running concurrently
    const runWorker = (workerId: number) =>
      new Promise<void>((resolve, reject) => {
        let stderr = "";
        const child = spawn(
          process.execPath,
          [tsxCli, "-e", script, multiprocLedgerPath, workerId.toString()],
          {
            cwd: process.cwd(),
            env: { ...process.env, BIOMETRIC_LEDGER_PATH: multiprocLedgerPath },
          }
        );
        child.stderr?.on("data", (d) => { stderr += d.toString(); });
        child.on("error", reject);
        child.on("exit", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Worker ${workerId} failed with exit code ${code}: ${stderr}`));
        });
      });

    await Promise.all([runWorker(1), runWorker(2), runWorker(3)]);

    // Verify all 9 entries from 3 processes were recorded with strict monotonic sequence and valid hash chaining
    const entries = readBiometricLedgerEntries(multiprocLedgerPath);
    expect(entries.length).toBe(9);
    for (let i = 0; i < 9; i++) {
      expect(entries[i]?.sequence).toBe(i + 1);
      if (i > 0) {
        expect(entries[i]?.prevHash).toBe(entries[i - 1]?.hash);
      }
    }

    if (fs.existsSync(multiprocLedgerPath)) fs.unlinkSync(multiprocLedgerPath);
    if (fs.existsSync(`${multiprocLedgerPath}.lock`)) fs.unlinkSync(`${multiprocLedgerPath}.lock`);
  });

  it("verifies dual-write consistency, retry idempotency, and pending reconciliation safety", async () => {
    // 1. Ensure student is actively enrolled
    await prisma.biometricConsent.upsert({
      where: { studentId: testStudentId },
      update: { status: "GRANTED", revokedAt: null },
      create: {
        studentId: testStudentId,
        status: "GRANTED",
        consentVersion: "1.0",
        consentedAt: new Date(),
      },
    });
    await prisma.faceEnrollment.upsert({
      where: { studentId: testStudentId },
      update: {
        status: "ACTIVE",
        descriptors: "v1:dual_write_test_embedding",
        deletedAt: null,
      },
      create: {
        studentId: testStudentId,
        status: "ACTIVE",
        descriptors: "v1:dual_write_test_embedding",
        modelVersion: "v1",
        provider: "human",
      },
    });

    const dualWriteLedgerPath = path.resolve(process.cwd(), "./data/biometric-ledger/dual-write-test-ledger.jsonl");
    if (fs.existsSync(dualWriteLedgerPath)) fs.unlinkSync(dualWriteLedgerPath);

    // 2. Simulate partial dual-write: ledger append succeeds, but DB transaction rolls back / fails
    appendBiometricLedgerEvent(
      {
        action: "BIOMETRIC_DELETED",
        studentId: testStudentId,
        actorUserId: testUserId,
        reason: "Simulated partial write before DB transaction failure",
      },
      dualWriteLedgerPath
    );

    // At this point: DB still holds active descriptors, but ledger recorded the deletion
    const activeInDb = await prisma.faceEnrollment.findUnique({ where: { studentId: testStudentId } });
    expect(activeInDb?.status).toBe("ACTIVE");
    expect(activeInDb?.descriptors).toBe("v1:dual_write_test_embedding");

    // 3. Before client retries or traffic resumes: reconciliation runs and purges descriptors
    const reconcileResult = await reconcileBiometricDeletions(
      prisma,
      new Date(Date.now() - 60000),
      {
        actorUserId: testUserId,
        customLedgerPath: dualWriteLedgerPath,
      }
    );
    expect(reconcileResult.success).toBe(true);
    expect(reconcileResult.studentIds).toContain(testStudentId);
    expect(reconcileResult.reconciledCount).toBeGreaterThanOrEqual(1);

    // Verify DB descriptors were purged
    const purgedInDb = await prisma.faceEnrollment.findUnique({ where: { studentId: testStudentId } });
    expect(purgedInDb?.status).toBe("DELETED");
    expect(purgedInDb?.descriptors).toBe("");

    // 4. Client retries deletion: returns idempotent success without writing contradictory records
    const retryResult = await enrollmentService.deleteEnrollment(testUserId, testStudentId);
    expect(retryResult.status).toBe("DELETED");

    if (fs.existsSync(dualWriteLedgerPath)) fs.unlinkSync(dualWriteLedgerPath);
  });

  it("verifies dedicated BIOMETRIC_LEDGER_KEY rotation and seamless backward-compatible verification", async () => {
    const rotationLedgerPath = path.resolve(process.cwd(), "./data/biometric-ledger/rotation-test-ledger.jsonl");
    if (fs.existsSync(rotationLedgerPath)) fs.unlinkSync(rotationLedgerPath);

    const { readBiometricLedgerEntries } = await import(
      "../src/modules/enrollment/biometric-ledger.js"
    );

    // Entry 1: Appended with default secret (SESSION_SECRET)
    appendBiometricLedgerEvent(
      {
        action: "BIOMETRIC_DELETED",
        studentId: "student-rotation-1",
        actorUserId: testUserId,
        reason: "Pre-rotation entry",
      },
      rotationLedgerPath
    );

    // Rotate to dedicated BIOMETRIC_LEDGER_KEY
    const originalLedgerKey = process.env.BIOMETRIC_LEDGER_KEY;
    process.env.BIOMETRIC_LEDGER_KEY = "dedicated_biometric_ledger_secret_key_32chars_long";

    try {
      // Entry 2: Appended with new dedicated key
      appendBiometricLedgerEvent(
        {
          action: "BIOMETRIC_DELETED",
          studentId: "student-rotation-2",
          actorUserId: testUserId,
          reason: "Post-rotation entry",
        },
        rotationLedgerPath
      );

      // Verify both entries validate cleanly across the key rotation boundary
      const entries = readBiometricLedgerEntries(rotationLedgerPath);
      expect(entries.length).toBe(2);
      expect(entries[0]?.studentId).toBe("student-rotation-1");
      expect(entries[1]?.studentId).toBe("student-rotation-2");
      expect(entries[1]?.prevHash).toBe(entries[0]?.hash);
    } finally {
      if (originalLedgerKey !== undefined) {
        process.env.BIOMETRIC_LEDGER_KEY = originalLedgerKey;
      } else {
        delete process.env.BIOMETRIC_LEDGER_KEY;
      }
      if (fs.existsSync(rotationLedgerPath)) fs.unlinkSync(rotationLedgerPath);
    }
  });

  it("fails closed when expected durable ledger is missing for an active biometric installation", async () => {
    // 1. Ensure active biometric enrollment exists in DB
    await prisma.faceEnrollment.upsert({
      where: { studentId: testStudentId },
      update: { status: "ACTIVE" },
      create: {
        studentId: testStudentId,
        status: "ACTIVE",
        descriptors: "v1:dummy",
        modelVersion: "v1",
        provider: "human",
      },
    });

    const nonExistentPath = path.resolve(process.cwd(), "./data/biometric-ledger/non-existent-ledger.jsonl");
    if (fs.existsSync(nonExistentPath)) fs.unlinkSync(nonExistentPath);

    // Reconcile without allowMissing must fail closed
    await expect(
      reconcileBiometricDeletions(prisma, new Date(Date.now() - 60000), {
        actorUserId: testUserId,
        customLedgerPath: nonExistentPath,
      })
    ).rejects.toThrow(/missing for an active biometric installation/i);

    // Reconcile with explicit allowMissing proceeds (e.g. fresh installation)
    const freshTime = new Date();
    const emptyResult = await reconcileBiometricDeletions(prisma, freshTime, {
      actorUserId: testUserId,
      customLedgerPath: nonExistentPath,
      allowMissing: true,
    });
    expect(emptyResult.reconciledCount).toBe(0);
  });

  it("fails closed when ledger identity checkpoint does not match database expectation (replaced ledger)", async () => {
    const replacedTestPath = path.resolve(process.cwd(), "./data/biometric-ledger/replaced-test-ledger.jsonl");
    const identityPath = `${replacedTestPath}.identity`;
    if (fs.existsSync(replacedTestPath)) fs.unlinkSync(replacedTestPath);
    if (fs.existsSync(identityPath)) fs.unlinkSync(identityPath);

    const { ensureLedgerIdentity } = await import("../src/modules/enrollment/biometric-ledger.js");

    // Create ledger identity A
    const originalIdentity = ensureLedgerIdentity(replacedTestPath);

    const settingKey = `BIOMETRIC_LEDGER_IDENTITY:${path.basename(replacedTestPath)}`;

    // Record expected identity in database SystemSetting
    await prisma.systemSetting.upsert({
      where: { key: settingKey },
      create: {
        key: settingKey,
        value: "expected-ledger-uuid-12345",
      },
      update: {
        value: "expected-ledger-uuid-12345",
      },
    });

    // Write empty entry so file exists
    fs.writeFileSync(replacedTestPath, "", "utf-8");

    // Restore reconciliation must reject identity mismatch
    await expect(
      reconcileBiometricDeletions(prisma, new Date(Date.now() - 60000), {
        actorUserId: testUserId,
        customLedgerPath: replacedTestPath,
      })
    ).rejects.toThrow(/Ledger identity mismatch/i);

    // Clean up
    await prisma.systemSetting.deleteMany({ where: { key: settingKey } });
    if (fs.existsSync(replacedTestPath)) fs.unlinkSync(replacedTestPath);
    if (fs.existsSync(identityPath)) fs.unlinkSync(identityPath);
  });

  it("prevents signature downgrade from authenticated HMAC to unkeyed SHA-256", async () => {
    const downgradeTestPath = path.resolve(process.cwd(), "./data/biometric-ledger/downgrade-test-ledger.jsonl");
    if (fs.existsSync(downgradeTestPath)) fs.unlinkSync(downgradeTestPath);

    const { readBiometricLedgerEntries } = await import("../src/modules/enrollment/biometric-ledger.js");

    const crypto = await import("crypto");
    const unkeyedSha256 = crypto
      .createHash("sha256")
      .update("1:BIOMETRIC_DELETED:student-downgrade:user-1:2026-01-01T00:00:00.000Z:0000000000000000000000000000000000000000000000000000000000000000")
      .digest("hex");

    // Write entry that specifies algorithm: "hmac-sha256" but has an unkeyed SHA-256 hash (simulating downgrade attack)
    const tamperedEntry = {
      eventId: "tampered-event",
      sequence: 1,
      action: "BIOMETRIC_DELETED",
      studentId: "student-downgrade",
      actorUserId: "user-1",
      timestamp: "2026-01-01T00:00:00.000Z",
      prevHash: "0000000000000000000000000000000000000000000000000000000000000000",
      algorithm: "hmac-sha256",
      keyId: "k1",
      hash: unkeyedSha256, // Attacker calculated unkeyed hash hoping for silent fallback
    };
    fs.writeFileSync(downgradeTestPath, JSON.stringify(tamperedEntry) + "\n", "utf-8");

    // readBiometricLedgerEntries MUST NOT fall back to unkeyed SHA-256 for an entry tagged as hmac-sha256
    expect(() => readBiometricLedgerEntries(downgradeTestPath)).toThrow(/HMAC signature verification failed/i);

    if (fs.existsSync(downgradeTestPath)) fs.unlinkSync(downgradeTestPath);
  });

  it("quarantines pending durable deletions so recognition matching cannot use them even if database transaction failed", async () => {
    // 1. Ensure student is actively enrolled with biometric vector in database
    await prisma.faceEnrollment.upsert({
      where: { studentId: testStudentId },
      update: {
        status: "ACTIVE",
        descriptors: "v1:quarantine_probe_vector",
        deletedAt: null,
        consentRevokedAt: null,
      },
      create: {
        studentId: testStudentId,
        status: "ACTIVE",
        descriptors: "v1:quarantine_probe_vector",
        modelVersion: "v1",
        provider: "human",
      },
    });

    const quarantineLedgerPath = path.resolve(process.cwd(), "./data/biometric-ledger/quarantine-test-ledger.jsonl");
    if (fs.existsSync(quarantineLedgerPath)) fs.unlinkSync(quarantineLedgerPath);

    // 2. Append deletion to ledger (simulating partial dual-write where DB failed to commit)
    const originalLedgerEnv = process.env.BIOMETRIC_LEDGER_PATH;
    process.env.BIOMETRIC_LEDGER_PATH = quarantineLedgerPath;

    try {
      appendBiometricLedgerEvent(
        {
          action: "BIOMETRIC_DELETED",
          studentId: testStudentId,
          actorUserId: testUserId,
          reason: "Quarantine recognition safety test",
        },
        quarantineLedgerPath
      );

      // Verify DB still holds ACTIVE status
      const dbRecord = await prisma.faceEnrollment.findUnique({ where: { studentId: testStudentId } });
      expect(dbRecord?.status).toBe("ACTIVE");

      // 3. Query getActiveDecryptedDescriptors: MUST immediately quarantine the student!
      const candidates = await enrollmentService.getActiveDecryptedDescriptors([testStudentId]);
      expect(candidates.find((c) => c.studentId === testStudentId)).toBeUndefined();
      expect(candidates.length).toBe(0);
    } finally {
      process.env.BIOMETRIC_LEDGER_PATH = originalLedgerEnv;
      if (fs.existsSync(quarantineLedgerPath)) fs.unlinkSync(quarantineLedgerPath);
      if (fs.existsSync(`${quarantineLedgerPath}.lock`)) fs.unlinkSync(`${quarantineLedgerPath}.lock`);
    }
  });

  it("recovers expired cross-host lease lock without stealing active lease from remote host", async () => {
    const crossHostLockPath = path.resolve(process.cwd(), "./data/biometric-ledger/cross-host-test.lock");
    if (fs.existsSync(crossHostLockPath)) fs.unlinkSync(crossHostLockPath);

    const { acquireLedgerLock, releaseLedgerLock } = await import("../src/modules/enrollment/biometric-ledger.js");

    // 1. Simulate remote host holding lock with EXPIRED lease (leaseExpiresAt in past)
    const expiredPayload = JSON.stringify({
      pid: 1001,
      hostId: "remote-node-east-1",
      createdAt: Date.now() - 10000,
      leaseExpiresAt: Date.now() - 1000, // Expired lease
    });
    fs.writeFileSync(crossHostLockPath, expiredPayload, "utf-8");

    // Local acquire should recognize expired lease across hosts and safely reclaim
    const lockHandle = acquireLedgerLock(crossHostLockPath, 2000);
    expect(lockHandle.fd).toBeGreaterThanOrEqual(0);
    releaseLedgerLock(lockHandle);

    // 2. Simulate remote host holding lock with ACTIVE live lease (leaseExpiresAt in future)
    const activePayload = JSON.stringify({
      pid: 1002,
      hostId: "remote-node-west-2",
      createdAt: Date.now(),
      leaseExpiresAt: Date.now() + 5000, // Active lease
    });
    fs.writeFileSync(crossHostLockPath, activePayload, "utf-8");

    // Attempting to acquire must NOT steal active remote lease and should timeout
    expect(() => acquireLedgerLock(crossHostLockPath, 150)).toThrow(/Failed to acquire biometric ledger lock after 150ms/i);

    if (fs.existsSync(crossHostLockPath)) fs.unlinkSync(crossHostLockPath);
  });

  it("T-050: excludes pending-deletion biometric descriptor in an independent OS child process before decryption", async () => {
    // 1. Setup active face enrollment in PostgreSQL
    await prisma.faceEnrollment.upsert({
      where: { studentId: testStudentId },
      update: {
        status: "ACTIVE",
        descriptors: "v1:quarantine_cross_process_vector",
        deletedAt: null,
        consentRevokedAt: null,
      },
      create: {
        studentId: testStudentId,
        status: "ACTIVE",
        descriptors: "v1:quarantine_cross_process_vector",
        modelVersion: "v1",
        provider: "human",
      },
    });

    const multiProcLedger = path.resolve(process.cwd(), "./data/biometric-ledger/cross-proc-quarantine-ledger.jsonl");
    if (fs.existsSync(multiProcLedger)) fs.unlinkSync(multiProcLedger);

    // 2. Process A: Appends deletion to durable ledger file without modifying PostgreSQL (simulating DB crash/failure)
    appendBiometricLedgerEvent(
      {
        action: "BIOMETRIC_DELETED",
        studentId: testStudentId,
        actorUserId: testUserId,
        reason: "Cross-process quarantine test",
      },
      multiProcLedger
    );

    // DB still retains ACTIVE status!
    const dbRecord = await prisma.faceEnrollment.findUnique({ where: { studentId: testStudentId } });
    expect(dbRecord?.status).toBe("ACTIVE");

    // 3. Process B: Spawn a completely separate OS child process that runs getActiveDecryptedDescriptors
    const tsxCli = path.resolve(process.cwd(), "./node_modules/tsx/dist/cli.mjs");
    const childScript = `
      import { enrollmentService } from './src/modules/enrollment/enrollment.service.ts';
      (async () => {
        const targetId = process.argv[1];
        const candidates = await enrollmentService.getActiveDecryptedDescriptors([targetId]);
        console.log(JSON.stringify({ count: candidates.length, found: candidates.some(c => c.studentId === targetId) }));
        process.exit(0);
      })().catch(err => {
        console.error(err);
        process.exit(1);
      });
    `;

    const result = await new Promise<{ count: number; found: boolean }>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const child = spawn(
        process.execPath,
        [tsxCli, "-e", childScript, testStudentId],
        {
          env: {
            ...process.env,
            BIOMETRIC_LEDGER_PATH: multiProcLedger,
            BIOMETRIC_LEDGER_KEY: process.env.BIOMETRIC_LEDGER_KEY || "super-secure-biometric-ledger-hmac-key-2026",
          },
          cwd: process.cwd(),
        }
      );

      child.stdout?.on("data", (d) => (stdout += d.toString()));
      child.stderr?.on("data", (d) => (stderr += d.toString()));
      child.on("error", reject);

      child.on("close", (code) => {
        if (code !== 0) {
          return reject(new Error(`Child process failed with code ${code}: ${stderr}`));
        }
        try {
          const lines = stdout.trim().split("\n");
          const jsonLine = lines[lines.length - 1];
          resolve(JSON.parse(jsonLine!));
        } catch (e: any) {
          reject(new Error(`Failed to parse child output: ${stdout}\nStderr: ${stderr}`));
        }
      });
    });

    // Verification: Child Process B reading independent durable ledger excludes student before decryption!
    expect(result.found).toBe(false);
    expect(result.count).toBe(0);

    if (fs.existsSync(multiProcLedger)) fs.unlinkSync(multiProcLedger);
    if (fs.existsSync(`${multiProcLedger}.lock`)) fs.unlinkSync(`${multiProcLedger}.lock`);
  });

  it("T-050: fences expired lock and aborts append if writer pauses beyond lease TTL", async () => {
    const pauseTestLedger = path.resolve(process.cwd(), "./data/biometric-ledger/pause-fence-test.jsonl");
    const pauseLockPath = `${pauseTestLedger}.lock`;
    if (fs.existsSync(pauseTestLedger)) fs.unlinkSync(pauseTestLedger);
    if (fs.existsSync(pauseLockPath)) fs.unlinkSync(pauseLockPath);

    const { acquireLedgerLock, validateLockLease, releaseLedgerLock } = await import(
      "../src/modules/enrollment/biometric-ledger.js"
    );

    // 1. Process A acquires lock
    const lockHandleA = acquireLedgerLock(pauseLockPath, 2000);
    expect(lockHandleA.token).toBeDefined();

    // 2. Simulate Process A suffering an execution freeze / GC pause that extends beyond leaseExpiresAt
    // Update the on-disk lock file to reflect that the lease has expired in physical time
    lockHandleA.leaseExpiresAt = Date.now() - 100;
    fs.writeFileSync(
      pauseLockPath,
      JSON.stringify({
        pid: process.pid,
        hostId: "localhost",
        createdAt: lockHandleA.createdAt,
        leaseExpiresAt: Date.now() - 100, // Expired on disk
        token: lockHandleA.token,
      }),
      "utf-8"
    );

    // Process A's pre-write fencing validation must detect expired lease and reject
    expect(() => validateLockLease(lockHandleA)).toThrow(/FENCING_LEASE_EXPIRED/i);

    // 3. Process B arrives and safely reclaims the expired lock because leaseExpiresAt is in past
    const lockHandleB = acquireLedgerLock(pauseLockPath, 2000);
    expect(lockHandleB.token).toBeDefined();
    expect(lockHandleB.token).not.toBe(lockHandleA.token);

    // 4. Now if Process A unfreezes and attempts pre-write validation, fencing token mismatch rejects it!
    expect(() => validateLockLease(lockHandleA)).toThrow(/FENCING_LEASE_EXPIRED|FENCING_TOKEN_MISMATCH/i);

    // Clean up
    releaseLedgerLock(lockHandleB);
    if (fs.existsSync(pauseTestLedger)) fs.unlinkSync(pauseTestLedger);
    if (fs.existsSync(pauseLockPath)) fs.unlinkSync(pauseLockPath);
  });

  it("T-050: fails closed when database contains deletion audit events newer than the durable ledger", async () => {
    const truncatedLedger = path.resolve(process.cwd(), "./data/biometric-ledger/truncated-freshness-test.jsonl");
    if (fs.existsSync(truncatedLedger)) fs.unlinkSync(truncatedLedger);

    // 1. Append a historical ledger event from 1 hour ago
    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    appendBiometricLedgerEvent(
      {
        action: "BIOMETRIC_DELETED",
        studentId: testStudentId,
        actorUserId: testUserId,
        timestamp: oneHourAgo,
      },
      truncatedLedger
    );

    // 2. Create a recent AuditLog deletion event in PostgreSQL (e.g. 5 minutes ago)
    await prisma.auditLog.create({
      data: {
        actorUserId: testUserId,
        action: "BIOMETRIC_DELETED",
        entityType: "FaceEnrollment",
        entityId: testStudentId,
        createdAt: new Date(Date.now() - 300 * 1000), // Newer than ledger
      },
    });

    // 3. Attempt reconciliation: must detect that ledger is older than database snapshot and fail closed!
    await expect(
      reconcileBiometricDeletions(prisma, new Date(Date.now() - 7200 * 1000), {
        customLedgerPath: truncatedLedger,
      })
    ).rejects.toThrow(/older than database snapshot/i);

    if (fs.existsSync(truncatedLedger)) fs.unlinkSync(truncatedLedger);
    if (fs.existsSync(`${truncatedLedger}.lock`)) fs.unlinkSync(`${truncatedLedger}.lock`);
  });
});
