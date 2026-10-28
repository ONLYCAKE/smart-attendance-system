import crypto from "crypto";
import { env } from "../../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce recommended by NIST SP 800-38D
export const CURRENT_KEY_VERSION = "v1";

// Validate key provisioning in production
function deriveKey(secret?: string): Buffer {
  const effectiveSecret = secret || env.BIOMETRIC_ENCRYPTION_KEY || process.env.BIOMETRIC_ENCRYPTION_KEY || env.JWT_SECRET;
  if (!effectiveSecret) {
    if (env.NODE_ENV === "production") {
      throw new Error(
        "FATAL: BIOMETRIC_ENCRYPTION_KEY must be explicitly configured in production"
      );
    }
    return crypto.createHash("sha256").update("smart-attendance-dev-biometric-key").digest();
  }
  return crypto.createHash("sha256").update(effectiveSecret).digest();
}

const PRIMARY_KEY = deriveKey();

/**
 * Key registry supporting zero-downtime key rotation.
 */
const KEY_REGISTRY: Record<string, Buffer> = {
  v1: PRIMARY_KEY,
};

/**
 * Encrypts a normalized 1024-float face descriptor using AES-256-GCM.
 * Output format: `v1:<ivHex>:<authTagHex>:<cipherHex>`
 */
export function encryptDescriptor(
  descriptor: number[],
  keyVersion = CURRENT_KEY_VERSION
): string {
  const key = KEY_REGISTRY[keyVersion];
  if (!key) {
    throw new Error(`Encryption key version "${keyVersion}" is not configured`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const jsonStr = JSON.stringify(descriptor);
  let encrypted = cipher.update(jsonStr, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  return `${keyVersion}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM envelope, verifying the 128-bit authentication tag.
 * Supports versioned envelopes (`v1:iv:tag:cipher`), legacy envelopes (`iv:tag:cipher`),
 * and unencrypted fallback arrays.
 */
export function decryptDescriptor(payload: string): number[] {
  if (!payload || payload.trim() === "") return [];

  // Plain JSON array (unencrypted fallback)
  if (payload.startsWith("[") && payload.endsWith("]")) {
    try {
      return JSON.parse(payload);
    } catch {
      throw new Error("Invalid unencrypted descriptor format");
    }
  }

  const parts = payload.split(":");

  let keyVersion = CURRENT_KEY_VERSION;
  let ivHex = "";
  let authTagHex = "";
  let encryptedHex = "";

  if (parts.length === 4) {
    // Versioned envelope: `version:iv:tag:cipher`
    keyVersion = parts[0] ?? CURRENT_KEY_VERSION;
    ivHex = parts[1] ?? "";
    authTagHex = parts[2] ?? "";
    encryptedHex = parts[3] ?? "";
  } else if (parts.length === 3) {
    // Legacy envelope: `iv:tag:cipher`
    ivHex = parts[0] ?? "";
    authTagHex = parts[1] ?? "";
    encryptedHex = parts[2] ?? "";
  } else {
    throw new Error("Invalid encrypted descriptor envelope format");
  }

  const key = KEY_REGISTRY[keyVersion] || PRIMARY_KEY;
  if (!key) {
    throw new Error(`Decryption key version "${keyVersion}" not found in registry`);
  }

  if (!ivHex || !authTagHex || !encryptedHex) {
    throw new Error("Missing encryption envelope segments");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid initialization vector length: expected ${IV_LENGTH} bytes`);
  }

  if (authTag.length !== 16) {
    throw new Error("Invalid authentication tag length: expected 16 bytes");
  }

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  } catch (err: any) {
    throw new Error("Biometric descriptor decryption failed: authentication tag mismatch or corrupted data");
  }
}

/**
 * Key Rotation Helper:
 * Re-encrypts an existing descriptor with a new key version without ever logging
 * or exposing plaintext vectors.
 */
export function rotateDescriptorEnvelope(
  payload: string,
  targetKeyVersion = CURRENT_KEY_VERSION
): string {
  if (!payload || payload.trim() === "") return "";
  const vector = decryptDescriptor(payload);
  return encryptDescriptor(vector, targetKeyVersion);
}
