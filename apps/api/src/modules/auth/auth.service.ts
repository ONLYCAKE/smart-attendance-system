import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Role, UserStatus, StudentStatus } from "@prisma/client";
import { LoginInput, StudentRegisterInput } from "@smart-attendance/shared";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";

export class AuthService {
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
      include: {
        studentProfile: {
          select: { id: true, status: true, rollNumber: true, classId: true },
        },
      },
    });

    if (!user) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    const isMatch = await bcrypt.compare(input.password, user.passwordHash);
    if (!isMatch) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }

    if (user.status === UserStatus.PENDING) {
      throw new AppError(
        "Your account is pending administrator approval before you can sign in",
        403,
        "ACCOUNT_PENDING"
      );
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError("Your account is currently inactive or suspended", 403, "ACCOUNT_INACTIVE");
    }

    // Generate hardened token
    const token = jwt.sign(
      {
        userId: user.id,
        role: user.role,
        email: user.email,
        tokenVersion: user.tokenVersion,
      },
      env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "7d",
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      }
    );

    return {
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentProfile?.id,
        rollNumber: user.studentProfile?.rollNumber,
        classId: user.studentProfile?.classId,
      },
    };
  }

  async logout(userId?: string) {
    if (userId) {
      await prisma.user.update({
        where: { id: userId },
        data: { tokenVersion: { increment: 1 } },
      });
    }
  }

  async registerStudent(input: StudentRegisterInput) {
    const normalizedEmail = input.email.toLowerCase().trim();

    // 1. Check for email collision
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (existingUser) {
      throw new AppError("An account with this email already exists", 409, "EMAIL_EXISTS");
    }

    // 2. Validate academic structure existence
    const classCohort = await prisma.class.findUnique({
      where: { id: input.classId },
    });
    if (!classCohort) {
      throw new AppError("Selected academic class does not exist", 400, "INVALID_CLASS");
    }

    // 3. Check for roll number collision within class
    const existingRoll = await prisma.student.findUnique({
      where: {
        classId_rollNumber: {
          classId: input.classId,
          rollNumber: input.rollNumber.trim(),
        },
      },
    });
    if (existingRoll) {
      throw new AppError(
        "A student with this roll number is already registered in this class",
        409,
        "ROLL_NUMBER_EXISTS"
      );
    }

    // 4. Hash password
    const passwordHash = await bcrypt.hash(input.password, 10);

    // 5. Transactional write creating pending user and student record
    const result = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name: input.name.trim(),
          email: normalizedEmail,
          passwordHash,
          role: Role.STUDENT,
          status: UserStatus.PENDING,
        },
      });

      const newStudent = await tx.student.create({
        data: {
          userId: newUser.id,
          rollNumber: input.rollNumber.trim(),
          name: input.name.trim(),
          email: normalizedEmail,
          departmentId: input.departmentId,
          academicYearId: input.academicYearId,
          classId: input.classId,
          status: StudentStatus.PENDING,
        },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: newUser.id,
          action: "STUDENT_SELF_REGISTERED",
          entityType: "Student",
          entityId: newStudent.id,
          metadata: JSON.stringify({
            rollNumber: newStudent.rollNumber,
            classId: newStudent.classId,
            registeredAt: new Date().toISOString(),
          }),
        },
      });

      return newStudent;
    });

    return {
      studentId: result.id,
      name: result.name,
      email: result.email,
      status: result.status,
      message: "Registration submitted successfully. Your account is pending administrator approval.",
    };
  }

  async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        studentProfile: {
          select: {
            id: true,
            rollNumber: true,
            status: true,
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
            faceEnrollment: {
              select: {
                id: true,
                status: true,
                modelVersion: true,
                consentedAt: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new AppError("User not found", 404, "NOT_FOUND");
    }

    return user;
  }
}

export const authService = new AuthService();
