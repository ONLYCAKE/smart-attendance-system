import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

describe("T-045: PostgreSQL Driver Timeouts & Contention Verification", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("inspects active PostgreSQL timeout settings and tests connection URL parameters", async () => {
    const statementTimeoutResult: Array<{ statement_timeout: string }> =
      await prisma.$queryRaw`SHOW statement_timeout`;
    const lockTimeoutResult: Array<{ lock_timeout: string }> =
      await prisma.$queryRaw`SHOW lock_timeout`;
    const idleTimeoutResult: Array<{ idle_in_transaction_session_timeout: string }> =
      await prisma.$queryRaw`SHOW idle_in_transaction_session_timeout`;

    expect(statementTimeoutResult[0]).toBeDefined();
    expect(lockTimeoutResult[0]).toBeDefined();
    expect(idleTimeoutResult[0]).toBeDefined();

    console.log("PostgreSQL Live Engine Settings:", {
      statement_timeout: statementTimeoutResult[0]?.statement_timeout,
      lock_timeout: lockTimeoutResult[0]?.lock_timeout,
      idle_in_transaction_session_timeout: idleTimeoutResult[0]?.idle_in_transaction_session_timeout,
    });

    // Test whether Prisma Rust engine accepts PostgreSQL connection parameters
    // Production configuration: options=-c statement_timeout=10000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=10000
    const rawUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/smart_attendance";
    const separator = rawUrl.includes("?") ? "&" : "?";
    const customUrl = `${rawUrl}${separator}options=-c%20statement_timeout=10000%20-c%20lock_timeout=5000%20-c%20idle_in_transaction_session_timeout=10000&connection_limit=25`;

    const customPrisma = new PrismaClient({
      datasources: { db: { url: customUrl } },
    });

    try {
      const customStatementRes: Array<{ statement_timeout: string }> =
        await customPrisma.$queryRaw`SHOW statement_timeout`;
      const customLockRes: Array<{ lock_timeout: string }> =
        await customPrisma.$queryRaw`SHOW lock_timeout`;
      const customIdleRes: Array<{ idle_in_transaction_session_timeout: string }> =
        await customPrisma.$queryRaw`SHOW idle_in_transaction_session_timeout`;

      console.log("PostgreSQL With custom production options URL:", {
        statement_timeout: customStatementRes[0]?.statement_timeout,
        lock_timeout: customLockRes[0]?.lock_timeout,
        idle_in_transaction_session_timeout: customIdleRes[0]?.idle_in_transaction_session_timeout,
      });

      // Verify all 3 settings are honored by PostgreSQL through the Prisma engine
      const statementHonored =
        customStatementRes[0]?.statement_timeout === "10000ms" ||
        customStatementRes[0]?.statement_timeout === "10000" ||
        customStatementRes[0]?.statement_timeout === "10s";
      const lockHonored =
        customLockRes[0]?.lock_timeout === "5000ms" ||
        customLockRes[0]?.lock_timeout === "5000" ||
        customLockRes[0]?.lock_timeout === "5s";
      const idleHonored =
        customIdleRes[0]?.idle_in_transaction_session_timeout === "10000ms" ||
        customIdleRes[0]?.idle_in_transaction_session_timeout === "10000" ||
        customIdleRes[0]?.idle_in_transaction_session_timeout === "10s";

      expect(statementHonored).toBe(true);
      expect(lockHonored).toBe(true);
      expect(idleHonored).toBe(true);

      // Verify connection pool recovery: run a successful query after timeout
      const recoveryQuery: Array<{ ok: number }> = await customPrisma.$queryRaw`SELECT 1 as ok`;
      expect(recoveryQuery[0]?.ok).toBe(1);
    } finally {
      await customPrisma.$disconnect();
    }
  });

  it("verifies statement_timeout terminates queries exceeding threshold", async () => {
    // Within an interactive transaction, set statement_timeout to 500ms and run pg_sleep(1)
    await expect(
      prisma.$transaction(
        async (tx) => {
          await tx.$executeRaw`SET LOCAL statement_timeout = 500`;
          await tx.$queryRaw`SELECT pg_sleep(1)`;
        },
        { timeout: 5000 }
      )
    ).rejects.toThrow();
  });

  it("verifies lock_timeout terminates lock acquisition exceeding threshold", async () => {
    // Session 1: Begin transaction and hold exclusive lock on AttendanceSession table or row
    // Session 2: Attempt to lock the same row with lock_timeout = 300ms
    const session = await prisma.attendanceSession.findFirst();
    if (!session) {
      console.warn("No attendance session found for lock test, skipping");
      return;
    }

    const prisma2 = new PrismaClient();
    try {
      let session1Acquired: () => void;
      const session1AcquiredPromise = new Promise<void>((resolve) => {
        session1Acquired = resolve;
      });

      let releaseSession1: () => void;
      const session1ReleasePromise = new Promise<void>((resolve) => {
        releaseSession1 = resolve;
      });

      // Thread 1: Acquire EXCLUSIVE lock on the session row
      const thread1 = prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "AttendanceSession" WHERE id = ${session.id} FOR UPDATE`;
          session1Acquired();
          // Hold the lock until thread 2 attempts and times out
          await session1ReleasePromise;
        },
        { timeout: 10000 }
      );

      // Wait until Thread 1 has acquired the row lock
      await session1AcquiredPromise;

      // Thread 2: Set lock_timeout to 400ms and attempt to acquire lock on the same row
      await expect(
        prisma2.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET LOCAL lock_timeout = 400`;
            await tx.$queryRaw`SELECT id FROM "AttendanceSession" WHERE id = ${session.id} FOR UPDATE`;
          },
          { maxWait: 2000, timeout: 3000 }
        )
      ).rejects.toThrow();

      // Release Thread 1
      releaseSession1!();
      await thread1;
    } finally {
      await prisma2.$disconnect();
    }
  });

  it("verifies Prisma interactive transaction timeout parameter enforces cleanup", async () => {
    // Test that Prisma's client-level transaction timeout triggers rollback
    await expect(
      prisma.$transaction(
        async (tx) => {
          // Sleep for 1.2s while timeout is set to 500ms
          await tx.$queryRaw`SELECT pg_sleep(1.2)`;
        },
        { maxWait: 1000, timeout: 500 }
      )
    ).rejects.toThrow();
  });
});
