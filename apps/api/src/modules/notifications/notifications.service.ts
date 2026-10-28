import { Role, SessionStatus, AttendanceStatus, StudentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import { settingsService } from "../settings/settings.service.js";
import { NotificationQuery } from "@smart-attendance/shared";

export class NotificationsService {
  /**
   * Evaluates a student's attendance against the configured threshold.
   * Creates an alert if below threshold and not already alerted (deduplication).
   * Automatically resolves active alerts if attendance recovers or improves.
   * Strictly excludes cancelled and scheduled sessions.
   * Never generates an alert if zero eligible sessions have been held.
   */
  async evaluateStudentAlerts(studentId: string) {
    const student = await prisma.student.findUnique({
      where: { id: studentId },
      include: {
        class: { select: { id: true, label: true } },
      },
    });

    if (!student || student.status !== StudentStatus.ACTIVE) {
      return { action: "SKIPPED_INACTIVE", percentage: null };
    }

    const threshold = await settingsService.getLowAttendanceThreshold();

    if (!student.classId) {
      return {
        evaluated: true,
        lowAttendance: false,
        attendancePercent: 100,
        notification: null,
      };
    }

    // 1. Query eligible sessions (ACTIVE or COMPLETED; CANCELLED and SCHEDULED excluded)
    const eligibleSessions = await prisma.attendanceSession.findMany({
      where: {
        classId: student.classId,
        status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
      },
      select: { id: true },
    });

    const totalEligibleSessions = eligibleSessions.length;
    const dedupKey = "LOW_ATTENDANCE:OVERALL";

    // 2. Edge Case: Zero eligible sessions held
    if (totalEligibleSessions === 0) {
      // If an unresolved alert exists, resolve it because there are no held sessions
      await prisma.notification.updateMany({
        where: {
          studentId: student.id,
          dedupKey,
          status: { in: ["UNREAD", "READ"] },
        },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });
      return { action: "NONE_NO_SESSIONS", percentage: null, threshold };
    }

    // 3. Query student attendance records for eligible sessions
    const eligibleSessionIds = eligibleSessions.map((s) => s.id);
    const records = await prisma.attendanceRecord.findMany({
      where: {
        studentId: student.id,
        sessionId: { in: eligibleSessionIds },
      },
      select: { status: true },
    });

    let attendedCount = 0;
    for (const rec of records) {
      if (rec.status === AttendanceStatus.PRESENT || rec.status === AttendanceStatus.LATE) {
        attendedCount += 1;
      }
    }

    const percentage = Math.round((attendedCount / totalEligibleSessions) * 1000) / 10;

    // 4. Check against threshold
    if (percentage < threshold) {
      // Student is below threshold. Check if an unresolved alert already exists
      const existingAlert = await prisma.notification.findFirst({
        where: {
          studentId: student.id,
          dedupKey,
          status: { in: ["UNREAD", "READ"] },
        },
      });

      const message = `Attendance Alert: Your overall attendance is currently ${percentage}%, which is below the required threshold of ${threshold}%.`;
      const metadata = JSON.stringify({
        threshold,
        percentage,
        totalEligibleSessions,
        attendedCount,
        evaluatedAt: new Date().toISOString(),
      });

      if (existingAlert) {
        // Stable Deduplication: Update existing alert with latest figures without creating duplicate
        await prisma.notification.update({
          where: { id: existingAlert.id },
          data: { message, metadata },
        });
        return { action: "DEDUPLICATED_UPDATED", notificationId: existingAlert.id, percentage, threshold };
      }

      // Create new notification
      const created = await prisma.notification.create({
        data: {
          studentId: student.id,
          type: "LOW_ATTENDANCE",
          dedupKey,
          status: "UNREAD",
          message,
          metadata,
        },
      });
      return { action: "CREATED", notificationId: created.id, percentage, threshold };
    } else {
      // Student is in good standing (percentage >= threshold).
      // Automatically resolve any existing active alert
      const resolved = await prisma.notification.updateMany({
        where: {
          studentId: student.id,
          dedupKey,
          status: { in: ["UNREAD", "READ"] },
        },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });

      return {
        action: resolved.count > 0 ? "RESOLVED" : "NONE_IN_GOOD_STANDING",
        resolvedCount: resolved.count,
        percentage,
        threshold,
      };
    }
  }

  /**
   * Retrieves notifications for the authenticated student.
   * Student identity is derived exclusively from actorUserId.
   */
  async getStudentNotifications(actorUserId: string, query: NotificationQuery) {
    const student = await prisma.student.findUnique({
      where: { userId: actorUserId },
      include: {
        class: { select: { id: true, label: true } },
      },
    });

    if (!student) {
      throw new AppError("Student profile not found", 404, "STUDENT_NOT_FOUND");
    }

    // Refresh student alert state
    const evalResult = await this.evaluateStudentAlerts(student.id);

    const where: any = { studentId: student.id };
    if (query.status) {
      where.status = query.status;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [notifications, total, unreadCount, activeAlert] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({
        where: { studentId: student.id, status: "UNREAD" },
      }),
      prisma.notification.findFirst({
        where: {
          studentId: student.id,
          dedupKey: "LOW_ATTENDANCE:OVERALL",
          status: { in: ["UNREAD", "READ"] },
        },
      }),
    ]);

    return {
      notifications,
      unreadCount,
      hasActiveAlert: !!activeAlert,
      activeAlert,
      summary: {
        currentPercentage: evalResult.percentage,
        threshold: evalResult.threshold,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Marks a notification as READ for the student owner.
   */
  async markAsRead(notificationId: string, actorUserId: string) {
    const student = await prisma.student.findUnique({
      where: { userId: actorUserId },
    });

    if (!student) {
      throw new AppError("Student profile not found", 404, "STUDENT_NOT_FOUND");
    }

    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
    }

    if (notification.studentId !== student.id) {
      throw new AppError("You are not authorized to update this notification", 403, "FORBIDDEN");
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { status: "READ" },
    });
  }

  /**
   * Resolves a notification (student owner, assigned teacher, or admin).
   */
  async resolveNotification(notificationId: string, actorUserId: string, actorRole: Role) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      include: {
        student: { select: { id: true, userId: true, classId: true } },
      },
    });

    if (!notification) {
      throw new AppError("Notification not found", 404, "NOTIFICATION_NOT_FOUND");
    }

    if (actorRole === Role.STUDENT) {
      if (notification.student.userId !== actorUserId) {
        throw new AppError("You are not authorized to resolve this notification", 403, "FORBIDDEN");
      }
    } else if (actorRole === Role.TEACHER) {
      const assignment = await prisma.teacherAssignment.findFirst({
        where: {
          teacherUserId: actorUserId,
          classId: notification.student.classId || undefined,
          active: true,
        },
      });
      if (!assignment) {
        throw new AppError(
          "You are not authorized to resolve notifications for students in this class",
          403,
          "FORBIDDEN"
        );
      }
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Retrieves active low-attendance notifications for students in a specific class.
   * Access restricted to assigned teachers and administrators.
   */
  async getClassNotifications(classId: string, actorUserId: string, actorRole: Role) {
    if (actorRole === Role.TEACHER) {
      const assignment = await prisma.teacherAssignment.findFirst({
        where: {
          teacherUserId: actorUserId,
          classId,
          active: true,
        },
      });
      if (!assignment) {
        throw new AppError(
          "You are not authorized to view attendance alerts for this class",
          403,
          "FORBIDDEN"
        );
      }
    }

    const classCohort = await prisma.class.findUnique({
      where: { id: classId },
    });
    if (!classCohort) {
      throw new AppError("Class not found", 404, "CLASS_NOT_FOUND");
    }

    return prisma.notification.findMany({
      where: {
        student: { classId },
        type: "LOW_ATTENDANCE",
        status: { in: ["UNREAD", "READ"] },
      },
      include: {
        student: {
          select: { id: true, rollNumber: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Triggers alert evaluation for an entire class cohort or individual student.
   * Accessible by assigned teachers (for their classes) and administrators.
   */
  async evaluateClassAlerts(classId: string, actorUserId: string, actorRole: Role) {
    if (actorRole === Role.TEACHER) {
      const assignment = await prisma.teacherAssignment.findFirst({
        where: {
          teacherUserId: actorUserId,
          classId,
          active: true,
        },
      });
      if (!assignment) {
        throw new AppError(
          "You are not authorized to trigger evaluation for this class",
          403,
          "FORBIDDEN"
        );
      }
    }

    const students = await prisma.student.findMany({
      where: { classId, status: StudentStatus.ACTIVE },
      select: { id: true },
    });

    let alertsCreated = 0;
    let alertsResolved = 0;
    let alertsDeduplicated = 0;

    for (const s of students) {
      const res = await this.evaluateStudentAlerts(s.id);
      if (res.action === "CREATED") alertsCreated += 1;
      else if (res.action === "RESOLVED") alertsResolved += 1;
      else if (res.action === "DEDUPLICATED_UPDATED") alertsDeduplicated += 1;
    }

    return {
      totalStudents: students.length,
      evaluatedCount: students.length,
      alertsCreated,
      alertsResolved,
      alertsDeduplicated,
    };
  }

  /**
   * Institution-wide alert evaluation across all active cohorts.
   * Admin only.
   */
  async evaluateInstitutionAlerts() {
    const activeClasses = await prisma.class.findMany({
      where: { active: true },
      select: { id: true },
    });

    let totalStudents = 0;
    let totalCreated = 0;
    let totalResolved = 0;

    for (const c of activeClasses) {
      const res = await this.evaluateClassAlerts(c.id, "", Role.ADMIN);
      totalStudents += res.totalStudents;
      totalCreated += res.alertsCreated;
      totalResolved += res.alertsResolved;
    }

    return {
      classesCount: activeClasses.length,
      totalStudents,
      totalCreated,
      totalResolved,
    };
  }
}

export const notificationsService = new NotificationsService();
