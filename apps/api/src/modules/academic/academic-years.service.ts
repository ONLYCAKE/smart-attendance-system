import { AcademicYearInput } from "@smart-attendance/shared";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

export interface AcademicYearListQuery {
  search?: string;
  active?: boolean | string;
  page?: number;
  limit?: number;
}

export class AcademicYearsService {
  async list(query: AcademicYearListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.active !== undefined && query.active !== "") {
      where.active =
        typeof query.active === "string" ? query.active === "true" : Boolean(query.active);
    }

    if (query.search && query.search.trim()) {
      where.label = { contains: query.search.trim(), mode: "insensitive" };
    }

    const [total, academicYears] = await Promise.all([
      prisma.academicYear.count({ where }),
      prisma.academicYear.findMany({
        where,
        skip,
        take: limit,
        orderBy: { startDate: "desc" },
        include: {
          _count: { select: { classes: true, students: true } },
        },
      }),
    ]);

    return {
      academicYears,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getAll() {
    return prisma.academicYear.findMany({
      where: { active: true },
      orderBy: { startDate: "desc" },
      select: { id: true, label: true, startDate: true, endDate: true, active: true },
    });
  }

  async getStats() {
    const [total, active, inactive] = await Promise.all([
      prisma.academicYear.count(),
      prisma.academicYear.count({ where: { active: true } }),
      prisma.academicYear.count({ where: { active: false } }),
    ]);
    return { total, active, inactive };
  }

  async getById(id: string) {
    const year = await prisma.academicYear.findUnique({
      where: { id },
      include: {
        _count: { select: { classes: true, students: true } },
      },
    });
    if (!year) throw new AppError("Academic year not found", 404, "NOT_FOUND");
    return year;
  }

  async create(adminUserId: string, input: AcademicYearInput) {
    const label = input.label.trim();
    const existing = await prisma.academicYear.findUnique({ where: { label } });
    if (existing) {
      throw new AppError(`Academic year '${label}' already exists`, 409, "DUPLICATE_LABEL");
    }

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    if (end <= start) {
      throw new AppError("End date must be after start date", 422, "INVALID_DATE_RANGE");
    }

    return prisma.$transaction(async (tx) => {
      const created = await tx.academicYear.create({
        data: { label, startDate: start, endDate: end, active: true },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "ACADEMIC_YEAR_CREATED",
          entityType: "AcademicYear",
          entityId: created.id,
          metadata: JSON.stringify({ label }),
        },
      });
      return created;
    });
  }

  async update(
    adminUserId: string,
    id: string,
    input: Partial<AcademicYearInput & { active: boolean }>
  ) {
    const year = await prisma.academicYear.findUnique({ where: { id } });
    if (!year) throw new AppError("Academic year not found", 404, "NOT_FOUND");

    if (input.label && input.label.trim() !== year.label) {
      const conflict = await prisma.academicYear.findUnique({
        where: { label: input.label.trim() },
      });
      if (conflict) {
        throw new AppError(
          `Academic year '${input.label.trim()}' already exists`,
          409,
          "DUPLICATE_LABEL"
        );
      }
    }

    const startDate = input.startDate ? new Date(input.startDate) : year.startDate;
    const endDate = input.endDate ? new Date(input.endDate) : year.endDate;
    if (endDate <= startDate) {
      throw new AppError("End date must be after start date", 422, "INVALID_DATE_RANGE");
    }

    return prisma.$transaction(async (tx) => {
      const updated = await tx.academicYear.update({
        where: { id },
        data: {
          label: input.label ? input.label.trim() : undefined,
          startDate: input.startDate ? startDate : undefined,
          endDate: input.endDate ? endDate : undefined,
          active: input.active !== undefined ? input.active : undefined,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "ACADEMIC_YEAR_UPDATED",
          entityType: "AcademicYear",
          entityId: id,
          metadata: JSON.stringify({ changes: input }),
        },
      });
      return updated;
    });
  }

  async delete(adminUserId: string, id: string) {
    const year = await prisma.academicYear.findUnique({
      where: { id },
      include: { _count: { select: { classes: true, students: true } } },
    });
    if (!year) throw new AppError("Academic year not found", 404, "NOT_FOUND");

    const deps = year._count.classes + year._count.students;
    if (deps > 0) {
      throw new AppError(
        `Cannot delete academic year with ${year._count.classes} classes and ${year._count.students} students. Deactivate it instead.`,
        409,
        "DEPENDENT_RECORDS_EXIST"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.academicYear.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "ACADEMIC_YEAR_DELETED",
          entityType: "AcademicYear",
          entityId: id,
          metadata: JSON.stringify({ label: year.label }),
        },
      });
    });

    return { message: `Academic year '${year.label}' deleted successfully` };
  }
}

export const academicYearsService = new AcademicYearsService();
