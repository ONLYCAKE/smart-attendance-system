import { ClassInput } from "@smart-attendance/shared";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

export interface ClassListQuery {
  search?: string;
  departmentId?: string;
  academicYearId?: string;
  semesterNumber?: string | number;
  active?: boolean | string;
  page?: number;
  limit?: number;
}

export class ClassesService {
  async list(query: ClassListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.active !== undefined && query.active !== "") {
      where.active =
        typeof query.active === "string" ? query.active === "true" : Boolean(query.active);
    }
    if (query.departmentId) where.departmentId = query.departmentId;
    if (query.academicYearId) where.academicYearId = query.academicYearId;
    if (query.semesterNumber) where.semesterNumber = Number(query.semesterNumber);
    if (query.search && query.search.trim()) {
      where.label = { contains: query.search.trim(), mode: "insensitive" };
    }

    const [total, classes] = await Promise.all([
      prisma.class.count({ where }),
      prisma.class.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ semesterNumber: "asc" }, { division: "asc" }],
        include: {
          department: { select: { id: true, name: true, code: true } },
          academicYear: { select: { id: true, label: true } },
          _count: {
            select: { students: true, teacherAssignments: true, timetableEntries: true },
          },
        },
      }),
    ]);

    return { classes, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
  }

  async getAll(query?: { departmentId?: string; academicYearId?: string }) {
    return prisma.class.findMany({
      where: {
        active: true,
        ...(query?.departmentId ? { departmentId: query.departmentId } : {}),
        ...(query?.academicYearId ? { academicYearId: query.academicYearId } : {}),
      },
      orderBy: [{ semesterNumber: "asc" }, { division: "asc" }],
      select: {
        id: true,
        label: true,
        semesterNumber: true,
        division: true,
        departmentId: true,
        academicYearId: true,
      },
    });
  }

  async getStats() {
    const [total, active, inactive] = await Promise.all([
      prisma.class.count(),
      prisma.class.count({ where: { active: true } }),
      prisma.class.count({ where: { active: false } }),
    ]);
    return { total, active, inactive };
  }

  async getById(id: string) {
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, name: true, code: true } },
        academicYear: { select: { id: true, label: true, startDate: true, endDate: true } },
        _count: {
          select: { students: true, teacherAssignments: true, timetableEntries: true },
        },
      },
    });
    if (!cls) throw new AppError("Class not found", 404, "NOT_FOUND");
    return cls;
  }

  async create(adminUserId: string, input: ClassInput) {
    // Verify FK dependencies exist
    const [dept, year] = await Promise.all([
      prisma.department.findUnique({ where: { id: input.departmentId } }),
      prisma.academicYear.findUnique({ where: { id: input.academicYearId } }),
    ]);
    if (!dept) throw new AppError("Department not found", 404, "DEPARTMENT_NOT_FOUND");
    if (!year) throw new AppError("Academic year not found", 404, "ACADEMIC_YEAR_NOT_FOUND");

    // Division validation: uppercase single letter(s)
    const division = input.division.trim().toUpperCase();

    // Cohort uniqueness check
    const existing = await prisma.class.findUnique({
      where: {
        departmentId_academicYearId_semesterNumber_division: {
          departmentId: input.departmentId,
          academicYearId: input.academicYearId,
          semesterNumber: input.semesterNumber,
          division,
        },
      },
    });
    if (existing) {
      throw new AppError(
        `Class with Semester ${input.semesterNumber}, Division '${division}' already exists for this department and academic year`,
        409,
        "DUPLICATE_COHORT"
      );
    }

    const label = input.label.trim() || `${dept.code}-Sem${input.semesterNumber}-Div${division}`;

    return prisma.$transaction(async (tx) => {
      const created = await tx.class.create({
        data: {
          departmentId: input.departmentId,
          academicYearId: input.academicYearId,
          semesterNumber: input.semesterNumber,
          division,
          label,
          active: true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "CLASS_CREATED",
          entityType: "Class",
          entityId: created.id,
          metadata: JSON.stringify({
            label,
            departmentId: input.departmentId,
            academicYearId: input.academicYearId,
            semesterNumber: input.semesterNumber,
            division,
          }),
        },
      });
      return created;
    });
  }

  async update(
    adminUserId: string,
    id: string,
    input: Partial<ClassInput & { active: boolean }>
  ) {
    const cls = await prisma.class.findUnique({ where: { id } });
    if (!cls) throw new AppError("Class not found", 404, "NOT_FOUND");

    // If cohort-defining fields are changing, verify uniqueness
    const newDeptId = input.departmentId || cls.departmentId;
    const newYearId = input.academicYearId || cls.academicYearId;
    const newSem = input.semesterNumber ?? cls.semesterNumber;
    const newDiv = input.division ? input.division.trim().toUpperCase() : cls.division;

    const cohortChanged =
      newDeptId !== cls.departmentId ||
      newYearId !== cls.academicYearId ||
      newSem !== cls.semesterNumber ||
      newDiv !== cls.division;

    if (cohortChanged) {
      const conflict = await prisma.class.findUnique({
        where: {
          departmentId_academicYearId_semesterNumber_division: {
            departmentId: newDeptId,
            academicYearId: newYearId,
            semesterNumber: newSem,
            division: newDiv,
          },
        },
      });
      if (conflict && conflict.id !== id) {
        throw new AppError(
          `Class with Semester ${newSem}, Division '${newDiv}' already exists for that department and academic year`,
          409,
          "DUPLICATE_COHORT"
        );
      }
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.class.update({
        where: { id },
        data: {
          departmentId: input.departmentId || undefined,
          academicYearId: input.academicYearId || undefined,
          semesterNumber: input.semesterNumber ?? undefined,
          division: input.division ? input.division.trim().toUpperCase() : undefined,
          label: input.label ? input.label.trim() : undefined,
          active: input.active !== undefined ? input.active : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "CLASS_UPDATED",
          entityType: "Class",
          entityId: id,
          metadata: JSON.stringify({ changes: input }),
        },
      });
      return updated;
    });
  }

  async delete(adminUserId: string, id: string) {
    const cls = await prisma.class.findUnique({
      where: { id },
      include: {
        _count: { select: { students: true, teacherAssignments: true, timetableEntries: true } },
      },
    });
    if (!cls) throw new AppError("Class not found", 404, "NOT_FOUND");

    const deps = cls._count.students + cls._count.teacherAssignments + cls._count.timetableEntries;
    if (deps > 0) {
      throw new AppError(
        `Cannot delete class with ${cls._count.students} students, ${cls._count.teacherAssignments} teacher assignments, and ${cls._count.timetableEntries} timetable entries.`,
        409,
        "DEPENDENT_RECORDS_EXIST"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.class.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "CLASS_DELETED",
          entityType: "Class",
          entityId: id,
          metadata: JSON.stringify({ label: cls.label }),
        },
      });
    });

    return { message: `Class '${cls.label}' deleted successfully` };
  }
}

export const classesService = new ClassesService();
