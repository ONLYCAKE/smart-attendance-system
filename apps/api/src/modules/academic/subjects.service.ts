import { SubjectInput } from "@smart-attendance/shared";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

export interface SubjectListQuery {
  search?: string;
  departmentId?: string;
  active?: boolean | string;
  page?: number;
  limit?: number;
}

export class SubjectsService {
  async list(query: SubjectListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.active !== undefined && query.active !== "") {
      where.active =
        typeof query.active === "string" ? query.active === "true" : Boolean(query.active);
    }
    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }
    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { code: { contains: term, mode: "insensitive" } },
      ];
    }

    const [total, subjects] = await Promise.all([
      prisma.subject.count({ where }),
      prisma.subject.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: "asc" },
        include: {
          department: { select: { id: true, name: true, code: true } },
          _count: { select: { teacherAssignments: true, timetableEntries: true } },
        },
      }),
    ]);

    return { subjects, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getAll(departmentId?: string) {
    return prisma.subject.findMany({
      where: { active: true, ...(departmentId ? { departmentId } : {}) },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, departmentId: true },
    });
  }

  async getStats() {
    const [total, active, inactive] = await Promise.all([
      prisma.subject.count(),
      prisma.subject.count({ where: { active: true } }),
      prisma.subject.count({ where: { active: false } }),
    ]);
    return { total, active, inactive };
  }

  async getById(id: string) {
    const subject = await prisma.subject.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        _count: { select: { teacherAssignments: true, timetableEntries: true } },
      },
    });
    if (!subject) throw new AppError("Subject not found", 404, "NOT_FOUND");
    return subject;
  }

  /**
   * Autogenerates next available subject code based on department prefix (e.g. IT001, CS001, CSE001).
   * Different departments have independent sequence counters starting from 001.
   */
  async getNextCode(departmentId: string) {
    if (!departmentId) {
      throw new AppError("Department ID is required to generate subject code", 400, "MISSING_DEPARTMENT_ID");
    }

    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new AppError("Department not found", 404, "DEPARTMENT_NOT_FOUND");

    const existingSubjects = await prisma.subject.findMany({
      where: { departmentId },
      select: { code: true },
    });

    const prefix = dept.code.trim().toUpperCase();
    let maxNum = 0;

    for (const sub of existingSubjects) {
      const clean = sub.code.trim().toUpperCase();
      if (clean.startsWith(prefix)) {
        const numPart = clean.slice(prefix.length);
        const parsed = parseInt(numPart, 10);
        if (!isNaN(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      } else {
        const match = clean.match(/\d+$/);
        if (match) {
          const parsed = parseInt(match[0], 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    }

    const nextNum = maxNum + 1;
    const nextCode = `${prefix}${String(nextNum).padStart(3, "0")}`;

    return {
      departmentId,
      departmentCode: prefix,
      departmentName: dept.name,
      nextCode,
    };
  }

  async create(adminUserId: string, input: SubjectInput) {
    // 1. Verify department exists
    const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
    if (!dept) throw new AppError("Department not found", 404, "DEPARTMENT_NOT_FOUND");

    // 2. Resolve code: autogenerate if not provided
    let code = input.code ? input.code.trim().toUpperCase() : "";
    if (!code) {
      const generated = await this.getNextCode(input.departmentId);
      code = generated.nextCode;
    }

    // 3. Verify subject name uniqueness within this department (case-insensitive)
    const cleanName = input.name.trim();
    const existingName = await prisma.subject.findFirst({
      where: {
        departmentId: input.departmentId,
        name: { equals: cleanName, mode: "insensitive" },
      },
    });
    if (existingName) {
      throw new AppError(
        `Subject '${cleanName}' already exists in department '${dept.name}' with code '${existingName.code}'. Duplicate subject names within the same department are not allowed.`,
        409,
        "DUPLICATE_NAME"
      );
    }

    // 4. Verify code uniqueness within this department
    const existingCode = await prisma.subject.findFirst({
      where: { departmentId: input.departmentId, code },
    });
    if (existingCode) {
      throw new AppError(
        `Subject with code '${code}' already exists in department '${dept.name}'`,
        409,
        "DUPLICATE_CODE"
      );
    }

    return prisma.$transaction(async (tx) => {
      const created = await tx.subject.create({
        data: { code, name: cleanName, departmentId: input.departmentId, active: true },
        include: {
          department: { select: { id: true, name: true, code: true } },
          _count: { select: { teacherAssignments: true, timetableEntries: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "SUBJECT_CREATED",
          entityType: "Subject",
          entityId: created.id,
          metadata: JSON.stringify({ code, name: created.name, departmentId: input.departmentId }),
        },
      });
      return created;
    });
  }

  async update(
    adminUserId: string,
    id: string,
    input: Partial<SubjectInput & { active: boolean }>
  ) {
    const subject = await prisma.subject.findUnique({ where: { id } });
    if (!subject) throw new AppError("Subject not found", 404, "NOT_FOUND");

    const targetDeptId = input.departmentId || subject.departmentId;
    if (input.departmentId) {
      const dept = await prisma.department.findUnique({ where: { id: input.departmentId } });
      if (!dept) throw new AppError("Department not found", 404, "DEPARTMENT_NOT_FOUND");
    }

    if (input.name) {
      const cleanName = input.name.trim();
      const conflictName = await prisma.subject.findFirst({
        where: {
          departmentId: targetDeptId,
          name: { equals: cleanName, mode: "insensitive" },
          id: { not: id },
        },
      });
      if (conflictName) {
        throw new AppError(
          `Subject '${cleanName}' already exists in this department with code '${conflictName.code}'. Duplicate subject names within the same department are not allowed.`,
          409,
          "DUPLICATE_NAME"
        );
      }
    }

    if (input.code) {
      const code = input.code.trim().toUpperCase();
      if (code !== subject.code || targetDeptId !== subject.departmentId) {
        const conflict = await prisma.subject.findFirst({
          where: { departmentId: targetDeptId, code, id: { not: id } },
        });
        if (conflict) {
          throw new AppError(
            `Subject with code '${code}' already exists in this department`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.subject.update({
        where: { id },
        data: {
          code: input.code ? input.code.trim().toUpperCase() : undefined,
          name: input.name ? input.name.trim() : undefined,
          departmentId: input.departmentId || undefined,
          active: input.active !== undefined ? input.active : undefined,
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          _count: { select: { teacherAssignments: true, timetableEntries: true } },
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "SUBJECT_UPDATED",
          entityType: "Subject",
          entityId: id,
          metadata: JSON.stringify({ changes: input }),
        },
      });
      return updated;
    });
  }

  async delete(adminUserId: string, id: string) {
    const subject = await prisma.subject.findUnique({
      where: { id },
      include: { _count: { select: { teacherAssignments: true, timetableEntries: true } } },
    });
    if (!subject) throw new AppError("Subject not found", 404, "NOT_FOUND");

    const deps = subject._count.teacherAssignments + subject._count.timetableEntries;
    if (deps > 0) {
      throw new AppError(
        `Cannot delete subject with ${subject._count.teacherAssignments} teacher assignments and ${subject._count.timetableEntries} timetable entries.`,
        409,
        "DEPENDENT_RECORDS_EXIST"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.subject.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "SUBJECT_DELETED",
          entityType: "Subject",
          entityId: id,
          metadata: JSON.stringify({ code: subject.code, name: subject.name }),
        },
      });
    });

    return { message: `Subject '${subject.name}' (${subject.code}) deleted successfully` };
  }
}

export const subjectsService = new SubjectsService();
