import {
  Role,
  SessionStatus,
  StudentStatus,
  AttendanceStatus,
  AttendanceMethod,
} from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  SessionCreateInput,
  AttendanceMarkInput,
  AttendanceCorrectionInput,
  SessionFaceRecognizeInput,
  SessionConfirmRecognitionInput,
} from "@smart-attendance/shared";
import { HumanFaceRecognitionProvider } from "../recognition/human.provider.js";
import { FaceDescriptorPayload } from "../recognition/provider.interface.js";
import { enrollmentService } from "../enrollment/enrollment.service.js";
import { notificationsService } from "../notifications/notifications.service.js";

export class SessionsService {
  /**
   * Creates an attendance session.
   * Authorized teachers can open a session only for an assigned, valid timetable entry or subject/class assignment.
   * Prevents concurrent duplicate active sessions for the same class and subject.
   */
  async createSession(
    actorUserId: string,
    actorRole: Role,
    input: SessionCreateInput
  ) {
    let classId = input.classId;
    let subjectId = input.subjectId;
    let teacherUserId = actorUserId;
    let timetableEntryId = input.timetableEntryId || null;

    // 1. Resolve & Validate Timetable Entry if specified
    if (timetableEntryId) {
      const entry = await prisma.timetableEntry.findUnique({
        where: { id: timetableEntryId },
        include: {
          teacherAssignment: true,
          class: true,
          subject: true,
        },
      });

      if (!entry) {
        throw new AppError("Timetable entry not found", 404, "TIMETABLE_ENTRY_NOT_FOUND");
      }

      if (!entry.teacherAssignment.active) {
        throw new AppError(
          "Teacher assignment for this timetable entry is inactive",
          400,
          "TEACHER_ASSIGNMENT_INACTIVE"
        );
      }

      // Teacher authorization check
      if (
        actorRole === Role.TEACHER &&
        entry.teacherAssignment.teacherUserId !== actorUserId
      ) {
        throw new AppError(
          "You are not assigned to teach this timetable entry",
          403,
          "TEACHER_NOT_ASSIGNED"
        );
      }

      classId = entry.classId;
      subjectId = entry.subjectId;
      teacherUserId = entry.teacherAssignment.teacherUserId;
    } else {
      // Direct class & subject assignment verification
      if (!classId || !subjectId) {
        throw new AppError(
          "Either timetableEntryId or both classId and subjectId must be provided",
          400,
          "BAD_REQUEST"
        );
      }

      const assignment = await prisma.teacherAssignment.findFirst({
        where: {
          classId,
          subjectId,
          active: true,
          ...(actorRole === Role.TEACHER ? { teacherUserId: actorUserId } : {}),
        },
      });

      if (!assignment) {
        throw new AppError(
          "No active teacher assignment found for this class and subject",
          403,
          "TEACHER_NOT_ASSIGNED"
        );
      }

      teacherUserId = assignment.teacherUserId;
    }

    // 2. Duplicate Active Session Check
    // If an ACTIVE session already exists for this class and subject, return it directly
    // so 1-click start from timetable or session dashboard seamlessly opens the live session.
    const existingActive = await prisma.attendanceSession.findFirst({
      where: {
        classId,
        subjectId,
        status: SessionStatus.ACTIVE,
      },
      include: {
        class: { select: { id: true, label: true, division: true, semesterNumber: true } },
        subject: { select: { id: true, code: true, name: true } },
        teacher: { select: { id: true, name: true, email: true } },
      },
    });

    if (existingActive) {
      throw new AppError(
        "An active attendance session already exists for this class and subject",
        409,
        "ACTIVE_SESSION_EXISTS"
      );
    }

    // 3. Create Session Transactionally with Audit Log
    const session = await prisma.$transaction(async (tx) => {
      const created = await tx.attendanceSession.create({
        data: {
          timetableEntryId,
          classId: classId!,
          subjectId: subjectId!,
          teacherUserId,
          startsAt: input.startsAt ? new Date(input.startsAt) : new Date(),
          endsAt: input.endsAt ? new Date(input.endsAt) : null,
          status: SessionStatus.ACTIVE,
        },
        include: {
          class: { select: { id: true, label: true, division: true, semesterNumber: true } },
          subject: { select: { id: true, code: true, name: true } },
          teacher: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ATTENDANCE_SESSION_CREATED",
          entityType: "AttendanceSession",
          entityId: created.id,
          metadata: JSON.stringify({
            classId,
            subjectId,
            teacherUserId,
            timetableEntryId,
            startsAt: created.startsAt.toISOString(),
          }),
        },
      });

      return created;
    });

    return session;
  }

