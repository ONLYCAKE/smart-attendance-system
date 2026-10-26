import { StudentStatus, UserStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

export class StudentsService {
  async approveStudent(adminUserId: string, studentId: string) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: { user: true },
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

    const updatedStudent = await prisma.$transaction(async (tx) => {
      // 1. Activate Student record
      const activeStudent = await tx.student.update({
        where: { id: studentId },
        data: { status: StudentStatus.ACTIVE },
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
            studentRollNumber: student.rollNumber,
            approvedAt: new Date().toISOString(),
          }),
        },
      });

      return activeStudent;
    });

    return {
      student: updatedStudent,
      message: `Student ${student.name} (${student.rollNumber}) has been approved successfully`,
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
}

export const studentsService = new StudentsService();
