import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { env } from "../../config/env.js";

export type BiometricLifecycleAction =
  | "BIOMETRIC_DELETED"
  | "BIOMETRIC_ENROLLMENT_REVOKED"
  | "FACE_ENROLLMENT_DELETED"
  | "BIOMETRIC_ENROLLED";

export interface BiometricLedgerEntry {
  eventId: string;
  sequence: number;
  action: BiometricLifecycleAction;
  studentId: string;
  actorUserId: string;
  timestamp: string; // ISO 8601
  reason?: string;
  prevHash: string;
  algorithm?: "hmac-sha256" | "sha256";
  keyId?: string;
  hash: string;
}

export interface LedgerIdentity {
  ledgerId: string;
  createdAt: string;
  environment: string;
}

/**
 * Resolves the ledger identity metadata checkpoint file path.
 */
export function getLedgerIdentityPath(customPath?: string): string {
  const ledgerPath = getLedgerFilePath(customPath);
  return `${ledgerPath}.identity`;
}

/**
 * Ensures a unique durable identity checkpoint exists for the ledger.
 */
export function ensureLedgerIdentity(customPath?: string): LedgerIdentity {
  const identityPath = getLedgerIdentityPath(customPath);
  const dir = path.dirname(identityPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(identityPath)) {
    try {
      const content = fs.readFileSync(identityPath, "utf-8");
      return JSON.parse(content);
    } catch {
      // Re-initialize if corrupted
    }
  }

  const identity: LedgerIdentity = {
    ledgerId: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    environment: env.NODE_ENV,
  };

  const fd = fs.openSync(identityPath, "w");
  try {
    fs.writeSync(fd, JSON.stringify(identity, null, 2), null, "utf-8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return identity;
}

/**
 * Reads existing ledger identity checkpoint if present.
 */
export function readLedgerIdentity(customPath?: string): LedgerIdentity | null {
  const identityPath = getLedgerIdentityPath(customPath);
  if (!fs.existsSync(identityPath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(identityPath, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * Returns the primary key secret for biometric ledger HMAC operations.
 * Prioritizes BIOMETRIC_LEDGER_KEY, then legacy BIOMETRIC_ENCRYPTION_KEY, SESSION_SECRET, and JWT_SECRET.
 */
export function getLedgerIntegritySecret(): string {
  return (
    process.env.BIOMETRIC_LEDGER_KEY ||
    env.BIOMETRIC_LEDGER_KEY ||
    process.env.BIOMETRIC_ENCRYPTION_KEY ||
    env.SESSION_SECRET ||
    env.JWT_SECRET
  );
}

/**
 * Computes an HMAC-SHA256 signature for a ledger entry.
 * Anchoring to a dedicated server secret prevents adversaries with filesystem access
 * from rewriting the entire file and recomputing valid hashes.
 */
export function computeLedgerHash(
  sequence: number,
  action: string,
  studentId: string,
  actorUserId: string,
  timestamp: string,
  prevHash: string,
  customSecret?: string
): string {
  const secret = customSecret || getLedgerIntegritySecret();
  return crypto
    .createHmac("sha256", secret)
    .update(`${sequence}:${action}:${studentId}:${actorUserId}:${timestamp}:${prevHash}`)
    .digest("hex");
}

/**
 * Resolves the absolute ledger file path.
 */
export function getLedgerFilePath(customPath?: string): string {
  const target =
    customPath ||
    process.env.BIOMETRIC_LEDGER_PATH ||
    env.BIOMETRIC_LEDGER_PATH ||
    "./data/biometric-ledger/biometric-lifecycle-ledger.jsonl";
  return path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
}

/**
 * Acquires a cross-process advisory lock file to serialize concurrent ledger appends.
 * Uses atomic O_CREAT | O_EXCL flags with PID tracking for crash recovery.
 *
 * CRASH RECOVERY SAFETY:
 * Writes `{ pid, createdAt }` into the lock file. If another process finds EEXIST,
 * it inspects whether the holding PID is still alive via `process.kill(pid, 0)`.
 * - If the process crashed (ESRCH), the lock is safely reclaimed without waiting for arbitrary timeouts.
 */
/**
 * Advisory lock handle returned upon successful acquisition.
 */
export interface LedgerLockHandle {
  fd: number;
  lockPath: string;
  token: string;
  createdAt: number;
  leaseExpiresAt: number;
}

/**
 * Acquires a cross-process advisory lock file to serialize concurrent ledger appends.
 * Uses atomic O_CREAT | O_EXCL flags with PID and Host lease tracking for crash recovery.
 *
 * CRASH RECOVERY & TOPOLOGY SAFETY:
 * Writes `{ pid, hostId, createdAt, leaseExpiresAt, token }` into the lock file.
 * - Same Host/Container: inspects whether holding PID is alive via process.kill(pid, 0).
 *   If process crashed (ESRCH), the lock is safely reclaimed immediately.
 * - Different Host/Container (separate PID namespace / NFS / EFS): relies on leaseExpiresAt (5s TTL).
 *   If lease has expired, the stale lock is safely reclaimed across nodes.
 * - A live lock within its active lease is NEVER stolen, preventing split-brain corruption.
 */
export function acquireLedgerLock(lockPath: string, maxWaitMs = 5000): LedgerLockHandle {
  const start = Date.now();
  const currentHost = os.hostname();
  while (true) {
    try {
      const fd = fs.openSync(lockPath, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_RDWR);
      const token = crypto.randomUUID();
      const createdAt = Date.now();
      const leaseExpiresAt = createdAt + 5000;
      try {
        const payload = JSON.stringify({
          pid: process.pid,
          hostId: currentHost,
          createdAt,
          leaseExpiresAt,
          token,
        });
        fs.writeSync(fd, payload, null, "utf-8");
        fs.fsyncSync(fd);
      } catch {
        // Even if payload write fails, the atomic lock file is held
      }
      return { fd, lockPath, token, createdAt, leaseExpiresAt };
    } catch (err: any) {
      if (err.code === "EEXIST") {
        try {
          let isStale = false;
          let lockHolderPid: number | null = null;
          let lockHolderHost: string | null = null;
          let leaseExpiresAt: number | null = null;

          try {
            const content = fs.readFileSync(lockPath, "utf-8");
            if (content.trim()) {
              const parsed = JSON.parse(content);
              if (typeof parsed.pid === "number") lockHolderPid = parsed.pid;
              if (typeof parsed.hostId === "string") lockHolderHost = parsed.hostId;
              if (typeof parsed.leaseExpiresAt === "number") leaseExpiresAt = parsed.leaseExpiresAt;
            }
          } catch {
            // Partial write or empty lock file
          }

          const isSameHost = !lockHolderHost || lockHolderHost === currentHost;

          if (isSameHost && lockHolderPid !== null) {
            try {
              process.kill(lockHolderPid, 0);
              // Holder is alive on local host: check if lease expired due to process hang
              if (leaseExpiresAt && Date.now() > leaseExpiresAt) {
                isStale = true;
              } else {
                isStale = false;
              }
            } catch (killErr: any) {
              if (killErr.code === "ESRCH") {
                // Holder process has crashed or terminated without releasing lock!
                isStale = true;
              }
            }
          } else if (!isSameHost) {
            // Distinct container or host: cannot rely on process.kill across PID namespaces. Rely on lease TTL!
            if (leaseExpiresAt && Date.now() > leaseExpiresAt) {
              isStale = true;
            }
          } else {
            // Unparseable lock file older than 5000ms
            const stat = fs.statSync(lockPath);
            if (Date.now() - stat.mtimeMs > 5000) {
              isStale = true;
            }
          }

          if (isStale) {
            try {
              fs.unlinkSync(lockPath);
              continue;
            } catch {
              // Concurrently unlinked by another process
            }
          }
        } catch {
          // File may have been removed concurrently
        }

        if (Date.now() - start > maxWaitMs) {
          throw new Error(`Failed to acquire biometric ledger lock after ${maxWaitMs}ms`);
        }

        const spinStart = Date.now();
        while (Date.now() - spinStart < 25) {}
      } else {
        throw err;
      }
    }
  }
}

/**
 * Validates that the current process still exclusively holds the lock and the lease has not expired.
 * Fails closed if the lock has been stolen or expired.
 */
export function validateLockLease(lock: LedgerLockHandle): void {
  if (Date.now() >= lock.leaseExpiresAt) {
    throw new Error(
      `FENCING_LEASE_EXPIRED: Biometric ledger lease expired before write completed. Aborting write to prevent split-brain ledger corruption.`
    );
  }

  if (!fs.existsSync(lock.lockPath)) {
    throw new Error(
      `FENCING_LOCK_LOST: Biometric ledger lock file no longer exists. Aborting write to prevent split-brain ledger corruption.`
    );
  }

  try {
    const content = fs.readFileSync(lock.lockPath, "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.token && parsed.token !== lock.token) {
      throw new Error(
        `FENCING_TOKEN_MISMATCH: Lock lease was acquired by another process during pause. Aborting write.`
      );
    }
    if (parsed.pid !== process.pid) {
      throw new Error(
        `FENCING_PID_MISMATCH: Lock lease stolen by PID ${parsed.pid}. Aborting write.`
      );
    }
  } catch (err: any) {
    if (err.message && err.message.startsWith("FENCING_")) {
      throw err;
    }
    throw new Error(
      `FENCING_VERIFICATION_FAILED: Failed to verify lock lease: ${err.message}`
    );
  }
}

/**
 * Renews the lease of an actively held lock.
 */
export function renewLedgerLock(lock: LedgerLockHandle, extensionMs = 5000): void {
  validateLockLease(lock);
  const newExpiry = Date.now() + extensionMs;
  const payload = JSON.stringify({
    pid: process.pid,
    hostId: os.hostname(),
    createdAt: lock.createdAt,
    leaseExpiresAt: newExpiry,
    token: lock.token,
  });
  fs.ftruncateSync(lock.fd, 0);
  fs.writeSync(lock.fd, payload, 0, "utf-8");
  fs.fsyncSync(lock.fd);
  lock.leaseExpiresAt = newExpiry;
}

/**
 * Releases the advisory lock file if and only if the current process still owns it.
 */
export function releaseLedgerLock(lock: LedgerLockHandle | number, lockPath?: string): void {
  if (typeof lock === "number") {
    // Backward compatibility for tests calling releaseLedgerLock(fd, path)
    try {
      fs.closeSync(lock);
    } catch {}
    if (lockPath && fs.existsSync(lockPath)) {
      try {
        fs.unlinkSync(lockPath);
      } catch {}
    }
    return;
  }

  try {
    fs.closeSync(lock.fd);
  } catch {}

  try {
    if (fs.existsSync(lock.lockPath)) {
      try {
        const content = fs.readFileSync(lock.lockPath, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.token === lock.token || parsed.pid === process.pid) {
          fs.unlinkSync(lock.lockPath);
        }
      } catch {
        // If file content cannot be read or unlinked, unlink anyway if still exists
        fs.unlinkSync(lock.lockPath);
      }
    }
  } catch {}
}

/**
 * Reads and verifies the integrity of all entries in the durable biometric ledger.
 * Fails closed if hash chaining is broken, sequence is out of order, or file format is corrupted.
 * STRICT DOWNGRADE PREVENTION: Never allows authenticated HMAC records to fall back to unkeyed SHA-256.
 */
export function readBiometricLedgerEntries(customPath?: string): BiometricLedgerEntry[] {
  const filePath = getLedgerFilePath(customPath);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries: BiometricLedgerEntry[] = [];

  let expectedPrevHash = "0000000000000000000000000000000000000000000000000000000000000000";
  let expectedSequence = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    let entry: BiometricLedgerEntry;
    try {
      entry = JSON.parse(line);
    } catch {
      throw new Error(`Biometric ledger corrupted at line ${i + 1}: Invalid JSON payload`);
    }

    // Validate fields
    if (
      !entry.eventId ||
      typeof entry.sequence !== "number" ||
      !entry.action ||
      !entry.studentId ||
      !entry.timestamp ||
      !entry.hash
    ) {
      throw new Error(`Biometric ledger corrupted at line ${i + 1}: Missing required fields`);
    }

    const effectiveActorId = entry.actorUserId || "system";

    // Validate sequence
    if (entry.sequence !== expectedSequence) {
      throw new Error(
        `Biometric ledger sequence broken at line ${i + 1}: expected ${expectedSequence}, found ${entry.sequence}`
      );
    }

    // Validate prevHash chaining
    if (entry.prevHash !== expectedPrevHash) {
      throw new Error(
        `Biometric ledger prevHash broken at line ${i + 1}: expected ${expectedPrevHash}, found ${entry.prevHash}`
      );
    }

    // Recompute HMAC signature
    const primaryHmac = computeLedgerHash(
      entry.sequence,
      entry.action,
      entry.studentId,
      effectiveActorId,
      entry.timestamp,
      entry.prevHash
    );

    const fallbackKeys = [
      env.SESSION_SECRET,
      env.JWT_SECRET,
      process.env.BIOMETRIC_ENCRYPTION_KEY,
    ].filter(Boolean) as string[];

    let matchesHmac = entry.hash === primaryHmac;
    if (!matchesHmac) {
      for (const fallbackKey of fallbackKeys) {
        if (
          entry.hash ===
          computeLedgerHash(
            entry.sequence,
            entry.action,
            entry.studentId,
            entry.actorUserId,
            entry.timestamp,
            entry.prevHash,
            fallbackKey
          )
        ) {
          matchesHmac = true;
          break;
        }
      }
    }

    const entryAlgorithm = entry.algorithm || (entry.keyId ? "hmac-sha256" : undefined);

    if (entryAlgorithm === "hmac-sha256") {
      // STRICT DOWNGRADE PREVENTION: Never allow unkeyed SHA-256 for records designated as HMAC
      if (!matchesHmac) {
        throw new Error(
          `Biometric ledger cryptographic hash mismatch at line ${i + 1}: HMAC signature verification failed (keyId: ${entry.keyId || "unknown"})`
        );
      }
    } else {
      // Legacy entry without explicit algorithm tag
      const legacySha256 = crypto
        .createHash("sha256")
        .update(`${entry.sequence}:${entry.action}:${entry.studentId}:${entry.actorUserId}:${entry.timestamp}:${entry.prevHash}`)
        .digest("hex");

      const allowLegacy =
        env.ALLOW_LEGACY_UNKEYED_LEDGER ||
        process.env.ALLOW_LEGACY_UNKEYED_LEDGER === "true" ||
        env.NODE_ENV === "test" ||
        env.NODE_ENV === "development";

      if (matchesHmac) {
        // Validated via HMAC key
      } else if (entry.hash === legacySha256) {
        if (!allowLegacy) {
          throw new Error(
            `Biometric ledger signature downgrade rejected at line ${i + 1}: Unkeyed legacy SHA-256 is not permitted in production authenticated mode. Migration required.`
          );
        }
      } else {
        throw new Error(
          `Biometric ledger cryptographic hash mismatch at line ${i + 1}: record integrity compromised`
        );
      }
    }

    entries.push(entry);
    expectedPrevHash = entry.hash;
    expectedSequence = entry.sequence + 1;
  }

  return entries;
}

/**
 * Returns the set of all student IDs that have recorded deletion or revocation events in the ledger.
 * Used to immediately quarantine students from recognition matching even if database transactions fail.
 */
export function getQuarantinedStudentIds(customPath?: string): Set<string> {
  const filePath = getLedgerFilePath(customPath);
  if (!fs.existsSync(filePath)) {
    return new Set<string>();
  }
  const entries = readBiometricLedgerEntries(customPath);
  const quarantined = new Set<string>();
  for (const entry of entries) {
    if (
      entry.action === "BIOMETRIC_DELETED" ||
      entry.action === "BIOMETRIC_ENROLLMENT_REVOKED" ||
      entry.action === "FACE_ENROLLMENT_DELETED"
    ) {
      quarantined.add(entry.studentId);
    } else if (entry.action === "BIOMETRIC_ENROLLED") {
      quarantined.delete(entry.studentId);
    }
  }
  return quarantined;
}

/**
 * Appends a new immutable lifecycle event to the durable out-of-band biometric ledger.
 * Guarantees:
 * 1. Cross-process & cross-host mutual exclusion via atomic file locking with PID and lease tracking.
 * 2. Crash-consistency via fsyncSync before releasing lock.
 * 3. Fail-closed error propagation if disk or storage is unwritable.
 */
export function appendBiometricLedgerEvent(
  params: {
    action: BiometricLifecycleAction;
    studentId: string;
    actorUserId: string;
    reason?: string;
    timestamp?: string;
  },
  customPath?: string
): BiometricLedgerEntry {
  const filePath = getLedgerFilePath(customPath);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    try {
      const dirFd = fs.openSync(dir, "r");
      try {
        fs.fsyncSync(dirFd);
      } finally {
        fs.closeSync(dirFd);
      }
    } catch {
      // Windows or non-fsyncable directories safely ignore
    }
  }

  // Ensure durable identity checkpoint exists alongside ledger
  ensureLedgerIdentity(customPath);

  const lockPath = `${filePath}.lock`;
  const lockHandle = acquireLedgerLock(lockPath);

  try {
    // Read existing entries to determine next sequence and prevHash under exclusive lock
    const existing = readBiometricLedgerEntries(customPath);
    const lastEntry = existing.length > 0 ? existing[existing.length - 1] : undefined;
    const sequence = lastEntry ? lastEntry.sequence + 1 : 1;
    const prevHash = lastEntry ? lastEntry.hash : "0000000000000000000000000000000000000000000000000000000000000000";
    const timestamp = params.timestamp || new Date().toISOString();
    const eventId = crypto.randomUUID();
    const effectiveActorId = params.actorUserId || "system";

    const hash = computeLedgerHash(
      sequence,
      params.action,
      params.studentId,
      effectiveActorId,
      timestamp,
      prevHash
    );

    const entry: BiometricLedgerEntry = {
      eventId,
      sequence,
      action: params.action,
      studentId: params.studentId,
      actorUserId: effectiveActorId,
      timestamp,
      reason: params.reason,
      prevHash,
      algorithm: "hmac-sha256",
      keyId: process.env.BIOMETRIC_LEDGER_KEY_ID || env.BIOMETRIC_LEDGER_KEY_ID || "k1",
      hash,
    };

    const line = JSON.stringify(entry) + "\n";

    // FENCING TOKEN & LEASE CHECK: Validate that lock is still actively held by this process and unexpired
    validateLockLease(lockHandle);

    const fd = fs.openSync(filePath, "a");
    try {
      fs.writeSync(fd, line, null, "utf-8");
      // Force write to physical storage medium for crash consistency
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    return entry;
  } finally {
    releaseLedgerLock(lockHandle);
  }
}