  /**
   * Lists attendance sessions with role-scoped filtering.
   */
  async listSessions(
    actorUserId: string,
    actorRole: Role,
    query: {
      classId?: string;
      subjectId?: string;
      status?: SessionStatus;
      dateFrom?: string;
      dateTo?: string;
      page?: number;
      limit?: number;
    }
  ) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    // Role-based visibility
    if (actorRole === Role.TEACHER) {
      where.teacherUserId = actorUserId;
    }

    if (query.classId) where.classId = query.classId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.status) where.status = query.status;

    if (query.dateFrom || query.dateTo) {
      where.startsAt = {};
      if (query.dateFrom) where.startsAt.gte = new Date(query.dateFrom);
      if (query.dateTo) where.startsAt.lte = new Date(query.dateTo);
    }

    const [sessions, total] = await Promise.all([
      prisma.attendanceSession.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startsAt: "desc" },
        include: {
          class: { select: { id: true, label: true, division: true, semesterNumber: true } },
          subject: { select: { id: true, code: true, name: true } },
          teacher: { select: { id: true, name: true, email: true } },
          _count: { select: { records: true } },
        },
      }),
      prisma.attendanceSession.count({ where }),
    ]);

    return {
      sessions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Retrieves single session details, attendance counts, and eligible student roster.
   */
  async getSessionById(actorUserId: string, actorRole: Role, sessionId: string) {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
      include: {
        class: { select: { id: true, label: true, division: true, semesterNumber: true } },
        subject: { select: { id: true, code: true, name: true } },
        teacher: { select: { id: true, name: true, email: true } },
        timetableEntry: {
          select: {
            id: true,
            dayOfWeek: true,
            startTime: true,
            endTime: true,
            room: true,
          },
        },
      },
    });

    if (!session) {
      throw new AppError("Attendance session not found", 404, "SESSION_NOT_FOUND");
    }

    // Teacher authorization: assigned teacher or Admin
    if (actorRole !== Role.ADMIN && (actorRole !== Role.TEACHER || session.teacherUserId !== actorUserId)) {
      throw new AppError("You are not authorized to access this session", 403, "FORBIDDEN");
    }

    // 1. Fetch all eligible active students in this class
    const eligibleStudents = await prisma.student.findMany({
      where: {
        classId: session.classId,
        status: StudentStatus.ACTIVE,
      },
      select: {
        id: true,
        rollNumber: true,
        name: true,
        email: true,
        faceEnrollment: {
          select: { status: true, modelVersion: true, enrolledAt: true },
        },
        biometricConsent: {
          select: { status: true, consentedAt: true, revokedAt: true },
        },
      },
      orderBy: { rollNumber: "asc" },
    });

    // 2. Fetch existing attendance records for this session
    const records = await prisma.attendanceRecord.findMany({
      where: { sessionId },
      select: {
        id: true,
        studentId: true,
        status: true,
        method: true,
        confidence: true,
        markedAt: true,
        correctionReason: true,
      },
    });

    const recordMap = new Map(records.map((r) => [r.studentId, r]));

    // 3. Build augmented roster
    let presentCount = 0;
    let absentCount = 0;
    let lateCount = 0;
    let excusedCount = 0;

    const roster = eligibleStudents.map((s) => {
      const rec = recordMap.get(s.id);
      if (rec) {
        if (rec.status === AttendanceStatus.PRESENT) presentCount++;
        else if (rec.status === AttendanceStatus.ABSENT) absentCount++;
        else if (rec.status === AttendanceStatus.LATE) lateCount++;
        else if (rec.status === AttendanceStatus.EXCUSED) excusedCount++;
      }

      return {
        studentId: s.id,
        rollNumber: s.rollNumber,
        name: s.name,
        email: s.email,
        hasActiveBiometric: Boolean(
          s.faceEnrollment?.status === "ACTIVE" &&
            s.biometricConsent?.status === "GRANTED" &&
            !s.biometricConsent.revokedAt
        ),
        attendance: rec || null,
      };
    });

    const totalStudents = eligibleStudents.length;
    const recordedCount = records.length;
    const unrecordedCount = totalStudents - recordedCount;

    return {
      session,
      summary: {
        totalStudents,
        recordedCount,
        unrecordedCount,
        presentCount,
        absentCount,
        lateCount,
        excusedCount,
      },
      roster,
    };
  }

  /**
   * Transitions a session from SCHEDULED -> ACTIVE.
   */
  async startSession(actorUserId: string, actorRole: Role, sessionId: string) {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError("Attendance session not found", 404, "SESSION_NOT_FOUND");
    }

    if (actorRole === Role.TEACHER && session.teacherUserId !== actorUserId) {
      throw new AppError("You are not authorized to start this session", 403, "FORBIDDEN");
    }

    if (session.status === SessionStatus.ACTIVE) {
      return { session, message: "Session is already active" };
    }

    if (
      session.status === SessionStatus.COMPLETED ||
      session.status === SessionStatus.CANCELLED
    ) {
      throw new AppError(
        `Cannot start session in ${session.status} state`,
        400,
        "INVALID_STATE_TRANSITION"
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.attendanceSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.ACTIVE,
          startsAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ATTENDANCE_SESSION_STARTED",
          entityType: "AttendanceSession",
          entityId: sessionId,
          metadata: JSON.stringify({ startedAt: res.startsAt.toISOString() }),
        },
      });

      return res;
    });

    return { session: updated, message: "Session started successfully" };
  }

  /**
   * Transitions an ACTIVE session -> COMPLETED (safe finalization).
   */
  async closeSession(actorUserId: string, actorRole: Role, sessionId: string) {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError("Attendance session not found", 404, "SESSION_NOT_FOUND");
    }

    if (actorRole === Role.TEACHER && session.teacherUserId !== actorUserId) {
      throw new AppError("You are not authorized to close this session", 403, "FORBIDDEN");
    }

    if (session.status === SessionStatus.COMPLETED) {
      return { session, message: "Session is already completed" };
    }

    if (session.status === SessionStatus.CANCELLED) {
      throw new AppError("Cannot close a cancelled session", 400, "SESSION_CANCELLED");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const res = await tx.attendanceSession.update({
        where: { id: sessionId },
        data: {
          status: SessionStatus.COMPLETED,
          closedAt: now,
          endsAt: session.endsAt || now,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ATTENDANCE_SESSION_CLOSED",
          entityType: "AttendanceSession",
          entityId: sessionId,
          metadata: JSON.stringify({ closedAt: now.toISOString() }),
        },
      });

      return res;
    });

    return { session: updated, message: "Session closed and finalized successfully" };
  }

  /**
   * Transactional attendance recording with duplicate prevention and eligibility validation.
   */
  async markAttendance(
    actorUserId: string,
    actorRole: Role,
    sessionId: string,
    input: AttendanceMarkInput | { records: AttendanceMarkInput[] }
  ) {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError("Attendance session not found", 404, "SESSION_NOT_FOUND");
    }

    if (actorRole === Role.TEACHER && session.teacherUserId !== actorUserId) {
      throw new AppError("You are not authorized to mark attendance for this session", 403, "FORBIDDEN");
    }

    // Session status check: MUST be ACTIVE
    if (session.status !== SessionStatus.ACTIVE) {
      throw new AppError(
        `Attendance can only be recorded during an ACTIVE session (current status: ${session.status})`,
        400,
        "SESSION_NOT_ACTIVE"
      );
    }

    const recordsToProcess: AttendanceMarkInput[] =
      "records" in input && Array.isArray(input.records)
        ? input.records
        : [input as AttendanceMarkInput];

    if (recordsToProcess.length === 0) {
      throw new AppError("At least one attendance record must be provided", 400, "BAD_REQUEST");
    }

    const studentIds = recordsToProcess.map((r) => r.studentId);

    // Transactional validation and Upsert / Insertion
    const results = await prisma.$transaction(async (tx) => {
      // Re-verify session status inside transaction with FOR SHARE row lock
      const sessionRows: Array<{ id: string; status: SessionStatus; classId: string }> = await tx.$queryRaw`
        SELECT id, status, "classId" FROM "AttendanceSession" WHERE id = ${sessionId} FOR SHARE
      `;
      const currentSession = sessionRows[0];
      if (!currentSession || currentSession.status !== SessionStatus.ACTIVE) {
        throw new AppError(
          `Attendance can only be recorded during an ACTIVE session (current status: ${currentSession?.status})`,
          400,
          "SESSION_NOT_ACTIVE"
        );
      }

      // 1. Fetch and validate all students within transaction to prevent TOCTOU race
      const students = await tx.student.findMany({
        where: { id: { in: studentIds } },
        include: {
          biometricConsent: true,
          faceEnrollment: true,
        },
      });

      const studentMap = new Map(students.map((s) => [s.id, s]));

      for (const rec of recordsToProcess) {
        const student = studentMap.get(rec.studentId);
        if (!student) {
          throw new AppError(`Student ${rec.studentId} not found`, 404, "STUDENT_NOT_FOUND");
        }

        // Enforce class cohort membership
        if (student.classId !== currentSession.classId) {
          throw new AppError(
            `Student ${student.name} (${student.rollNumber}) is not enrolled in this session's class cohort`,
            400,
            "STUDENT_NOT_IN_CLASS"
          );
        }

        // Enforce student active status
        if (student.status !== StudentStatus.ACTIVE) {
          throw new AppError(
            `Student ${student.name} (${student.rollNumber}) is in ${student.status} status and cannot be marked present`,
            400,
            "STUDENT_NOT_ACTIVE"
          );
        }

        // If method is FACE_RECOGNITION, re-verify active consent and active enrollment
        if (rec.method === AttendanceMethod.FACE_RECOGNITION) {
          const hasConsent = Boolean(
            student.biometricConsent &&
              student.biometricConsent.status === "GRANTED" &&
              !student.biometricConsent.revokedAt
          );
          if (!hasConsent) {
            throw new AppError(
              `Student ${student.name} does not have valid active biometric consent`,
              400,
              "CONSENT_REQUIRED_FOR_BIOMETRIC"
            );
          }

          const isEnrolled = Boolean(
            student.faceEnrollment &&
              student.faceEnrollment.status === "ACTIVE" &&
              !student.faceEnrollment.consentRevokedAt &&
              !student.faceEnrollment.deletedAt
          );
          if (!isEnrolled) {
            throw new AppError(
              `Student ${student.name} does not have an active facial biometric enrollment`,
              400,
              "BIOMETRIC_ENROLLMENT_REQUIRED"
            );
          }
        }
      }

      const marked = [];

      for (const rec of recordsToProcess) {
        const existing = await tx.attendanceRecord.findUnique({
          where: {
            studentId_sessionId: {
              studentId: rec.studentId,
              sessionId,
            },
          },
        });

        if (existing) {
          // Idempotent duplicate protection: update status if changed, emitting audit log
          if (existing.status !== rec.status) {
            const updated = await tx.attendanceRecord.update({
              where: { id: existing.id },
              data: {
                status: rec.status,
                markedByUserId: actorUserId,
                correctionReason: rec.overrideReason || "Teacher status update",
              },
            });

            await tx.auditLog.create({
              data: {
                actorUserId,
                action: "ATTENDANCE_OVERRIDE",
                entityType: "AttendanceRecord",
                entityId: existing.id,
                metadata: JSON.stringify({
                  previousStatus: existing.status,
                  newStatus: rec.status,
                  reason: rec.overrideReason || "Teacher status update",
                  sessionId,
                }),
              },
            });

            marked.push(updated);
          } else {
            // Exactly matching record, return existing idempotently
            marked.push(existing);
          }
        } else {
          // Fresh attendance write
          const created = await tx.attendanceRecord.create({
            data: {
              studentId: rec.studentId,
              sessionId,
              status: rec.status,
              method:
                rec.method ||
                (actorRole === Role.ADMIN
                  ? AttendanceMethod.MANUAL_ADMIN
                  : AttendanceMethod.MANUAL_TEACHER),
              confidence: rec.confidence,
              markedByUserId: actorUserId,
              markedAt: new Date(),
            },
          });
          marked.push(created);
        }
      }

      return marked;
    }, { maxWait: 5000, timeout: 10000 });

    return {
      success: true,
      count: results.length,
      records: results,
      message: `Successfully marked attendance for ${results.length} student(s)`,
    };
  }

  /**
   * Corrects an existing attendance record (requires audit reason).
   */
  async correctAttendanceRecord(
    actorUserId: string,
    actorRole: Role,
    recordId: string,
    input: AttendanceCorrectionInput
  ) {
    const record = await prisma.attendanceRecord.findUnique({
      where: { id: recordId },
      include: { session: true },
    });

    if (!record) {
      throw new AppError("Attendance record not found", 404, "RECORD_NOT_FOUND");
    }

    if (actorRole === Role.TEACHER && record.session.teacherUserId !== actorUserId) {
      throw new AppError("You are not authorized to correct records for this session", 403, "FORBIDDEN");
    }

    if (record.session.status === SessionStatus.CANCELLED) {
      throw new AppError("Cannot correct attendance for a cancelled session", 400, "SESSION_CANCELLED");
    }

    const trimmedReason = input.correctionReason.trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      throw new AppError("A correction reason of at least 5 characters is mandatory", 400, "CORRECTION_REASON_REQUIRED");
    }

    // Idempotent duplicate submission: if status and reason already match, return existing record without duplicate audit entry
    if (record.status === input.status && record.correctionReason === trimmedReason) {
      return record;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.attendanceRecord.update({
        where: { id: recordId },
        data: {
          status: input.status,
          correctionReason: input.correctionReason.trim(),
          markedByUserId: actorUserId,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ATTENDANCE_CORRECTED",
          entityType: "AttendanceRecord",
          entityId: recordId,
          metadata: JSON.stringify({
            sessionId: record.sessionId,
            studentId: record.studentId,
            previousStatus: record.status,
            newStatus: input.status,
            correctionReason: input.correctionReason.trim(),
            actorRole,
          }),
        },
      });

      return res;
    });

    // Asynchronously re-evaluate student's low-attendance alerts to update or resolve active warnings
    notificationsService.evaluateStudentAlerts(record.studentId).catch((err) => {
      console.error("Failed to re-evaluate alerts after attendance correction:", err);
    });

    return updated;
  }

  /**
   * Evaluates untrusted probe vector against active, consented students in the session's class cohort.
   * Enforces model version compatibility, threshold (>= 0.82), ambiguity margin (0.08), and active session state.
   */
  async recognizeFace(
    actorUserId: string,
    actorRole: Role,
    sessionId: string,
    input: SessionFaceRecognizeInput
  ) {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError("Attendance session not found", 404, "SESSION_NOT_FOUND");
    }

    if (actorRole === Role.TEACHER && session.teacherUserId !== actorUserId) {
      throw new AppError("You are not authorized for this attendance session", 403, "FORBIDDEN");
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new AppError(
        `Face recognition is only permitted during an ACTIVE session (current status: ${session.status})`,
        400,
        "SESSION_NOT_ACTIVE"
      );
    }

    // 1. Untrusted client probe vector validation
    const providerName = input.provider || "human";
    const modelVersion = input.modelVersion || "faceres-v1";

    if (providerName !== "human" || modelVersion !== "faceres-v1") {
      throw new AppError(
        `Incompatible recognition model: server requires provider 'human' and modelVersion 'faceres-v1'`,
        400,
        "INCOMPATIBLE_MODEL"
      );
    }

    if (!Array.isArray(input.descriptor) || input.descriptor.length < 64) {
      throw new AppError("Invalid face descriptor: minimum 64 floating point dimensions required", 400, "BAD_REQUEST");
    }

    for (const val of input.descriptor) {
      if (typeof val !== "number" || !Number.isFinite(val)) {
        throw new AppError("Invalid face descriptor: all vector elements must be finite numbers", 400, "BAD_REQUEST");
      }
    }

    // 2. Fetch eligible students in class cohort with ACTIVE status
    const cohortStudents = await prisma.student.findMany({
      where: {
        classId: session.classId,
        status: StudentStatus.ACTIVE,
      },
      select: { id: true, name: true, rollNumber: true, email: true },
    });

    if (cohortStudents.length === 0) {
      return {
        outcome: "NO_MATCH",
        confidence: 0,
        message: "No active students enrolled in this session's class cohort",
      };
    }

    const cohortStudentIds = cohortStudents.map((s) => s.id);
    const studentMap = new Map(cohortStudents.map((s) => [s.id, s]));

    // 3. Retrieve decrypted candidate descriptors for active enrollments
    const rawCandidates = await enrollmentService.getActiveDecryptedDescriptors(cohortStudentIds);

    // 4. Verify that each candidate also has active biometric consent
    const activeConsents = await prisma.biometricConsent.findMany({
      where: {
        studentId: { in: rawCandidates.map((c) => c.studentId) },
        status: "GRANTED",
        revokedAt: null,
      },
      select: { studentId: true },
    });
    const consentedStudentIds = new Set(activeConsents.map((c) => c.studentId));

    const validCandidates = rawCandidates.filter((c) => consentedStudentIds.has(c.studentId));

    if (validCandidates.length === 0) {
      return {
        outcome: "NO_MATCH",
        confidence: 0,
        message: "No students in this cohort have active biometric enrollment and consent",
      };
    }

    // 5. Match probe against cohort candidate vectors
    const recognitionProvider = new HumanFaceRecognitionProvider();
    const probePayload: FaceDescriptorPayload = {
      provider: providerName,
      modelVersion,
      dimension: input.descriptor.length,
      descriptor: input.descriptor,
    };

    const matchResult = await recognitionProvider.matchFace(probePayload, validCandidates, {
      matchThreshold: 0.82,
      ambiguityMargin: 0.08,
    });

    if (matchResult.outcome === "INCOMPATIBLE_MODEL") {
      throw new AppError(matchResult.message, 400, "INCOMPATIBLE_MODEL");
    }

    if (matchResult.outcome === "NO_MATCH") {
      return {
        outcome: "NO_MATCH",
        confidence: matchResult.confidence,
        message: matchResult.message || "No matching enrolled student detected in this cohort",
      };
    }

    if (matchResult.outcome === "UNCERTAIN_MATCH") {
      const topStudent = matchResult.studentId ? studentMap.get(matchResult.studentId) : null;
      const runnerUpStudent = matchResult.runnerUpStudentId ? studentMap.get(matchResult.runnerUpStudentId) : null;

      let isAlreadyMarked = false;
      let existingRecord = null;
      if (topStudent) {
        existingRecord = await prisma.attendanceRecord.findUnique({
          where: { studentId_sessionId: { studentId: topStudent.id, sessionId } },
        });
        isAlreadyMarked = Boolean(existingRecord);
      }

      return {
        outcome: "UNCERTAIN_MATCH",
        confidence: matchResult.confidence,
        candidate: topStudent,
        runnerUp: runnerUpStudent,
        runnerUpConfidence: matchResult.runnerUpConfidence,
        ambiguityMargin: matchResult.ambiguityMargin,
        isAlreadyMarked,
        existingRecord,
        requiresTeacherConfirmation: true,
        message: "Ambiguous or borderline facial match. Teacher confirmation required.",
      };
    }

    // Confident match found (>= 0.82, margin >= 0.08)
    const matchedStudent = studentMap.get(matchResult.studentId!);
    if (!matchedStudent) {
      return {
        outcome: "NO_MATCH",
        confidence: matchResult.confidence,
        message: "Matched student not found in active cohort",
      };
    }

    // Check duplicate attendance
    const existingRecord = await prisma.attendanceRecord.findUnique({
      where: {
        studentId_sessionId: {
          studentId: matchedStudent.id,
          sessionId,
        },
      },
    });

    if (existingRecord) {
      return {
        outcome: "MATCH_FOUND",
        confidence: matchResult.confidence,
        candidate: matchedStudent,
        isAlreadyMarked: true,
        existingRecord,
        message: `Student ${matchedStudent.name} (${matchedStudent.rollNumber}) is already marked ${existingRecord.status}`,
      };
    }

    // Recognition serves strictly as an identity assistant; a recognition result alone must never finalize attendance.
    // Teacher confirmation is always required to record or modify attendance.
    return {
      outcome: "MATCH_FOUND",
      confidence: matchResult.confidence,
      candidate: matchedStudent,
      isAlreadyMarked: false,
      recorded: false,
      requiresTeacherConfirmation: true,
      message: `Matched ${matchedStudent.name} (${matchedStudent.rollNumber}) with ${(matchResult.confidence * 100).toFixed(1)}% confidence`,
    };
  }

  /**
   * Explicit teacher confirmation of a recognized facial candidate or manual override.
   * Atomically re-validates session status, student eligibility, biometric consent, and enrollment inside the transaction
   * to eliminate TOCTOU race conditions with concurrent consent revocation.
   */
  async confirmRecognition(
    actorUserId: string,
    actorRole: Role,
    sessionId: string,
    input: SessionConfirmRecognitionInput
  ) {
    const session = await prisma.attendanceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new AppError("Attendance session not found", 404, "SESSION_NOT_FOUND");
    }

    if (actorRole === Role.TEACHER && session.teacherUserId !== actorUserId) {
      throw new AppError("You are not authorized for this attendance session", 403, "FORBIDDEN");
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new AppError(
        `Attendance can only be confirmed during an ACTIVE session (current status: ${session.status})`,
        400,
        "SESSION_NOT_ACTIVE"
      );
    }

    const record = await prisma.$transaction(async (tx) => {
      // 1. Transactional active session row lock & re-verification (serializes with closeSession)
      const sessionRows: Array<{ id: string; status: SessionStatus; classId: string }> = await tx.$queryRaw`
        SELECT id, status, "classId" FROM "AttendanceSession" WHERE id = ${sessionId} FOR SHARE
      `;
      const currentSession = sessionRows[0];
      if (!currentSession || currentSession.status !== SessionStatus.ACTIVE) {
        throw new AppError("Attendance session is not active", 400, "SESSION_NOT_ACTIVE");
      }

      // 2. Transactional student status and class cohort re-verification
      const currentStudent = await tx.student.findUnique({
        where: { id: input.studentId },
      });

      if (!currentStudent) {
        throw new AppError("Student not found", 404, "STUDENT_NOT_FOUND");
      }

      if (currentStudent.classId !== currentSession.classId) {
        throw new AppError(
          `Student ${currentStudent.name} is not enrolled in this session's class cohort`,
          400,
          "STUDENT_NOT_IN_CLASS"
        );
      }

      if (currentStudent.status !== StudentStatus.ACTIVE) {
        throw new AppError(
          `Student ${currentStudent.name} is not in ACTIVE status`,
          400,
          "STUDENT_NOT_ACTIVE"
        );
      }

      // 3. Transactional biometric consent row lock & re-verification (serializes with concurrent consent revocation)
      const consentRows: Array<{ id: string; status: string; revokedAt: Date | null }> = await tx.$queryRaw`
        SELECT id, status, "revokedAt" FROM "BiometricConsent" WHERE "studentId" = ${input.studentId} FOR SHARE
      `;
      const lockedConsent = consentRows[0];
      const hasConsent = Boolean(
        lockedConsent &&
          lockedConsent.status === "GRANTED" &&
          !lockedConsent.revokedAt
      );
      if (!hasConsent) {
        throw new AppError(
          `Student ${currentStudent.name} does not have valid active biometric consent`,
          400,
          "CONSENT_REQUIRED_FOR_BIOMETRIC"
        );
      }

      // 4. Transactional face enrollment row lock & re-verification (serializes with concurrent enrollment deletion)
      const enrollmentRows: Array<{ id: string; status: string; consentRevokedAt: Date | null; deletedAt: Date | null }> = await tx.$queryRaw`
        SELECT id, status, "consentRevokedAt", "deletedAt" FROM "FaceEnrollment" WHERE "studentId" = ${input.studentId} FOR SHARE
      `;
      const lockedEnrollment = enrollmentRows[0];
      const isEnrolled = Boolean(
        lockedEnrollment &&
          lockedEnrollment.status === "ACTIVE" &&
          !lockedEnrollment.consentRevokedAt &&
          !lockedEnrollment.deletedAt
      );
      if (!isEnrolled) {
        throw new AppError(
          `Student ${currentStudent.name} does not have an active biometric enrollment`,
          400,
          "BIOMETRIC_ENROLLMENT_REQUIRED"
        );
      }

      // 5. Existing record check & protection of manual records
      const existing = await tx.attendanceRecord.findUnique({
        where: {
          studentId_sessionId: {
            studentId: currentStudent.id,
            sessionId,
          },
        },
      });

      if (existing) {
        // Idempotent exact duplicate confirmation: no changes and no spurious override log
        if (existing.status === input.status && existing.method === AttendanceMethod.FACE_RECOGNITION) {
          return { record: existing, student: currentStudent };
        }

        // Protect manual teacher records from accidental unreasoned clobbering
        if (existing.method === AttendanceMethod.MANUAL_TEACHER && !input.overrideReason) {
          throw new AppError(
            `Student ${currentStudent.name} already has a manual teacher attendance record. Provide an explicit overrideReason to update.`,
            400,
            "MANUAL_RECORD_EXISTS"
          );
        }

        const updated = await tx.attendanceRecord.update({
          where: { id: existing.id },
          data: {
            status: input.status,
            method: AttendanceMethod.FACE_RECOGNITION,
            confidence: input.confidence,
            markedByUserId: actorUserId,
            correctionReason: input.overrideReason || "Teacher confirmed facial recognition override",
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId,
            action: "ATTENDANCE_OVERRIDE",
            entityType: "AttendanceRecord",
            entityId: updated.id,
            metadata: JSON.stringify({
              studentId: currentStudent.id,
              sessionId,
              previousStatus: existing.status,
              previousMethod: existing.method,
              newStatus: input.status,
              confidence: input.confidence,
              method: AttendanceMethod.FACE_RECOGNITION,
              overrideReason: input.overrideReason || "Teacher confirmed facial recognition override",
            }),
          },
        });

        return { record: updated, student: currentStudent };
      }

      // 6. Atomic upsert for initial confirmation under concurrent submissions
      const upserted = await tx.attendanceRecord.upsert({
        where: {
          studentId_sessionId: {
            studentId: currentStudent.id,
            sessionId,
          },
        },
        update: {
          status: input.status,
          method: AttendanceMethod.FACE_RECOGNITION,
          confidence: input.confidence,
          markedByUserId: actorUserId,
          correctionReason: input.overrideReason || "Teacher confirmed facial recognition",
        },
        create: {
          studentId: currentStudent.id,
          sessionId,
          status: input.status,
          method: AttendanceMethod.FACE_RECOGNITION,
          confidence: input.confidence,
          markedByUserId: actorUserId,
          correctionReason: input.overrideReason,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId,
          action: "ATTENDANCE_RECORDED_RECOGNITION",
          entityType: "AttendanceRecord",
          entityId: upserted.id,
          metadata: JSON.stringify({
            studentId: currentStudent.id,
            rollNumber: currentStudent.rollNumber,
            confidence: input.confidence,
            method: AttendanceMethod.FACE_RECOGNITION,
            status: input.status,
            overrideReason: input.overrideReason,
          }),
        },
      });

      return { record: upserted, student: currentStudent };
    }, { maxWait: 5000, timeout: 10000 });

    return {
      record: record.record,
      student: { id: record.student.id, name: record.student.name, rollNumber: record.student.rollNumber },
      message: `Attendance confirmed and recorded for ${record.student.name} (${record.student.rollNumber})`,
    };
  }
}

export const sessionsService = new SessionsService();
