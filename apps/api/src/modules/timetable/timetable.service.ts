import {
  TimetableEntryInput,
  TimetableEntryUpdateInput,
} from "@smart-attendance/shared";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { AuthenticatedUser } from "../../middleware/auth.js";
import { formatCsvRow, sanitizeFilename, UTF8_BOM } from "../reports/csv-export.util.js";

export interface TimetableListQuery {
  classId?: string;
  teacherUserId?: string;
  subjectId?: string;
  dayOfWeek?: number | string;
  room?: string;
  page?: number;
  limit?: number;
}

/**
 * Checks if two half-open intervals [start1, end1) and [start2, end2) overlap.
 * Format is HH:MM (lexicographically comparable 24-hour time strings).
 */
export function isOverlapping(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): boolean {
  return start1 < end2 && start2 < end1;
}

export class TimetableService {
  async list(query: TimetableListQuery, user?: AuthenticatedUser) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 50));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.classId) where.classId = query.classId;
    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.dayOfWeek !== undefined && query.dayOfWeek !== "") {
      where.dayOfWeek = Number(query.dayOfWeek);
    }
    if (query.room && query.room.trim()) {
      where.room = { contains: query.room.trim(), mode: "insensitive" };
    }
    if (query.teacherUserId) {
      where.teacherAssignment = {
        teacherUserId: query.teacherUserId,
      };
    }

    // Role-based security scoping: non-admins cannot cross boundary
    if (user?.role === Role.TEACHER) {
      where.teacherAssignment = {
        teacherUserId: user.id,
        active: true,
      };
    } else if (user?.role === Role.STUDENT) {
      // Authoritative lookup: link by studentId / userId first to avoid email re-use confusion
      const student = user.studentId
        ? await prisma.student.findUnique({
            where: { id: user.studentId },
            select: { classId: true, status: true },
          })
        : await prisma.student.findFirst({
            where: {
              OR: [{ userId: user.id }, { email: user.email, userId: null }],
            },
            select: { classId: true, status: true },
          });
      if (!student || !student.classId || student.status !== "ACTIVE") {
        where.classId = "NO_ASSIGNED_CLASS";
      } else {
        where.classId = student.classId;
      }
    }

    const [total, entries] = await Promise.all([
      prisma.timetableEntry.count({ where }),
      prisma.timetableEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        include: {
          class: {
            select: {
              id: true,
              label: true,
              semesterNumber: true,
              division: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          teacherAssignment: {
            include: {
              teacher: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          _count: {
            select: { sessions: true },
          },
          sessions: {
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              closedAt: true,
              _count: {
                select: { records: true },
              },
            },
            orderBy: { startsAt: "desc" },
            take: 10,
          },
        },
      }),
    ]);

    return {
      entries,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getMyTimetable(user: AuthenticatedUser) {
    if (user.role === Role.STUDENT) {
      const student = user.studentId
        ? await prisma.student.findUnique({
            where: { id: user.studentId },
            include: {
              class: {
                select: {
                  id: true,
                  label: true,
                  semesterNumber: true,
                  division: true,
                  department: { select: { id: true, name: true, code: true } },
                  academicYear: { select: { id: true, label: true } },
                },
              },
            },
          })
        : await prisma.student.findFirst({
            where: {
              OR: [{ userId: user.id }, { email: user.email, userId: null }],
            },
            include: {
              class: {
                select: {
                  id: true,
                  label: true,
                  semesterNumber: true,
                  division: true,
                  department: { select: { id: true, name: true, code: true } },
                  academicYear: { select: { id: true, label: true } },
                },
              },
            },
          });

      if (!student || !student.classId || student.status !== "ACTIVE") {
        return {
          role: Role.STUDENT,
          hasPlacement: false,
          message: !student
            ? "Student profile not found."
            : student.status === "PENDING"
            ? "Your student registration is pending approval by the administration."
            : student.status === "INACTIVE"
            ? "Your student profile is inactive."
            : "You are not currently assigned to an active class cohort.",
          student: student
            ? {
                id: student.id,
                name: student.name,
                rollNumber: student.rollNumber,
                status: student.status,
              }
            : null,
          class: null,
          entries: [],
        };
      }

      const entries = await prisma.timetableEntry.findMany({
        where: {
          classId: student.classId,
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        include: {
          class: {
            select: {
              id: true,
              label: true,
              semesterNumber: true,
              division: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          teacherAssignment: {
            include: {
              teacher: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          _count: {
            select: { sessions: true },
          },
          sessions: {
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              closedAt: true,
              _count: {
                select: { records: true },
              },
            },
            orderBy: { startsAt: "desc" },
            take: 10,
          },
        },
      });

      return {
        role: Role.STUDENT,
        hasPlacement: true,
        student: {
          id: student.id,
          name: student.name,
          rollNumber: student.rollNumber,
          status: student.status,
        },
        class: student.class,
        entries,
      };
    }

    if (user.role === Role.TEACHER) {
      const activeAssignments = await prisma.teacherAssignment.findMany({
        where: {
          teacherUserId: user.id,
          active: true,
        },
        select: { id: true },
      });

      if (activeAssignments.length === 0) {
        return {
          role: Role.TEACHER,
          hasPlacement: false,
          message: "You currently have no active course teaching assignments.",
          teacher: {
            id: user.id,
            name: user.name,
            email: user.email,
          },
          class: null,
          entries: [],
        };
      }

      const assignmentIds = activeAssignments.map((a) => a.id);
      const entries = await prisma.timetableEntry.findMany({
        where: {
          teacherAssignmentId: { in: assignmentIds },
        },
        orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
        include: {
          class: {
            select: {
              id: true,
              label: true,
              semesterNumber: true,
              division: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          teacherAssignment: {
            include: {
              teacher: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          _count: {
            select: { sessions: true },
          },
          sessions: {
            select: {
              id: true,
              status: true,
              startsAt: true,
              endsAt: true,
              closedAt: true,
              _count: {
                select: { records: true },
              },
            },
            orderBy: { startsAt: "desc" },
            take: 10,
          },
        },
      });

      return {
        role: Role.TEACHER,
        hasPlacement: true,
        teacher: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        class: null,
        entries,
      };
    }

    // Role ADMIN: Return institution-wide timetable entries
    const entries = await prisma.timetableEntry.findMany({
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: {
        class: {
          select: {
            id: true,
            label: true,
            semesterNumber: true,
            division: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        teacherAssignment: {
          include: {
            teacher: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        _count: {
          select: { sessions: true },
        },
        sessions: {
          select: {
            id: true,
            status: true,
            startsAt: true,
            endsAt: true,
            closedAt: true,
            _count: {
              select: { records: true },
            },
          },
          orderBy: { startsAt: "desc" },
          take: 10,
        },
      },
    });

    return {
      role: Role.ADMIN,
      hasPlacement: true,
      entries,
    };
  }

  async exportCsv(
    query: TimetableListQuery,
    user: AuthenticatedUser
  ): Promise<{ filename: string; csv: string }> {
    const where: any = {};

    if (user.role === Role.TEACHER) {
      where.teacherAssignment = {
        teacherUserId: user.id,
        active: true,
      };
      if (query.classId) {
        where.classId = query.classId;
      }
    } else if (user.role === Role.STUDENT) {
      const student = user.studentId
        ? await prisma.student.findUnique({
            where: { id: user.studentId },
            select: { classId: true, status: true, class: { select: { label: true } } },
          })
        : await prisma.student.findFirst({
            where: { OR: [{ userId: user.id }, { email: user.email, userId: null }] },
            select: { classId: true, status: true, class: { select: { label: true } } },
          });

      if (!student || !student.classId || student.status !== "ACTIVE") {
        throw new AppError(
          "No active class placement found for timetable export",
          403,
          "FORBIDDEN"
        );
      }
      where.classId = student.classId;
    } else {
      // ADMIN
      if (query.classId) where.classId = query.classId;
      if (query.teacherUserId) where.teacherAssignment = { teacherUserId: query.teacherUserId };
      if (query.subjectId) where.subjectId = query.subjectId;
    }

    if (query.dayOfWeek !== undefined && query.dayOfWeek !== "" && query.dayOfWeek !== "ALL") {
      where.dayOfWeek = Number(query.dayOfWeek);
    }
    if (query.room && query.room.trim()) {
      where.room = { contains: query.room.trim(), mode: "insensitive" };
    }

    const entries = await prisma.timetableEntry.findMany({
      where,
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: {
        class: {
          select: {
            id: true,
            label: true,
            semesterNumber: true,
            division: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        teacherAssignment: {
          include: {
            teacher: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    const DAY_NAMES: Record<number, string> = {
      1: "Monday",
      2: "Tuesday",
      3: "Wednesday",
      4: "Thursday",
      5: "Friday",
      6: "Saturday",
      7: "Sunday",
    };

    let csv = UTF8_BOM;
    csv += formatCsvRow([
      "Day of Week",
      "Start Time",
      "End Time",
      "Subject Code",
      "Subject Name",
      "Room",
      "Class Cohort",
      "Department",
      "Faculty Name",
      "Faculty Email",
    ]);

    for (const e of entries) {
      csv += formatCsvRow([
        DAY_NAMES[e.dayOfWeek] || `Day ${e.dayOfWeek}`,
        e.startTime,
        e.endTime,
        e.subject.code,
        e.subject.name,
        e.room || "TBA",
        e.class.label,
        e.class.department.code,
        e.teacherAssignment?.teacher?.name || "Unassigned",
        e.teacherAssignment?.teacher?.email || "",
      ]);
    }

    const baseName =
      user.role === Role.STUDENT
        ? "student_timetable"
        : user.role === Role.TEACHER
        ? "teacher_schedule"
        : query.classId
        ? `timetable_class_${query.classId.slice(0, 8)}`
        : "institution_timetable";

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = sanitizeFilename(`${baseName}_${timestamp}.csv`);

    return { filename, csv };
  }

  async getById(id: string) {
    const entry = await prisma.timetableEntry.findUnique({
      where: { id },
      include: {
        class: {
          include: { department: true, academicYear: true },
        },
        subject: {
          include: { department: true },
        },
        teacherAssignment: {
          include: { teacher: true },
        },
        _count: {
          select: { sessions: true },
        },
      },
    });

    if (!entry) {
      throw new AppError("Timetable entry not found", 404, "NOT_FOUND");
    }

    return entry;
  }

  async create(adminUserId: string, input: TimetableEntryInput) {
    // 1. Time range validation: endTime must be strictly after startTime
    if (input.endTime <= input.startTime) {
      throw new AppError(
        `End time (${input.endTime}) must be later than start time (${input.startTime})`,
        422,
        "INVALID_TIME_RANGE"
      );
    }

    // 2. Day of week validation (1=Monday to 7=Sunday)
    if (input.dayOfWeek < 1 || input.dayOfWeek > 7) {
      throw new AppError("Day of week must be between 1 (Monday) and 7 (Sunday)", 422, "INVALID_DAY");
    }

    // 3. Validate Teacher Assignment
    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id: input.teacherAssignmentId },
      include: { teacher: true, class: true, subject: true },
    });
    if (!assignment) {
      throw new AppError("Teacher assignment not found", 404, "ASSIGNMENT_NOT_FOUND");
    }
    if (!assignment.active) {
      throw new AppError("Teacher assignment is inactive", 422, "ASSIGNMENT_INACTIVE");
    }
    if (assignment.teacher.status !== "ACTIVE") {
      throw new AppError("Teacher account is inactive", 422, "TEACHER_INACTIVE");
    }

    // 4. Validate Class and Subject match assignment
    if (assignment.classId !== input.classId) {
      throw new AppError(
        "Class does not match the referenced teacher assignment",
        422,
        "CLASS_ASSIGNMENT_MISMATCH"
      );
    }
    if (assignment.subjectId !== input.subjectId) {
      throw new AppError(
        "Subject does not match the referenced teacher assignment",
        422,
        "SUBJECT_ASSIGNMENT_MISMATCH"
      );
    }

    const room = input.room ? input.room.trim() : null;

    // 5. Transaction with server-side overlap detection and transaction lock
    return prisma.$transaction(async (tx) => {
      // Acquire transaction-scoped advisory lock to prevent concurrent scheduling race conditions
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('timetable_schedule_lock'))`;

      // Find all existing entries on the same dayOfWeek
      const existingEntries = await tx.timetableEntry.findMany({
        where: { dayOfWeek: input.dayOfWeek },
        include: {
          teacherAssignment: true,
          class: true,
          subject: true,
        },
      });

      for (const entry of existingEntries) {
        if (!isOverlapping(input.startTime, input.endTime, entry.startTime, entry.endTime)) {
          continue;
        }

        // a) Teacher conflict
        if (entry.teacherAssignment.teacherUserId === assignment.teacherUserId) {
          throw new AppError(
            `Teacher '${assignment.teacher.name}' already has a class scheduled on Day ${input.dayOfWeek} from ${entry.startTime} to ${entry.endTime} (${entry.class.label} - ${entry.subject.code})`,
            409,
            "TEACHER_SCHEDULE_CONFLICT"
          );
        }

        // b) Class conflict
        if (entry.classId === input.classId) {
          throw new AppError(
            `Class '${assignment.class.label}' already has another subject scheduled on Day ${input.dayOfWeek} from ${entry.startTime} to ${entry.endTime} (${entry.subject.code})`,
            409,
            "CLASS_SCHEDULE_CONFLICT"
          );
        }

        // c) Room conflict
        if (room && entry.room && entry.room.toLowerCase() === room.toLowerCase()) {
          throw new AppError(
            `Room '${room}' is already occupied on Day ${input.dayOfWeek} from ${entry.startTime} to ${entry.endTime} by ${entry.class.label}`,
            409,
            "ROOM_SCHEDULE_CONFLICT"
          );
        }
      }

      const created = await tx.timetableEntry.create({
        data: {
          classId: input.classId,
          subjectId: input.subjectId,
          teacherAssignmentId: input.teacherAssignmentId,
          dayOfWeek: input.dayOfWeek,
          startTime: input.startTime,
          endTime: input.endTime,
          room: room || undefined,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
        },
        include: {
          class: { select: { id: true, label: true } },
          subject: { select: { id: true, name: true, code: true } },
          teacherAssignment: {
            include: {
              teacher: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "TIMETABLE_ENTRY_CREATED",
          entityType: "TimetableEntry",
          entityId: created.id,
          metadata: JSON.stringify({
            dayOfWeek: input.dayOfWeek,
            startTime: input.startTime,
            endTime: input.endTime,
            room: room,
            classId: input.classId,
            subjectId: input.subjectId,
            teacherUserId: assignment.teacherUserId,
          }),
        },
      });

      return created;
    });
  }

  async update(adminUserId: string, id: string, input: TimetableEntryUpdateInput) {
    const existingEntry = await prisma.timetableEntry.findUnique({
      where: { id },
      include: {
        teacherAssignment: { include: { teacher: true } },
        class: true,
        subject: true,
      },
    });

    if (!existingEntry) {
      throw new AppError("Timetable entry not found", 404, "NOT_FOUND");
    }

    const newStartTime = input.startTime || existingEntry.startTime;
    const newEndTime = input.endTime || existingEntry.endTime;
    const newDayOfWeek = input.dayOfWeek ?? existingEntry.dayOfWeek;
    const newAssignmentId = input.teacherAssignmentId || existingEntry.teacherAssignmentId;
    const newClassId = input.classId || existingEntry.classId;
    const newSubjectId = input.subjectId || existingEntry.subjectId;
    const newRoom =
      input.room !== undefined
        ? input.room.trim() || null
        : existingEntry.room;

    // Time range validation
    if (newEndTime <= newStartTime) {
      throw new AppError(
        `End time (${newEndTime}) must be later than start time (${newStartTime})`,
        422,
        "INVALID_TIME_RANGE"
      );
    }

    // Day of week validation
    if (newDayOfWeek < 1 || newDayOfWeek > 7) {
      throw new AppError("Day of week must be between 1 and 7", 422, "INVALID_DAY");
    }

    // Validate assignment if changed
    let targetAssignment = existingEntry.teacherAssignment;
    if (input.teacherAssignmentId && input.teacherAssignmentId !== existingEntry.teacherAssignmentId) {
      const assignment = await prisma.teacherAssignment.findUnique({
        where: { id: input.teacherAssignmentId },
        include: { teacher: true, class: true, subject: true },
      });
      if (!assignment) throw new AppError("Teacher assignment not found", 404, "ASSIGNMENT_NOT_FOUND");
      targetAssignment = assignment;
    }

    if (!targetAssignment.active) throw new AppError("Teacher assignment is inactive", 422, "ASSIGNMENT_INACTIVE");
    if (targetAssignment.teacher.status !== "ACTIVE") throw new AppError("Teacher account is inactive", 422, "TEACHER_INACTIVE");

    // Verify consistency
    if (targetAssignment.classId !== newClassId) {
      throw new AppError("Class does not match teacher assignment", 422, "CLASS_ASSIGNMENT_MISMATCH");
    }
    if (targetAssignment.subjectId !== newSubjectId) {
      throw new AppError("Subject does not match teacher assignment", 422, "SUBJECT_ASSIGNMENT_MISMATCH");
    }

    return prisma.$transaction(async (tx) => {
      // Acquire transaction-scoped advisory lock to prevent concurrent scheduling race conditions
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('timetable_schedule_lock'))`;

      // Find all existing entries on the target dayOfWeek, excluding this entry
      const existingEntries = await tx.timetableEntry.findMany({
        where: {
          dayOfWeek: newDayOfWeek,
          id: { not: id }, // Exclude self
        },
        include: {
          teacherAssignment: true,
          class: true,
          subject: true,
        },
      });

      for (const entry of existingEntries) {
        if (!isOverlapping(newStartTime, newEndTime, entry.startTime, entry.endTime)) {
          continue;
        }

        // a) Teacher conflict
        if (entry.teacherAssignment.teacherUserId === targetAssignment.teacherUserId) {
          throw new AppError(
            `Teacher '${targetAssignment.teacher.name}' already has a class scheduled on Day ${newDayOfWeek} from ${entry.startTime} to ${entry.endTime} (${entry.class.label})`,
            409,
            "TEACHER_SCHEDULE_CONFLICT"
          );
        }

        // b) Class conflict
        if (entry.classId === newClassId) {
          throw new AppError(
            `Class already has another subject scheduled on Day ${newDayOfWeek} from ${entry.startTime} to ${entry.endTime} (${entry.subject.code})`,
            409,
            "CLASS_SCHEDULE_CONFLICT"
          );
        }

        // c) Room conflict
        if (newRoom && entry.room && entry.room.toLowerCase() === newRoom.toLowerCase()) {
          throw new AppError(
            `Room '${newRoom}' is already occupied on Day ${newDayOfWeek} from ${entry.startTime} to ${entry.endTime}`,
            409,
            "ROOM_SCHEDULE_CONFLICT"
          );
        }
      }

      const updated = await tx.timetableEntry.update({
        where: { id },
        data: {
          classId: newClassId,
          subjectId: newSubjectId,
          teacherAssignmentId: newAssignmentId,
          dayOfWeek: newDayOfWeek,
          startTime: newStartTime,
          endTime: newEndTime,
          room: newRoom,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
          effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
        },
        include: {
          class: { select: { id: true, label: true } },
          subject: { select: { id: true, name: true, code: true } },
          teacherAssignment: {
            include: {
              teacher: { select: { id: true, name: true, email: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "TIMETABLE_ENTRY_UPDATED",
          entityType: "TimetableEntry",
          entityId: id,
          metadata: JSON.stringify({ changes: input }),
        },
      });

      return updated;
    });
  }

  async delete(adminUserId: string, id: string) {
    const entry = await prisma.timetableEntry.findUnique({
      where: { id },
      include: {
        _count: {
          select: { sessions: true },
        },
      },
    });

    if (!entry) {
      throw new AppError("Timetable entry not found", 404, "NOT_FOUND");
    }

    // Dependent protection: cannot delete if attendance sessions are tied to this timetable entry
    if (entry._count.sessions > 0) {
      throw new AppError(
        `Cannot delete timetable entry because ${entry._count.sessions} attendance session(s) are recorded against it. Deactivate or set 'effectiveTo' date instead.`,
        409,
        "DEPENDENT_RECORDS_EXIST"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.timetableEntry.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "TIMETABLE_ENTRY_DELETED",
          entityType: "TimetableEntry",
          entityId: id,
          metadata: JSON.stringify({
            dayOfWeek: entry.dayOfWeek,
            startTime: entry.startTime,
            endTime: entry.endTime,
            classId: entry.classId,
            subjectId: entry.subjectId,
          }),
        },
      });
    });

    return { message: "Timetable entry deleted successfully" };
  }
}

export const timetableService = new TimetableService();
