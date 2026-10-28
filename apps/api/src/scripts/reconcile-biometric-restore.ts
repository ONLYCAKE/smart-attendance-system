import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import {
  readBiometricLedgerEntries,
  getLedgerFilePath,
  ensureLedgerIdentity,
  readLedgerIdentity,
} from "../modules/enrollment/biometric-ledger.js";

export interface ReconcileOptions {
  customLedgerPath?: string;
  actorUserId?: string;
  allowMissing?: boolean;
  allowReplaced?: boolean;
}

export interface ReconcileResult {
  success: boolean;
  snapshotTimestamp: Date;
  reconciledCount: number;
  studentIds: string[];
  auditLogId?: string;
  sourceCounts: {
    durableLedger: number;
    databaseAuditLog: number;
  };
}

/**
 * Reconciles biometric deletions following a database restore from backup/snapshot.
 *
 * ARCHITECTURAL SAFETY GUARANTEE:
 * If a PostgreSQL database is rolled back to a snapshot, the database's internal AuditLog
 * table no longer contains deletion events that occurred after that snapshot.
 * To prevent resurrected biometric descriptors from becoming active again in violation
 * of GDPR Article 17 and DPDP Act 2023 ("Right to be Forgotten"), this procedure reads
 * from an independently durable, append-only out-of-band ledger that survives database rollback.
 *
 * FAIL-CLOSED SAFETY:
 * 1. Missing Ledger: If the database contains active biometric data or deletion history,
 *    a missing ledger aborts reconciliation and blocks traffic.
 * 2. Replaced Ledger: Ledger identity UUID is checked against the database checkpoint.
 * 3. Empty Ledger: An empty ledger file when historical deletions exist aborts reconciliation.
 * 4. Cryptographic Chaining: Fails closed on any signature or sequence corruption.
 *
 * @param prisma PrismaClient instance
 * @param snapshotTimestamp The timestamp when the database snapshot/backup was captured
 * @param options Custom ledger path or actor user ID
 */
