import {
  TeacherAssignmentInput,
  TeacherAssignmentUpdateInput,
} from "@smart-attendance/shared";
import bcrypt from "bcrypt";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

export interface TeacherAssignmentListQuery {
  search?: string;
  teacherUserId?: string;
  classId?: string;
  subjectId?: string;
  active?: boolean | string;
  page?: number;
  limit?: number;
}

export class TeacherAssignmentsService {
  async list(query: TeacherAssignmentListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.active !== undefined && query.active !== "") {
      where.active =
        typeof query.active === "string" ? query.active === "true" : Boolean(query.active);
    }
    if (query.teacherUserId) where.teacherUserId = query.teacherUserId;
    if (query.classId) where.classId = query.classId;
    if (query.subjectId) where.subjectId = query.subjectId;

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { teacher: { name: { contains: term, mode: "insensitive" } } },
        { subject: { name: { contains: term, mode: "insensitive" } } },
        { subject: { code: { contains: term, mode: "insensitive" } } },
        { class: { label: { contains: term, mode: "insensitive" } } },
      ];
    }

    const [total, assignments] = await Promise.all([
      prisma.teacherAssignment.count({ where }),
      prisma.teacherAssignment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          teacher: {
            select: { id: true, name: true, email: true, role: true, status: true },
          },
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
          subject: {
            select: {
              id: true,
              name: true,
              code: true,
              departmentId: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          _count: {
            select: { timetableEntries: true },
          },
        },
      }),
    ]);

    return {
      assignments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getStats() {
    const [total, active, inactive] = await Promise.all([
      prisma.teacherAssignment.count(),
      prisma.teacherAssignment.count({ where: { active: true } }),
      prisma.teacherAssignment.count({ where: { active: false } }),
    ]);
    return { total, active, inactive };
  }

  async getTeachersList() {
    return prisma.user.findMany({
      where: { role: "TEACHER", status: "ACTIVE" },
      select: { id: true, name: true, email: true, status: true },
      orderBy: { name: "asc" },
    });
  }

  async createTeacher(
    adminUserId: string,
    input: { name: string; email: string; password?: string }
  ) {
    if (!input.name || !input.name.trim()) {
      throw new AppError("Teacher name is required", 400, "VALIDATION_ERROR");
    }
    if (!input.email || !input.email.trim()) {
      throw new AppError("Teacher email is required", 400, "VALIDATION_ERROR");
    }
    const cleanEmail = input.email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existing) {
      throw new AppError(
        "A user with this email address already exists",
        409,
        "USER_ALREADY_EXISTS"
      );
    }
    const rawPassword =
      input.password && input.password.trim() ? input.password.trim() : "Password123!";
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const teacher = await prisma.user.create({
      data: {
        name: input.name.trim(),
        email: cleanEmail,
        passwordHash,
        role: "TEACHER",
        status: "ACTIVE",
        mustChangePassword: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        role: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorUserId: adminUserId,
        action: "TEACHER_USER_CREATED",
        entityType: "User",
        entityId: teacher.id,
        metadata: JSON.stringify({ name: teacher.name, email: teacher.email }),
      },
    });

    return teacher;
  }

  async getMyAssignments(teacherUserId: string) {
    return prisma.teacherAssignment.findMany({
      where: {
        teacherUserId,
        active: true,
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
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
            departmentId: true,
            department: { select: { id: true, name: true, code: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async getById(id: string) {
    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id },
      include: {
        teacher: {
          select: { id: true, name: true, email: true, role: true, status: true },
        },
        class: {
          include: {
            department: true,
            academicYear: true,
          },
        },
        subject: {
          include: {
            department: true,
          },
        },
        _count: {
          select: { timetableEntries: true },
        },
      },
    });

    if (!assignment) {
      throw new AppError("Teacher assignment not found", 404, "NOT_FOUND");
    }

    return assignment;
  }

  async create(adminUserId: string, input: TeacherAssignmentInput) {
    // 1. Validate Teacher User
    const teacher = await prisma.user.findUnique({
      where: { id: input.teacherUserId },
    });
    if (!teacher) {
      throw new AppError("Teacher not found", 404, "TEACHER_NOT_FOUND");
    }
    if (teacher.role !== "TEACHER") {
      throw new AppError("Selected user does not have TEACHER role", 422, "INVALID_ROLE");
    }
    if (teacher.status !== "ACTIVE") {
      throw new AppError("Teacher account is not ACTIVE", 422, "TEACHER_INACTIVE");
    }

    // 2. Validate Class
    const cls = await prisma.class.findUnique({
      where: { id: input.classId },
      include: { department: true },
    });
    if (!cls) {
      throw new AppError("Class not found", 404, "CLASS_NOT_FOUND");
    }

    // 3. Validate Subject
    const subject = await prisma.subject.findUnique({
      where: { id: input.subjectId },
      include: { department: true },
    });
    if (!subject) {
      throw new AppError("Subject not found", 404, "SUBJECT_NOT_FOUND");
    }

    // 4. Department Mismatch Validation
    if (subject.departmentId !== cls.departmentId) {
      throw new AppError(
        `Department mismatch: Subject '${subject.code}' belongs to department '${subject.department.code}' but Class '${cls.label}' belongs to department '${cls.department.code}'`,
        422,
        "DEPARTMENT_MISMATCH"
      );
    }

    // 5. Duplicate Check: Ensure no faculty is already assigned to this class and subject
    const existing = await prisma.teacherAssignment.findUnique({
      where: {
        classId_subjectId: {
          classId: input.classId,
          subjectId: input.subjectId,
        },
      },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
      },
    });
    if (existing) {
      if (existing.teacherUserId === input.teacherUserId) {
        throw new AppError(
          `Teacher '${teacher.name}' is already assigned to '${subject.name}' (${subject.code}) for class '${cls.label}'`,
          409,
          "DUPLICATE_ASSIGNMENT"
        );
      } else {
        throw new AppError(
          `Duplicate assignment not allowed: Subject '${subject.name}' (${subject.code}) for class '${cls.label}' is already assigned to '${existing.teacher.name}' (${existing.teacher.email}). Each subject in a class can only be assigned to one faculty teacher.`,
          409,
          "DUPLICATE_ASSIGNMENT"
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      const created = await tx.teacherAssignment.create({
        data: {
          teacherUserId: input.teacherUserId,
          classId: input.classId,
          subjectId: input.subjectId,
          active: true,
        },
        include: {
          teacher: { select: { id: true, name: true, email: true } },
          class: { select: { id: true, label: true } },
          subject: { select: { id: true, name: true, code: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "TEACHER_ASSIGNMENT_CREATED",
          entityType: "TeacherAssignment",
          entityId: created.id,
          metadata: JSON.stringify({
            teacherUserId: input.teacherUserId,
            classId: input.classId,
            subjectId: input.subjectId,
          }),
        },
      });

      return created;
    });
  }

  async update(adminUserId: string, id: string, input: TeacherAssignmentUpdateInput) {
    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id },
      include: { class: true, subject: true },
    });
    if (!assignment) {
      throw new AppError("Teacher assignment not found", 404, "NOT_FOUND");
    }

    const newTeacherId = input.teacherUserId || assignment.teacherUserId;
    const newClassId = input.classId || assignment.classId;
    const newSubjectId = input.subjectId || assignment.subjectId;

    if (input.teacherUserId && input.teacherUserId !== assignment.teacherUserId) {
      const teacher = await prisma.user.findUnique({ where: { id: input.teacherUserId } });
      if (!teacher) throw new AppError("Teacher not found", 404, "TEACHER_NOT_FOUND");
      if (teacher.role !== "TEACHER") {
        throw new AppError("Selected user does not have TEACHER role", 422, "INVALID_ROLE");
      }
      if (teacher.status !== "ACTIVE") {
        throw new AppError("Teacher account is not ACTIVE", 422, "TEACHER_INACTIVE");
      }
    }

    let targetClass = assignment.class;
    if (input.classId && input.classId !== assignment.classId) {
      const cls = await prisma.class.findUnique({
        where: { id: input.classId },
        include: { department: true },
      });
      if (!cls) throw new AppError("Class not found", 404, "CLASS_NOT_FOUND");
      targetClass = cls;
    }

    let targetSubject = assignment.subject;
    if (input.subjectId && input.subjectId !== assignment.subjectId) {
      const sub = await prisma.subject.findUnique({
        where: { id: input.subjectId },
        include: { department: true },
      });
      if (!sub) throw new AppError("Subject not found", 404, "SUBJECT_NOT_FOUND");
      targetSubject = sub;
    }

    // Verify Department Consistency
    if (targetSubject.departmentId !== targetClass.departmentId) {
      throw new AppError(
        "Department mismatch between selected Subject and Class",
        422,
        "DEPARTMENT_MISMATCH"
      );
    }

    // Duplicate check and dependent protection if relation tuple changed
    const tupleChanged =
      newTeacherId !== assignment.teacherUserId ||
      newClassId !== assignment.classId ||
      newSubjectId !== assignment.subjectId;

    if (tupleChanged) {
      const timetableCount = await prisma.timetableEntry.count({
        where: { teacherAssignmentId: id },
      });
      if (timetableCount > 0) {
        throw new AppError(
          `Cannot reassign teacher, class, or subject because ${timetableCount} timetable entries are linked. Please create a new assignment instead.`,
          409,
          "DEPENDENT_RECORDS_EXIST"
        );
      }

      const conflict = await prisma.teacherAssignment.findUnique({
        where: {
          classId_subjectId: {
            classId: newClassId,
            subjectId: newSubjectId,
          },
        },
        include: {
          teacher: { select: { id: true, name: true, email: true } },
        },
      });
      if (conflict && conflict.id !== id) {
        throw new AppError(
          `Duplicate assignment not allowed: Subject is already assigned to '${conflict.teacher.name}' (${conflict.teacher.email}) for this class.`,
          409,
          "DUPLICATE_ASSIGNMENT"
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.teacherAssignment.update({
        where: { id },
        data: {
          teacherUserId: input.teacherUserId || undefined,
          classId: input.classId || undefined,
          subjectId: input.subjectId || undefined,
          active: input.active !== undefined ? input.active : undefined,
        },
        include: {
          teacher: { select: { id: true, name: true, email: true } },
          class: { select: { id: true, label: true } },
          subject: { select: { id: true, name: true, code: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "TEACHER_ASSIGNMENT_UPDATED",
          entityType: "TeacherAssignment",
          entityId: id,
          metadata: JSON.stringify({ changes: input }),
        },
      });

      return updated;
    });
  }

  async delete(adminUserId: string, id: string) {
    const assignment = await prisma.teacherAssignment.findUnique({
      where: { id },
      include: {
        _count: {
          select: { timetableEntries: true },
        },
      },
    });

    if (!assignment) {
      throw new AppError("Teacher assignment not found", 404, "NOT_FOUND");
    }

    // Check dependent timetable entries
    if (assignment._count.timetableEntries > 0) {
      throw new AppError(
        `Cannot delete assignment with ${assignment._count.timetableEntries} existing timetable entries. Please deactivate it instead.`,
        409,
        "DEPENDENT_RECORDS_EXIST"
      );
    }

    // Check if any attendance sessions exist for this teacher, class, and subject
    const attendanceSessionCount = await prisma.attendanceSession.count({
      where: {
        teacherUserId: assignment.teacherUserId,
        classId: assignment.classId,
        subjectId: assignment.subjectId,
      },
    });

    if (attendanceSessionCount > 0) {
      throw new AppError(
        `Cannot delete assignment because ${attendanceSessionCount} attendance sessions are recorded for this teacher, class, and subject. Deactivate it instead.`,
        409,
        "DEPENDENT_RECORDS_EXIST"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.teacherAssignment.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "TEACHER_ASSIGNMENT_DELETED",
          entityType: "TeacherAssignment",
          entityId: id,
          metadata: JSON.stringify({
            teacherUserId: assignment.teacherUserId,
            classId: assignment.classId,
            subjectId: assignment.subjectId,
          }),
        },
      });
    });

    return { message: "Teacher assignment deleted successfully" };
  }
}

export const teacherAssignmentsService = new TeacherAssignmentsService();
