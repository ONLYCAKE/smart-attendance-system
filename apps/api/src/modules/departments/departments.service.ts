import { DepartmentInput, DepartmentUpdateInput } from "@smart-attendance/shared";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

export interface DepartmentListQuery {
  search?: string;
  active?: boolean | string;
  page?: number;
  limit?: number;
}

export class DepartmentsService {
  async list(query: DepartmentListQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.active !== undefined && query.active !== "") {
      where.active = typeof query.active === "string" ? query.active === "true" : Boolean(query.active);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: "insensitive" } },
        { code: { contains: term, mode: "insensitive" } },
      ];
    }

    const [total, departments] = await Promise.all([
      prisma.department.count({ where }),
      prisma.department.findMany({
        where,
        skip,
        take: limit,
        orderBy: { code: "asc" },
        include: {
          _count: {
            select: {
              classes: true,
              subjects: true,
              students: true,
            },
          },
        },
      }),
    ]);

    return {
      departments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getStats() {
    const [total, active, inactive] = await Promise.all([
      prisma.department.count(),
      prisma.department.count({ where: { active: true } }),
      prisma.department.count({ where: { active: false } }),
    ]);

    return { total, active, inactive };
  }

  async getById(id: string) {
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            classes: true,
            subjects: true,
            students: true,
          },
        },
      },
    });

    if (!department) {
      throw new AppError("Department not found", 404, "NOT_FOUND");
    }

    return department;
  }

  async create(adminUserId: string, input: DepartmentInput) {
    const normalizedCode = input.code.trim().toUpperCase();
    const normalizedName = input.name.trim();

    // Check duplicate code
    const existing = await prisma.department.findUnique({
      where: { code: normalizedCode },
    });

    if (existing) {
      throw new AppError(
        `Department with code '${normalizedCode}' already exists`,
        409,
        "DUPLICATE_CODE"
      );
    }

    const department = await prisma.$transaction(async (tx) => {
      const created = await tx.department.create({
        data: {
          name: normalizedName,
          code: normalizedCode,
          active: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "DEPARTMENT_CREATED",
          entityType: "Department",
          entityId: created.id,
          metadata: JSON.stringify({
            code: created.code,
            name: created.name,
          }),
        },
      });

      return created;
    });

    return department;
  }

  async update(adminUserId: string, id: string, input: DepartmentUpdateInput) {
    const department = await prisma.department.findUnique({
      where: { id },
    });

    if (!department) {
      throw new AppError("Department not found", 404, "NOT_FOUND");
    }

    let normalizedCode: string | undefined;
    if (input.code) {
      normalizedCode = input.code.trim().toUpperCase();
      if (normalizedCode !== department.code) {
        const existing = await prisma.department.findUnique({
          where: { code: normalizedCode },
        });
        if (existing) {
          throw new AppError(
            `Department with code '${normalizedCode}' already exists`,
            409,
            "DUPLICATE_CODE"
          );
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.department.update({
        where: { id },
        data: {
          name: input.name ? input.name.trim() : undefined,
          code: normalizedCode || undefined,
          active: input.active !== undefined ? input.active : undefined,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "DEPARTMENT_UPDATED",
          entityType: "Department",
          entityId: res.id,
          metadata: JSON.stringify({
            changes: input,
          }),
        },
      });

      return res;
    });

    return updated;
  }

  async delete(adminUserId: string, id: string) {
    const department = await prisma.department.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            classes: true,
            subjects: true,
            students: true,
          },
        },
      },
    });

    if (!department) {
      throw new AppError("Department not found", 404, "NOT_FOUND");
    }

    const dependentCount =
      department._count.classes +
      department._count.subjects +
      department._count.students;

    if (dependentCount > 0) {
      throw new AppError(
        `Cannot delete department with active dependencies (${department._count.classes} classes, ${department._count.subjects} subjects, ${department._count.students} students). Please deactivate it instead.`,
        409,
        "DEPENDENT_RECORDS_EXIST"
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.department.delete({
        where: { id },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "DEPARTMENT_DELETED",
          entityType: "Department",
          entityId: id,
          metadata: JSON.stringify({
            code: department.code,
            name: department.name,
          }),
        },
      });
    });

    return {
      message: `Department '${department.name}' (${department.code}) deleted successfully`,
    };
  }
}

export const departmentsService = new DepartmentsService();
