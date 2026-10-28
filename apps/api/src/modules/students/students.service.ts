import bcrypt from "bcrypt";
import { Role, StudentStatus, UserStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

export class StudentsService {
  async approveStudent(adminUserId: string, studentId: string, options?: { classId?: string }) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true, department: true, academicYear: true },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "NOT_FOUND");
    }

    if (student.status === StudentStatus.ACTIVE) {
      return {
        student,
        message: "Student is already active and approved",
      };
    }

    let finalClassId = student.classId;
    let finalAcademicYearId = student.academicYearId;

    if (options?.classId) {
      const classCohort = await prisma.class.findUnique({
        where: { id: options.classId },
      });
      if (classCohort) {
        finalClassId = classCohort.id;
        finalAcademicYearId = classCohort.academicYearId;
      }
    }

    // Auto-generate department-scoped roll number: [DEPT_CODE]-[YEAR]-[SEQ] (e.g. CS-2026-001)
    let assignedRollNumber = student.rollNumber;
    if (student.rollNumber.startsWith("PENDING-") || !student.rollNumber) {
      const deptCode = (student.department?.code || "STU").toUpperCase();
      const currentYear = new Date().getFullYear();
      const prefix = `${deptCode}-${currentYear}`;

      // Query students in this department with matching prefix to determine next sequence
      const existingCohortStudents = await prisma.student.findMany({
        where: {
          departmentId: student.departmentId,
          rollNumber: {
            startsWith: `${prefix}-`,
          },
        },
        select: { rollNumber: true },
      });

      let maxSeq = 0;
      for (const item of existingCohortStudents) {
        const parts = item.rollNumber.split("-");
        const lastPart = parts[parts.length - 1] ?? "";
        const seq = parseInt(lastPart, 10);
        if (!isNaN(seq) && seq > maxSeq) {
          maxSeq = seq;
        }
      }
      const nextSeq = maxSeq + 1;
      assignedRollNumber = `${prefix}-${String(nextSeq).padStart(3, "0")}`;
    }

    const updatedStudent = await prisma.$transaction(async (tx) => {
      // 1. Activate Student record and assign generated roll number (and class if allocated)
      const activeStudent = await tx.student.update({
        where: { id: studentId },
        data: {
          status: StudentStatus.ACTIVE,
          rollNumber: assignedRollNumber,
          classId: finalClassId,
          academicYearId: finalAcademicYearId,
        },
      });

      // 2. Activate linked User account if present
      if (student.userId) {
        await tx.user.update({
          where: { id: student.userId },
          data: { status: UserStatus.ACTIVE },
        });
      }

      // 3. Create AuditLog entry
      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "STUDENT_APPROVED",
          entityType: "Student",
          entityId: studentId,
          metadata: JSON.stringify({
            studentRollNumber: assignedRollNumber,
            previousRollNumber: student.rollNumber,
            approvedAt: new Date().toISOString(),
          }),
        },
      });

      return activeStudent;
    });

    return {
      student: updatedStudent,
      message: `Student ${student.name} approved successfully with Roll Number ${assignedRollNumber}`,
    };
  }

  async assignClass(adminUserId: string, studentId: string, classId: string | null) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { department: true, class: true },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "NOT_FOUND");
    }

    let finalClassId: string | null = null;
    let finalAcademicYearId: string | null = null;
    let classLabel = "Unassigned";

    if (classId && classId !== "NONE" && classId !== "") {
      const classCohort = await prisma.class.findUnique({
        where: { id: classId },
      });
      if (!classCohort) {
        throw new AppError("Selected class cohort does not exist", 400, "INVALID_CLASS");
      }
      finalClassId = classCohort.id;
      finalAcademicYearId = classCohort.academicYearId;
      classLabel = classCohort.label;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.student.update({
        where: { id: studentId },
        data: {
          classId: finalClassId,
          academicYearId: finalAcademicYearId,
        },
        include: {
          class: { select: { id: true, label: true, semesterNumber: true, division: true } },
          department: { select: { id: true, name: true, code: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "STUDENT_CLASS_ASSIGNED",
          entityType: "Student",
          entityId: studentId,
          metadata: JSON.stringify({
            previousClassId: student.classId,
            newClassId: finalClassId,
            classLabel,
            assignedAt: new Date().toISOString(),
          }),
        },
      });

      return res;
    });

    return {
      student: updated,
      message: `Class cohort updated successfully to ${classLabel}`,
    };
  }

  async listStudents(params: {
    search?: string;
    departmentId?: string;
    academicYearId?: string;
    classId?: string;
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(params.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search && params.search.trim()) {
      const q = params.search.trim();
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { rollNumber: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    if (params.departmentId && params.departmentId !== "ALL") {
      where.departmentId = params.departmentId;
    }

    if (params.academicYearId && params.academicYearId !== "ALL") {
      where.academicYearId = params.academicYearId;
    }

    if (params.classId && params.classId !== "ALL") {
      where.classId = params.classId;
    }

    if (params.status && params.status !== "ALL") {
      where.status = params.status as StudentStatus;
    }

    const [total, students] = await Promise.all([
      prisma.student.count({ where }),
      prisma.student.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ status: "asc" }, { rollNumber: "asc" }],
        select: {
          id: true,
          rollNumber: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          academicYear: {
            select: {
              id: true,
              label: true,
            },
          },
          class: {
            select: {
              id: true,
              label: true,
              semesterNumber: true,
              division: true,
            },
          },
          faceEnrollment: {
            select: {
              id: true,
              status: true,
              modelVersion: true,
              enrolledAt: true,
            },
          },
          biometricConsent: {
            select: {
              id: true,
              status: true,
              consentVersion: true,
              consentedAt: true,
            },
          },
        },
      }),
    ]);

    return {
      students,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getStudentStats() {
    const [total, pending, active, inactive] = await Promise.all([
      prisma.student.count(),
      prisma.student.count({ where: { status: StudentStatus.PENDING } }),
      prisma.student.count({ where: { status: StudentStatus.ACTIVE } }),
      prisma.student.count({
        where: {
          status: { in: [StudentStatus.INACTIVE, StudentStatus.GRADUATED] },
        },
      }),
    ]);

    return {
      total,
      pending,
      active,
      inactive,
    };
  }

  async getStudentById(studentId: string) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        rollNumber: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        class: {
          select: {
            id: true,
            label: true,
            semesterNumber: true,
            division: true,
          },
        },
        department: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        academicYear: {
          select: {
            id: true,
            label: true,
          },
        },
        faceEnrollment: {
          select: {
            id: true,
            status: true,
            modelVersion: true,
            consentVersion: true,
            consentedAt: true,
          },
        },
      },
    });

    if (!student) {
      throw new AppError("Student not found", 404, "NOT_FOUND");
    }

    return student;
  }

  async createStudent(
    adminUserId: string,
    input: {
      name: string;
      email: string;
      departmentId: string;
      classId?: string;
      password?: string;
    }
  ) {
    if (!input.name || !input.name.trim()) {
      throw new AppError("Student name is required", 400, "VALIDATION_ERROR");
    }
    if (!input.email || !input.email.trim()) {
      throw new AppError("Student email is required", 400, "VALIDATION_ERROR");
    }
    if (!input.departmentId || !input.departmentId.trim()) {
      throw new AppError("Department is required", 400, "VALIDATION_ERROR");
    }

    const cleanEmail = input.email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: cleanEmail },
    });
    if (existingUser) {
      throw new AppError("A user with this email address already exists", 409, "USER_ALREADY_EXISTS");
    }

    const existingStudent = await prisma.student.findUnique({
      where: { email: cleanEmail },
    });
    if (existingStudent) {
      throw new AppError("A student with this email address already exists", 409, "STUDENT_ALREADY_EXISTS");
    }

    const department = await prisma.department.findUnique({
      where: { id: input.departmentId },
    });
    if (!department) {
      throw new AppError("Selected department does not exist", 400, "INVALID_DEPARTMENT");
    }

    let finalClassId: string | null = null;
    let finalAcademicYearId: string | null = null;
    if (input.classId && input.classId !== "NONE" && input.classId !== "ALL") {
      const classCohort = await prisma.class.findUnique({
        where: { id: input.classId },
      });
      if (!classCohort) {
        throw new AppError("Selected class does not exist", 400, "INVALID_CLASS");
      }
      finalClassId = classCohort.id;
      finalAcademicYearId = classCohort.academicYearId;
    }

    const deptCode = (department.code || "STU").toUpperCase();
    const currentYear = new Date().getFullYear();
    const prefix = `${deptCode}-${currentYear}`;

    const existingCohortStudents = await prisma.student.findMany({
      where: {
        departmentId: department.id,
        rollNumber: {
          startsWith: `${prefix}-`,
        },
      },
      select: { rollNumber: true },
    });

    let maxSeq = 0;
    for (const item of existingCohortStudents) {
      const parts = item.rollNumber.split("-");
      const lastPart = parts[parts.length - 1] ?? "";
      const seq = parseInt(lastPart, 10);
      if (!isNaN(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    }
    const nextSeq = maxSeq + 1;
    const assignedRollNumber = `${prefix}-${String(nextSeq).padStart(3, "0")}`;

    const rawPassword = input.password && input.password.trim() ? input.password.trim() : "Password123!";
    const passwordHash = await bcrypt.hash(rawPassword, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: input.name.trim(),
          email: cleanEmail,
          passwordHash,
          role: Role.STUDENT,
          status: UserStatus.ACTIVE,
          mustChangePassword: true,
        },
      });

      const student = await tx.student.create({
        data: {
          userId: user.id,
          rollNumber: assignedRollNumber,
          name: input.name.trim(),
          email: cleanEmail,
          departmentId: department.id,
          classId: finalClassId,
          academicYearId: finalAcademicYearId,
          status: StudentStatus.ACTIVE,
        },
        include: {
          department: { select: { id: true, name: true, code: true } },
          class: { select: { id: true, label: true, semesterNumber: true, division: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: adminUserId,
          action: "STUDENT_ADMIN_CREATED",
          entityType: "Student",
          entityId: student.id,
          metadata: JSON.stringify({
            name: student.name,
            email: student.email,
            rollNumber: student.rollNumber,
          }),
        },
      });

      return student;
    });

    return {
      student: result,
      message: `Student created successfully with Roll Number ${assignedRollNumber}`,
    };
  }
}

export const studentsService = new StudentsService();
