import { StudentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  encryptDescriptor,
  decryptDescriptor,
  CURRENT_KEY_VERSION,
} from "./encryption.util.js";
import {
  BiometricConsentInput,
  FaceEnrollmentSubmitInput,
} from "@smart-attendance/shared";
import { appendBiometricLedgerEvent, getQuarantinedStudentIds } from "./biometric-ledger.js";

export const CURRENT_CONSENT_VERSION = "1.0";

export class EnrollmentService {
  /**
   * Records or revokes student biometric consent.
   * Student must be in ACTIVE status.
   *
   * Security & Consent Integrity Guard:
   * - Students may grant consent directly for their own profile.
   * - Administrators cannot grant consent on behalf of a student unless an explicit
   *   representative-consent policy is invoked with a documented legal basis and document reference.
   * - Revocation can be initiated by either the student or an administrator.
   */
  async recordConsent(
    actorUserId: string,
    studentId: string,
    input: BiometricConsentInput
  ) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        biometricConsent: true,
        faceEnrollment: true,
        user: true,
      },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
    }

    if (student.status !== StudentStatus.ACTIVE) {
      throw new AppError(
        "Student must be approved and active before recording consent",
        400,
        "STUDENT_NOT_ACTIVE"
      );
    }

    // Server-enforced consent terms version control
    if (input.consentVersion && input.consentVersion !== CURRENT_CONSENT_VERSION) {
      throw new AppError(
        `Consent terms version mismatch: server currently requires version ${CURRENT_CONSENT_VERSION}`,
        400,
        "UNSUPPORTED_CONSENT_VERSION"
      );
    }

    const consentVersion = CURRENT_CONSENT_VERSION;
    const isStudentSelf = student.userId === actorUserId;

    // 1. Granting Consent
    if (input.agreed) {
      if (!isStudentSelf && (!input.representativeConsent?.legalBasis || !input.representativeConsent?.documentReference)) {
        throw new AppError(
          "Recording biometric consent on behalf of a student requires authorized representative policy and legal document reference",
          403,
          "REPRESENTATIVE_CONSENT_REQUIRED"
        );
      }

      const legalBasis = input.representativeConsent?.legalBasis || null;
      const documentReference = input.representativeConsent?.documentReference || null;

      // Idempotency check: already active under identical terms (unless representative policy is being attached)
      if (
        !input.representativeConsent &&
        student.biometricConsent &&
        student.biometricConsent.status === "GRANTED" &&
        student.biometricConsent.consentVersion === consentVersion &&
        !student.biometricConsent.revokedAt
      ) {
        return {
          consent: student.biometricConsent,
          message: "Biometric consent is already active under the current terms",
        };
      }

      const consent = await prisma.$transaction(async (tx) => {
        const savedConsent = await tx.biometricConsent.upsert({
          where: { studentId },
          create: {
            studentId,
            status: "GRANTED",
            consentVersion,
            consentedAt: new Date(),
          },
          update: {
            status: "GRANTED",
            consentVersion,
            consentedAt: new Date(),
            revokedAt: null,
            revocationReason: null,
          },
        });

        // Audit log without biometric or unnecessary personal data
        await tx.auditLog.create({
          data: {
            actorUserId,
            action: isStudentSelf
              ? "BIOMETRIC_CONSENT_GRANTED_SELF"
              : "BIOMETRIC_CONSENT_GRANTED_REPRESENTATIVE",
            entityType: "BiometricConsent",
            entityId: studentId,
            metadata: JSON.stringify({
              consentVersion,
              isRepresentative: !isStudentSelf,
              legalBasis,
              documentReference,
              timestamp: new Date().toISOString(),
            }),
          },
        });

        return savedConsent;
      });

      return {
        consent,
        message: "Biometric consent recorded successfully",
      };
    }

    // 2. If student has an active face enrollment, record revocation in durable out-of-band ledger FIRST
    if (student.faceEnrollment && student.faceEnrollment.status === "ACTIVE") {
      try {
        appendBiometricLedgerEvent({
          action: "BIOMETRIC_ENROLLMENT_REVOKED",
          studentId,
          actorUserId,
          reason: input.revocationReason || "Withdrawn by user",
        });
      } catch (ledgerErr) {
        console.error("Critical: Failed to append consent revocation to biometric lifecycle ledger:", ledgerErr);
        throw new AppError(
          "Biometric consent revocation failed: durable recovery ledger is unavailable. Operation aborted.",
          500,
          "BIOMETRIC_LEDGER_ERROR"
        );
      }
    }

    // 3. Revoking Consent in PostgreSQL
    const revoked = await prisma.$transaction(async (tx) => {
      const savedConsent = await tx.biometricConsent.upsert({
        where: { studentId },
        create: {
          studentId,
          status: "REVOKED",
          consentVersion,
          consentedAt: new Date(),
          revokedAt: new Date(),
          revocationReason: input.revocationReason || "Withdrawn by user",
        },
        update: {
          status: "REVOKED",
          revokedAt: new Date(),
          revocationReason: input.revocationReason || "Withdrawn by user",
        },
      });

      // Immediately deactivate matching in FaceEnrollment
      if (student.faceEnrollment && student.faceEnrollment.status === "ACTIVE") {
        await tx.faceEnrollment.update({
          where: { studentId },
          data: {
            status: "REVOKED",
            consentRevokedAt: new Date(),
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "BIOMETRIC_CONSENT_REVOKED",
          entityType: "BiometricConsent",
          entityId: studentId,
          metadata: JSON.stringify({
            reason: input.revocationReason || "Withdrawn by user",
            revokedByUserId: actorUserId,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return savedConsent;
    });

    return {
      consent: revoked,
      message: "Biometric consent revoked successfully; recognition matching disabled",
    };
  }

  /**
   * Retrieves consent status for a student.
   */
  async getConsentStatus(studentId: string) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { biometricConsent: true },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
    }

    const consent = student.biometricConsent;
    return {
      studentId,
      hasConsent: Boolean(consent && consent.status === "GRANTED" && !consent.revokedAt),
      consentVersion: consent?.consentVersion || null,
      consentedAt: consent?.consentedAt || null,
      revokedAt: consent?.revokedAt || null,
      status: consent?.status || "NO_RECORD",
    };
  }

  /**
   * Enrolls face descriptors for an active student with verified consent.
   * Client-side extracted descriptors are treated as untrusted input:
   * strictly validates dimensions, finiteness, normalization, and provider compatibility.
   */
  async enrollFace(
    actorUserId: string,
    studentId: string,
    input: FaceEnrollmentSubmitInput
  ) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        biometricConsent: true,
        faceEnrollment: true,
      },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
    }

    // 1. Student Status Gate
    if (student.status !== StudentStatus.ACTIVE) {
      throw new AppError(
        "Student must be approved and active to enroll biometric data",
        400,
        "STUDENT_NOT_ACTIVE"
      );
    }

    // 2. Consent Gate & Version Check
    const consent = student.biometricConsent;
    if (!consent || consent.status !== "GRANTED" || consent.revokedAt !== null) {
      throw new AppError(
        "Explicit active biometric consent is required before face enrollment",
        400,
        "CONSENT_REQUIRED"
      );
    }

    if (consent.consentVersion !== CURRENT_CONSENT_VERSION) {
      throw new AppError(
        `Biometric consent terms have been updated to version ${CURRENT_CONSENT_VERSION}; student must re-affirm consent before enrollment`,
        400,
        "CONSENT_TERMS_EXPIRED"
      );
    }

    // 3. Provider & Model Version Validation
    const provider = input.provider || "human";
    const modelVersion = input.modelVersion || "faceres-v1";

    if (provider !== "human") {
      throw new AppError(
        `Unsupported biometric provider: "${provider}"; only "human" is supported`,
        400,
        "UNSUPPORTED_PROVIDER"
      );
    }

    if (modelVersion !== "faceres-v1") {
      throw new AppError(
        `Incompatible model version: "${modelVersion}"; current expected version is "faceres-v1"`,
        400,
        "INCOMPATIBLE_MODEL"
      );
    }

    // 4. Descriptor Parsing & Dimensionality Check
    let rawVector: number[] = [];
    if (Array.isArray(input.descriptor)) {
      rawVector = input.descriptor;
    } else if (Array.isArray(input.descriptors)) {
      rawVector = input.descriptors;
    } else if (typeof input.descriptors === "string") {
      try {
        const parsed = JSON.parse(input.descriptors);
        if (Array.isArray(parsed)) {
          rawVector = parsed;
        } else {
          throw new Error();
        }
      } catch {
        throw new AppError(
          "Malformed descriptor string; must be JSON array of numbers",
          400,
          "MALFORMED_DESCRIPTOR"
        );
      }
    } else {
      throw new AppError(
        "A valid numeric face descriptor array is required",
        400,
        "INVALID_DESCRIPTOR"
      );
    }

    if (rawVector.length !== 1024) {
      throw new AppError(
        `Descriptor vector dimension mismatch: expected 1024 floats, received ${rawVector.length}`,
        400,
        "INVALID_DESCRIPTOR_DIMENSION"
      );
    }

    // 5. Numeric & Finite Values Validation (No NaN, no Infinity)
    let sumSq = 0;
    for (let i = 0; i < rawVector.length; i++) {
      const val = rawVector[i];
      if (typeof val !== "number" || !Number.isFinite(val)) {
        throw new AppError(
          `Descriptor vector contains non-finite number at index ${i}`,
          400,
          "INVALID_DESCRIPTOR_VALUES"
        );
      }
      sumSq += val * val;
    }

    // 6. Normalization Validation
    const norm = Math.sqrt(sumSq);
    if (Math.abs(norm - 1.0) > 0.15 || norm < 0.1) {
      throw new AppError(
        `Descriptor vector is not properly normalized (L2 norm: ${norm.toFixed(3)})`,
        400,
        "UNNORMALIZED_DESCRIPTOR"
      );
    }

    // Re-normalize to exact unit length
    const normalizedDescriptor = rawVector.map((v) => v / norm);

    // 7. Encrypt Descriptors at Rest (Versioned AES-256-GCM Envelope)
    const encryptedPayload = encryptDescriptor(normalizedDescriptor, CURRENT_KEY_VERSION);

    // 8. Transactional Upsert & Audit Logging
    const enrollment = await prisma.$transaction(async (tx) => {
      const isReenrollment = Boolean(student.faceEnrollment);

      const savedEnrollment = await tx.faceEnrollment.upsert({
        where: { studentId },
        create: {
          studentId,
          provider,
          modelVersion,
          descriptors: encryptedPayload,
          status: "ACTIVE",
          consentVersion: consent.consentVersion,
          consentedAt: consent.consentedAt,
          enrolledAt: new Date(),
        },
        update: {
          provider,
          modelVersion,
          descriptors: encryptedPayload,
          status: "ACTIVE",
          consentVersion: consent.consentVersion,
          consentedAt: consent.consentedAt,
          consentRevokedAt: null,
          enrolledAt: new Date(),
          deletedAt: null,
        },
      });

      // Audit log (Never log vector or raw image)
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: isReenrollment ? "BIOMETRIC_RE_ENROLLED" : "BIOMETRIC_ENROLLED",
          entityType: "FaceEnrollment",
          entityId: studentId,
          metadata: JSON.stringify({
            provider,
            modelVersion,
            keyVersion: CURRENT_KEY_VERSION,
            consentVersion: consent.consentVersion,
            consentedAt: consent.consentedAt.toISOString(),
            enrolledAt: savedEnrollment.enrolledAt.toISOString(),
          }),
        },
      });

      return savedEnrollment;
    });

    // Append enrollment lifecycle event to durable ledger to clear any historical quarantine
    try {
      appendBiometricLedgerEvent({
        action: "BIOMETRIC_ENROLLED",
        studentId,
        actorUserId,
        reason: "Biometric face enrollment completed",
      });
    } catch (ledgerErr) {
      console.warn("Warning: Failed to append BIOMETRIC_ENROLLED to durable ledger:", ledgerErr);
    }

    return {
      studentId: enrollment.studentId,
      status: enrollment.status,
      provider: enrollment.provider,
      modelVersion: enrollment.modelVersion,
      consentVersion: enrollment.consentVersion,
      enrolledAt: enrollment.enrolledAt,
      message: "Biometric face enrollment completed and securely stored",
    };
  }

  /**
   * Retrieves enrollment status and metadata (without descriptors).
   */
  async getEnrollmentStatus(studentId: string) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        faceEnrollment: {
          select: {
            id: true,
            status: true,
            provider: true,
            modelVersion: true,
            consentVersion: true,
            consentedAt: true,
            consentRevokedAt: true,
            enrolledAt: true,
            deletedAt: true,
          },
        },
        biometricConsent: true,
      },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
    }

    const consent = student.biometricConsent;
    const enrollment = student.faceEnrollment;

    return {
      studentId,
      hasConsent: Boolean(consent && consent.status === "GRANTED" && !consent.revokedAt),
      consentStatus: consent?.status || "NO_RECORD",
      consentVersion: consent?.consentVersion || null,
      consentedAt: consent?.consentedAt || null,
      isEnrolled: Boolean(enrollment && enrollment.status === "ACTIVE"),
      enrollmentStatus: enrollment?.status || "NOT_ENROLLED",
      provider: enrollment?.provider || null,
      modelVersion: enrollment?.modelVersion || null,
      enrolledAt: enrollment?.enrolledAt || null,
      deletedAt: enrollment?.deletedAt || null,
    };
  }

  /**
   * Revokes biometric enrollment (immediate matching deactivation).
   * Persists to out-of-band durable ledger first; fails closed if ledger is unavailable.
   */
  async revokeEnrollment(actorUserId: string, studentId: string, reason?: string) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { faceEnrollment: true, biometricConsent: true },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
    }

    // Idempotency: If enrollment is already revoked or deleted and consent is revoked, return success without duplicate writes
    const alreadyRevoked =
      (!student.faceEnrollment ||
        student.faceEnrollment.status === "REVOKED" ||
        student.faceEnrollment.status === "DELETED") &&
      (!student.biometricConsent || student.biometricConsent.status === "REVOKED");

    if (alreadyRevoked) {
      return {
        studentId,
        status: "REVOKED",
        message: "Biometric enrollment revoked and recognition matching disabled",
      };
    }

    // 1. Append to durable out-of-band biometric lifecycle ledger FIRST (survives database rollback)
    // Deletion/revocation MUST NOT be reported as successful unless recovery data is durably stored.
    try {
      appendBiometricLedgerEvent({
        action: "BIOMETRIC_ENROLLMENT_REVOKED",
        studentId,
        actorUserId,
        reason: reason || "User or admin revocation",
      });
    } catch (ledgerErr) {
      console.error("Critical: Failed to append to biometric lifecycle ledger:", ledgerErr);
      throw new AppError(
        "Biometric revocation failed: durable audit ledger is unavailable. Operation aborted to guarantee recovery integrity.",
        500,
        "BIOMETRIC_LEDGER_ERROR"
      );
    }

    // 2. Persist state change to PostgreSQL database
    await prisma.$transaction(async (tx) => {
      // Mark consent revoked
      if (student.biometricConsent) {
        await tx.biometricConsent.update({
          where: { studentId },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            revocationReason: reason || "User or admin revocation",
          },
        });
      }

      // Mark enrollment revoked
      if (student.faceEnrollment) {
        await tx.faceEnrollment.update({
          where: { studentId },
          data: {
            status: "REVOKED",
            consentRevokedAt: new Date(),
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "BIOMETRIC_ENROLLMENT_REVOKED",
          entityType: "FaceEnrollment",
          entityId: studentId,
          metadata: JSON.stringify({
            reason: reason || "Revocation requested",
            timestamp: new Date().toISOString(),
          }),
        },
      });
    });

    return {
      studentId,
      status: "REVOKED",
      message: "Biometric enrollment revoked and recognition matching disabled",
    };
  }

  /**
   * Permanently deletes biometric descriptor embedding data from active database storage.
   * Persists to out-of-band durable ledger first; fails closed if ledger write fails.
   * Preserves historical attendance records and audit logs.
   */
  async deleteEnrollment(actorUserId: string, studentId: string) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { faceEnrollment: true, biometricConsent: true },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
    }

    // Idempotency: If enrollment is already DELETED with empty descriptors and consent is REVOKED, return success directly
    const alreadyDeleted =
      (!student.faceEnrollment ||
        (student.faceEnrollment.status === "DELETED" && (!student.faceEnrollment.descriptors || student.faceEnrollment.descriptors === ""))) &&
      (!student.biometricConsent || student.biometricConsent.status === "REVOKED");

    if (alreadyDeleted) {
      return {
        studentId,
        status: "DELETED",
        message: "Biometric descriptors permanently purged and consent revoked",
      };
    }

    // 1. Append to durable out-of-band biometric lifecycle ledger FIRST (survives database rollback)
    // Deletion MUST NOT be reported as successful unless recovery data is durably stored.
    try {
      appendBiometricLedgerEvent({
        action: "BIOMETRIC_DELETED",
        studentId,
        actorUserId,
        reason: "Biometric descriptors permanently purged",
      });
    } catch (ledgerErr) {
      console.error("Critical: Failed to append to biometric lifecycle ledger:", ledgerErr);
      throw new AppError(
        "Biometric deletion failed: durable audit ledger is unavailable. Operation aborted to guarantee recovery integrity.",
        500,
        "BIOMETRIC_LEDGER_ERROR"
      );
    }

    // 2. Purge descriptors and update PostgreSQL database
    await prisma.$transaction(async (tx) => {
      // Revoke consent
      if (student.biometricConsent) {
        await tx.biometricConsent.update({
          where: { studentId },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            revocationReason: "Biometric data deletion requested",
          },
        });
      }

      // Purge descriptors and mark deleted
      if (student.faceEnrollment) {
        await tx.faceEnrollment.update({
          where: { studentId },
          data: {
            status: "DELETED",
            descriptors: "", // Purge embedding vector
            deletedAt: new Date(),
            consentRevokedAt: new Date(),
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "BIOMETRIC_DELETED",
          entityType: "FaceEnrollment",
          entityId: studentId,
          metadata: JSON.stringify({
            timestamp: new Date().toISOString(),
            purgedDescriptors: true,
          }),
        },
      });
    });

    return {
      studentId,
      status: "DELETED",
      message: "Biometric descriptors permanently purged and consent revoked",
    };
  }

  /**
   * Internal helper for attendance session recognition:
   * Retrieves decrypted normalized candidate vectors for a specific student list.
   * Strictly filters out non-ACTIVE, deleted, or revoked enrollments.
   */
  async getActiveDecryptedDescriptors(studentIds: string[]) {
    // Quarantine Gate: Immediately exclude any student with a recorded deletion in the durable ledger,
    // ensuring recognition CANNOT use an enrollment with a pending durable deletion event even if DB failed.
    const quarantinedIds = getQuarantinedStudentIds();
    const eligibleStudentIds = studentIds.filter((id) => !quarantinedIds.has(id));

    if (eligibleStudentIds.length === 0) {
      return [];
    }

    const enrollments = await prisma.faceEnrollment.findMany({
      where: {
        studentId: { in: eligibleStudentIds },
        status: "ACTIVE",
        deletedAt: null,
        consentRevokedAt: null,
      },
      select: {
        studentId: true,
        provider: true,
        modelVersion: true,
        descriptors: true,
      },
    });

    return enrollments
      .map((e) => {
        try {
          const vector = decryptDescriptor(e.descriptors);
          if (vector.length === 0) return null;
          return {
            studentId: e.studentId,
            payload: {
              provider: e.provider,
              modelVersion: e.modelVersion,
              dimension: vector.length,
              descriptor: vector,
            },
          };
        } catch {
          return null;
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }
}

export const enrollmentService = new EnrollmentService();