export async function reconcileBiometricDeletions(
  prisma: PrismaClient,
  snapshotTimestamp: Date | string,
  options?: ReconcileOptions
): Promise<ReconcileResult> {
  const snapshotDate = typeof snapshotTimestamp === "string" ? new Date(snapshotTimestamp) : snapshotTimestamp;
  if (isNaN(snapshotDate.getTime())) {
    throw new Error(`Invalid snapshotTimestamp provided: ${snapshotTimestamp}`);
  }

  const actorUserId = options?.actorUserId || "system-restore-operator";

  // Ensure actorUserId satisfies AuditLog foreign key constraint
  let effectiveActorId = actorUserId;
  const existingUser = await prisma.user.findUnique({ where: { id: actorUserId } });
  if (!existingUser) {
    const adminUser = await prisma.user.findFirst({ where: { role: "ADMIN" } });
    if (adminUser) {
      effectiveActorId = adminUser.id;
    } else {
      const anyUser = await prisma.user.findFirst();
      if (anyUser) effectiveActorId = anyUser.id;
    }
  }

  // 1. Missing Ledger Verification & Fail-Closed Detection
  const filePath = getLedgerFilePath(options?.customLedgerPath);
  const ledgerExists = fs.existsSync(filePath);

  if (!ledgerExists) {
    // Check if the restored database contains active biometric enrollments or historical deletions
    const [enrollmentCount, consentCount, historicalDeletionCount, ledgerIdentitySetting] =
      await Promise.all([
        prisma.faceEnrollment.count(),
        prisma.biometricConsent.count(),
        prisma.auditLog.count({
          where: {
            action: { in: ["BIOMETRIC_DELETED", "BIOMETRIC_ENROLLMENT_REVOKED", "FACE_ENROLLMENT_DELETED"] },
          },
        }),
        prisma.systemSetting.findUnique({ where: { key: "BIOMETRIC_LEDGER_IDENTITY" } }),
      ]);

    const hasBiometricHistory =
      enrollmentCount > 0 || consentCount > 0 || historicalDeletionCount > 0 || ledgerIdentitySetting !== null;

    if (hasBiometricHistory && !options?.allowMissing) {
      throw new Error(
        `Biometric restore reconciliation aborted: Expected durable biometric ledger at '${filePath}' is missing for an active biometric installation (faceEnrollments: ${enrollmentCount}, historicalDeletions: ${historicalDeletionCount}). Failing closed to prevent resurrecting deleted biometric descriptors.`
      );
    }
  }

  // 2. Identity Verification & Checkpoint Integrity (Replaced Ledger Detection)
  if (ledgerExists) {
    const currentIdentity =
      readLedgerIdentity(options?.customLedgerPath) || ensureLedgerIdentity(options?.customLedgerPath);

    const settingKey = options?.customLedgerPath
      ? `BIOMETRIC_LEDGER_IDENTITY:${path.basename(options.customLedgerPath)}`
      : "BIOMETRIC_LEDGER_IDENTITY";

    const dbIdentitySetting = await prisma.systemSetting.findUnique({
      where: { key: settingKey },
    });

    if (dbIdentitySetting && dbIdentitySetting.value) {
      if (dbIdentitySetting.value !== currentIdentity.ledgerId && !options?.allowReplaced) {
        throw new Error(
          `Biometric restore reconciliation aborted: Ledger identity mismatch! Expected ledger '${dbIdentitySetting.value}', found '${currentIdentity.ledgerId}'. The ledger has been replaced or swapped. Failing closed to prevent unauthorized history manipulation.`
        );
      }
    } else {
      // First reconciliation for this ledger: persist identity to systemSetting checkpoint
      await prisma.systemSetting.upsert({
        where: { key: settingKey },
        create: {
          key: settingKey,
          value: currentIdentity.ledgerId,
          description: "Durable out-of-band biometric lifecycle ledger identity UUID",
        },
        update: {
          value: currentIdentity.ledgerId,
        },
      });
    }

    // Check for empty ledger when historical deletions exist
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      const historicalDeletionCount = await prisma.auditLog.count({
        where: {
          action: { in: ["BIOMETRIC_DELETED", "BIOMETRIC_ENROLLMENT_REVOKED", "FACE_ENROLLMENT_DELETED"] },
        },
      });
      if (historicalDeletionCount > 0) {
        throw new Error(
          `Biometric restore reconciliation aborted: Ledger file at '${filePath}' is empty (0 bytes) despite ${historicalDeletionCount} historical deletion events in the database. Ledger may have been truncated or corrupted. Failing closed.`
        );
      }
    }
  }

  // 3. Read and verify out-of-band durable ledger entries (FAILS CLOSED on tampering/corruption)
  const ledgerEntries = readBiometricLedgerEntries(options?.customLedgerPath);

  // 3a. Ledger Freshness and Rollback Protection:
  // If the restored database contains deletion events that are NEWER than the latest entry
  // in the ledger, the ledger is either older than the database snapshot or has been truncated.
  if (ledgerEntries.length > 0) {
    const latestLedgerTime = new Date(ledgerEntries[ledgerEntries.length - 1]!.timestamp).getTime();
    const latestDbDeletion = await prisma.auditLog.findFirst({
      where: {
        action: { in: ["BIOMETRIC_DELETED", "BIOMETRIC_ENROLLMENT_REVOKED", "FACE_ENROLLMENT_DELETED"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (latestDbDeletion && latestDbDeletion.createdAt.getTime() > latestLedgerTime + 1000) {
      throw new Error(
        `Biometric restore reconciliation aborted: Ledger at '${filePath}' is older than database snapshot! Latest ledger event is from ${new Date(
          latestLedgerTime
        ).toISOString()}, but database contains deletion audit from ${latestDbDeletion.createdAt.toISOString()}. Ledger has been truncated, replaced with an older backup, or rolled back. Failing closed.`
      );
    }
  }

  const postSnapshotLedgerEntries = ledgerEntries.filter(
    (e) => new Date(e.timestamp).getTime() >= snapshotDate.getTime()
  );

  // 4. Query restored database AuditLog table for compatible historical events (surviving in WAL or legacy snapshots)
  // Supports historical event names: "BIOMETRIC_DELETED", "BIOMETRIC_ENROLLMENT_REVOKED", "FACE_ENROLLMENT_DELETED"
  const dbAuditEvents = await prisma.auditLog.findMany({
    where: {
      action: {
        in: ["BIOMETRIC_DELETED", "BIOMETRIC_ENROLLMENT_REVOKED", "FACE_ENROLLMENT_DELETED"],
      },
      createdAt: { gte: snapshotDate },
    },
    orderBy: { createdAt: "asc" },
  });

  // 3. Merge and deduplicate target student IDs from both durable ledger and DB audit trail
  const studentActionMap = new Map<string, { action: string; timestamp: Date; reason?: string }>();

  // Process DB audit events
  for (const dbEvent of dbAuditEvents) {
    studentActionMap.set(dbEvent.entityId, {
      action: dbEvent.action,
      timestamp: dbEvent.createdAt,
      reason: "Restored DB audit trail",
    });
  }

  // Process durable ledger events (authoritative source surviving rollback)
  for (const ledgerEntry of postSnapshotLedgerEntries) {
    studentActionMap.set(ledgerEntry.studentId, {
      action: ledgerEntry.action,
      timestamp: new Date(ledgerEntry.timestamp),
      reason: ledgerEntry.reason || "Durable out-of-band ledger",
    });
  }

  const uniqueStudentIds = Array.from(studentActionMap.keys());

  if (uniqueStudentIds.length === 0) {
    return {
      success: true,
      snapshotTimestamp: snapshotDate,
      reconciledCount: 0,
      studentIds: [],
      sourceCounts: {
        durableLedger: 0,
        databaseAuditLog: 0,
      },
    };
  }

  // 4. Transactionally purge descriptors and re-revoke consent in the restored database
  const result = await prisma.$transaction(
    async (tx) => {
      for (const [studentId, meta] of studentActionMap.entries()) {
        const isPermanentDelete =
          meta.action === "BIOMETRIC_DELETED" || meta.action === "FACE_ENROLLMENT_DELETED";

        if (isPermanentDelete) {
          // Re-purge biometric descriptors and mark DELETED
          await tx.faceEnrollment.updateMany({
            where: { studentId },
            data: {
              status: "DELETED",
              descriptors: "", // Purge restored vector embedding
              deletedAt: meta.timestamp,
              consentRevokedAt: meta.timestamp,
            },
          });
        } else {
          // Re-revoke enrollment status
          await tx.faceEnrollment.updateMany({
            where: { studentId },
            data: {
              status: "REVOKED",
              consentRevokedAt: meta.timestamp,
            },
          });
        }

        // Re-revoke BiometricConsent for any student affected
        await tx.biometricConsent.updateMany({
          where: { studentId },
          data: {
            status: "REVOKED",
            revokedAt: meta.timestamp,
            revocationReason: `Reconciled post-restore from ${meta.action} (${meta.reason})`,
          },
        });
      }

      // Record immutable restore reconciliation audit entry
      const audit = await tx.auditLog.create({
        data: {
          actorUserId: effectiveActorId,
          action: "RESTORE_RECONCILIATION_COMPLETED",
          entityType: "System",
          entityId: "PostRestoreBiometricSync",
          metadata: JSON.stringify({
            snapshotTimestamp: snapshotDate.toISOString(),
            reconciledCount: uniqueStudentIds.length,
            studentIds: uniqueStudentIds,
            durableLedgerCount: postSnapshotLedgerEntries.length,
            dbAuditCount: dbAuditEvents.length,
            reconciledAt: new Date().toISOString(),
          }),
        },
      });

      return { auditId: audit.id };
    },
    { maxWait: 5000, timeout: 15000 }
  );

  return {
    success: true,
    snapshotTimestamp: snapshotDate,
    reconciledCount: uniqueStudentIds.length,
    studentIds: uniqueStudentIds,
    auditLogId: result.auditId,
    sourceCounts: {
      durableLedger: postSnapshotLedgerEntries.length,
      databaseAuditLog: dbAuditEvents.length,
    },
  };
}

// CLI entry point
if (process.argv[1] && process.argv[1].endsWith("reconcile-biometric-restore.ts")) {
  const prisma = new PrismaClient();
  const snapshotArg = process.argv.slice(2).find((arg) => arg.startsWith("--snapshot-date="));
  const rawDate = snapshotArg ? snapshotArg.split("=")[1] : null;

  const ledgerArg = process.argv.slice(2).find((arg) => arg.startsWith("--ledger-path="));
  const customLedgerPath = ledgerArg ? ledgerArg.split("=")[1] : undefined;

  if (!rawDate) {
    console.error("Usage: tsx reconcile-biometric-restore.ts --snapshot-date=<ISO_TIMESTAMP> [--ledger-path=<PATH>]");
    process.exit(1);
  }

  reconcileBiometricDeletions(prisma, rawDate, { customLedgerPath })
    .then((res) => {
      console.log("✅ Restore reconciliation completed successfully:", res);
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Restore reconciliation failed:", err);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
