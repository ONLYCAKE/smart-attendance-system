import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import type { Response } from "express";
import { Role, SessionStatus, AttendanceStatus, StudentStatus } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";
import {
  StudentReportQuery,
  TeacherReportQuery,
  AdminSummaryQuery,
  DashboardQuery,
  StudentExportQuery,
  TeacherExportQuery,
  AdminExportQuery,
} from "@smart-attendance/shared";
import { UTF8_BOM, formatCsvRow, sanitizeFilename } from "./csv-export.util.js";

export class ReportsService {
  /**
   * Retrieves role-scoped personal attendance history and metrics for authenticated student.
   * Student identity is derived exclusively from actorUserId.
   */
  async getStudentPersonalReport(actorUserId: string, query: StudentReportQuery) {
    // 1. Resolve student profile
    const student = await prisma.student.findUnique({
      where: { userId: actorUserId },
      include: {
        class: {
          select: {
            id: true,
            label: true,
            division: true,
            semesterNumber: true,
            department: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!student) {
      throw new AppError("Student profile not found for authenticated user", 404, "STUDENT_NOT_FOUND");
    }

    if (student.status !== StudentStatus.ACTIVE) {
      throw new AppError("Student account is pending approval or inactive", 403, "STUDENT_NOT_ACTIVE");
    }

    // 2. Build date & subject filters
    const dateFilter: any = {};
    if (query.dateFrom) dateFilter.gte = new Date(query.dateFrom);
    if (query.dateTo) dateFilter.lte = new Date(query.dateTo);

    // 3. Find all eligible held sessions (ACTIVE or COMPLETED)
    let eligibleSessions: any[] = [];
    if (student.classId) {
      const sessionWhere: any = {
        classId: student.classId,
        status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] }, // Cancelled and future scheduled sessions excluded
      };
      if (query.subjectId) sessionWhere.subjectId = query.subjectId;
      if (query.dateFrom || query.dateTo) sessionWhere.startsAt = dateFilter;

      eligibleSessions = await prisma.attendanceSession.findMany({
        where: sessionWhere,
        include: {
          subject: { select: { id: true, code: true, name: true } },
        },
        orderBy: { startsAt: "desc" },
      });
    }

    const eligibleSessionIds = eligibleSessions.map((s) => s.id);

    // 4. Query student's persisted attendance records
    const recordWhere: any = {
      studentId: student.id,
      sessionId: { in: eligibleSessionIds },
    };
    if (query.status) {
      recordWhere.status = query.status;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [records, totalMatchingRecords, allStudentRecordsForHeldSessions] = await Promise.all([
      prisma.attendanceRecord.findMany({
        where: recordWhere,
        include: {
          session: {
            select: {
              id: true,
              startsAt: true,
              endsAt: true,
              status: true,
              subject: { select: { id: true, code: true, name: true } },
              teacher: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { session: { startsAt: "desc" } },
        skip,
        take: limit,
      }),
      prisma.attendanceRecord.count({ where: recordWhere }),
      // All records for percentage calculation (independent of pagination/status filter)
      prisma.attendanceRecord.findMany({
        where: {
          studentId: student.id,
          sessionId: { in: eligibleSessionIds },
        },
        select: {
          sessionId: true,
          status: true,
          session: { select: { subjectId: true } },
        },
      }),
    ]);

    // 5. Subject-wise percentage & aggregate calculations
    const subjectSessionMap = new Map<string, { subject: { id: string; code: string; name: string }; totalSessions: number }>();
    for (const sess of eligibleSessions) {
      const existing = subjectSessionMap.get(sess.subjectId);
      if (existing) {
        existing.totalSessions += 1;
      } else {
        subjectSessionMap.set(sess.subjectId, {
          subject: sess.subject,
          totalSessions: 1,
        });
      }
    }

    const subjectRecordCounts = new Map<string, { present: number; late: number; absent: number; excused: number }>();
    let totalPresent = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalExcused = 0;

    for (const rec of allStudentRecordsForHeldSessions) {
      const subId = rec.session.subjectId;
      if (!subjectRecordCounts.has(subId)) {
        subjectRecordCounts.set(subId, { present: 0, late: 0, absent: 0, excused: 0 });
      }
      const counts = subjectRecordCounts.get(subId)!;

      if (rec.status === AttendanceStatus.PRESENT) {
        counts.present += 1;
        totalPresent += 1;
      } else if (rec.status === AttendanceStatus.LATE) {
        counts.late += 1;
        totalLate += 1;
      } else if (rec.status === AttendanceStatus.ABSENT) {
        counts.absent += 1;
        totalAbsent += 1;
      } else if (rec.status === AttendanceStatus.EXCUSED) {
        counts.excused += 1;
        totalExcused += 1;
      }
    }

    const subjectBreakdown = Array.from(subjectSessionMap.entries()).map(([subId, data]) => {
      const counts = subjectRecordCounts.get(subId) || { present: 0, late: 0, absent: 0, excused: 0 };
      const attended = counts.present + counts.late;
      const percentage = data.totalSessions > 0 ? Math.round((attended / data.totalSessions) * 1000) / 10 : null;

      return {
        subject: data.subject,
        totalSessions: data.totalSessions,
        attendedCount: attended,
        presentCount: counts.present,
        lateCount: counts.late,
        absentCount: counts.absent,
        excusedCount: counts.excused,
        unrecordedCount: Math.max(0, data.totalSessions - (counts.present + counts.late + counts.absent + counts.excused)),
        percentage,
      };
    });

    const totalEligibleSessions = eligibleSessions.length;
    const totalAttended = totalPresent + totalLate;
    const overallPercentage = totalEligibleSessions > 0
      ? Math.round((totalAttended / totalEligibleSessions) * 1000) / 10
      : null;

    return {
      student: {
        id: student.id,
        rollNumber: student.rollNumber,
        name: student.name,
        email: student.email,
        class: student.class,
      },
      summary: {
        totalEligibleSessions,
        attendedCount: totalAttended,
        presentCount: totalPresent,
        lateCount: totalLate,
        absentCount: totalAbsent,
        excusedCount: totalExcused,
        unrecordedCount: Math.max(0, totalEligibleSessions - (totalPresent + totalLate + totalAbsent + totalExcused)),
        overallPercentage,
      },
      subjects: subjectBreakdown,
      history: records,
      pagination: {
        page,
        limit,
        total: totalMatchingRecords,
        totalPages: Math.ceil(totalMatchingRecords / limit),
      },
    };
  }

  /**
   * Retrieves class attendance report with role-scoped authorization.
   * Teachers can only query classes/subjects they are assigned to.
   * Admins can query any class.
   */
  async getTeacherAttendanceReport(
    actorUserId: string,
    actorRole: Role,
    query: TeacherReportQuery
  ) {
    const { classId, subjectId, dateFrom, dateTo, search } = query;

    // 1. Authorization Gate: Verify assignment if role is TEACHER
    if (actorRole === Role.TEACHER) {
      const assignmentWhere: any = {
        teacherUserId: actorUserId,
        classId,
        active: true,
      };
      if (subjectId) {
        assignmentWhere.subjectId = subjectId;
      }

      const assignment = await prisma.teacherAssignment.findFirst({
        where: assignmentWhere,
      });

      if (!assignment) {
        throw new AppError(
          "You are not authorized to access attendance reports for this class or subject",
          403,
          "FORBIDDEN"
        );
      }
    }

    // 2. Fetch Class Details
    const classCohort = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        department: { select: { id: true, code: true, name: true } },
        academicYear: { select: { id: true, label: true } },
      },
    });

    if (!classCohort) {
      throw new AppError("Class not found", 404, "CLASS_NOT_FOUND");
    }

    // 3. Find all eligible held sessions (excluding cancelled and scheduled)
    const sessionWhere: any = {
      classId,
      status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
    };
    if (subjectId) sessionWhere.subjectId = subjectId;
    if (dateFrom || dateTo) {
      sessionWhere.startsAt = {};
      if (dateFrom) sessionWhere.startsAt.gte = new Date(dateFrom);
      if (dateTo) sessionWhere.startsAt.lte = new Date(dateTo);
    }

    const eligibleSessions = await prisma.attendanceSession.findMany({
      where: sessionWhere,
      select: { id: true, subjectId: true, startsAt: true, status: true },
    });

    const totalSessionsHeld = eligibleSessions.length;
    const sessionIds = eligibleSessions.map((s) => s.id);

    // 4. Fetch Active Students in Class (Filterable by search, paginated)
    const studentWhere: any = {
      classId,
      status: StudentStatus.ACTIVE,
    };
    if (search && search.trim()) {
      studentWhere.OR = [
        { name: { contains: search.trim(), mode: "insensitive" } },
        { rollNumber: { contains: search.trim(), mode: "insensitive" } },
      ];
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const [students, totalStudentsInQuery, allClassStudents] = await Promise.all([
      prisma.student.findMany({
        where: studentWhere,
        select: { id: true, rollNumber: true, name: true, email: true },
        orderBy: { rollNumber: "asc" },
        skip,
        take: limit,
      }),
      prisma.student.count({ where: studentWhere }),
      // All active students for class averages
      prisma.student.findMany({
        where: { classId, status: StudentStatus.ACTIVE },
        select: { id: true },
      }),
    ]);

    // 5. Fetch all records for the sessions
    const allRecords = sessionIds.length > 0
      ? await prisma.attendanceRecord.findMany({
          where: { sessionId: { in: sessionIds } },
          select: { studentId: true, status: true, sessionId: true },
        })
      : [];

    // Map records by studentId
    const studentRecordMap = new Map<string, { present: number; late: number; absent: number; excused: number }>();
    for (const rec of allRecords) {
      if (!studentRecordMap.has(rec.studentId)) {
        studentRecordMap.set(rec.studentId, { present: 0, late: 0, absent: 0, excused: 0 });
      }
      const counts = studentRecordMap.get(rec.studentId)!;
      if (rec.status === AttendanceStatus.PRESENT) counts.present += 1;
      else if (rec.status === AttendanceStatus.LATE) counts.late += 1;
      else if (rec.status === AttendanceStatus.ABSENT) counts.absent += 1;
      else if (rec.status === AttendanceStatus.EXCUSED) counts.excused += 1;
    }

    // Calculate per-student breakdown for paginated students
    const studentRoster = students.map((s) => {
      const counts = studentRecordMap.get(s.id) || { present: 0, late: 0, absent: 0, excused: 0 };
      const attended = counts.present + counts.late;
      const recorded = counts.present + counts.late + counts.absent + counts.excused;
      const unrecorded = Math.max(0, totalSessionsHeld - recorded);
      const percentage = totalSessionsHeld > 0 ? Math.round((attended / totalSessionsHeld) * 1000) / 10 : null;

      return {
        student: s,
        totalSessions: totalSessionsHeld,
        attendedCount: attended,
        presentCount: counts.present,
        lateCount: counts.late,
        absentCount: counts.absent,
        excusedCount: counts.excused,
        unrecordedCount: unrecorded,
        percentage,
      };
    });

    // 6. Aggregate Class Statistics
    const thresholdSetting = await prisma.systemSetting.findUnique({
      where: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT" },
    });
    const lowAttendanceThreshold = thresholdSetting ? parseFloat(thresholdSetting.value) : 75.0;

    let sumPercentages = 0;
    let studentsWithPercentage = 0;
    let belowThresholdCount = 0;

    for (const s of allClassStudents) {
      const counts = studentRecordMap.get(s.id) || { present: 0, late: 0, absent: 0, excused: 0 };
      const attended = counts.present + counts.late;
      if (totalSessionsHeld > 0) {
        const pct = (attended / totalSessionsHeld) * 100;
        sumPercentages += pct;
        studentsWithPercentage += 1;
        if (pct < lowAttendanceThreshold) {
          belowThresholdCount += 1;
        }
      }
    }

    const classAveragePercentage = studentsWithPercentage > 0
      ? Math.round((sumPercentages / studentsWithPercentage) * 10) / 10
      : null;

    return {
      class: classCohort,
      summary: {
        totalStudents: allClassStudents.length,
        totalSessionsHeld,
        classAveragePercentage,
        lowAttendanceThreshold,
        belowThresholdCount,
      },
      students: studentRoster,
      pagination: {
        page,
        limit,
        total: totalStudentsInQuery,
        totalPages: Math.ceil(totalStudentsInQuery / limit),
      },
    };
  }

  /**
   * Retrieves institution-level summaries grouped by Department and Class.
   * Access restricted to ADMIN.
   */
  async getAdminInstitutionSummary(query: AdminSummaryQuery) {
    const { departmentId, academicYearId } = query;

    const classWhere: any = { active: true };
    if (departmentId) classWhere.departmentId = departmentId;
    if (academicYearId) classWhere.academicYearId = academicYearId;

    const [departments, classes, sessions, students] = await Promise.all([
      prisma.department.findMany({
        where: departmentId ? { id: departmentId } : { active: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: "asc" },
      }),
      prisma.class.findMany({
        where: classWhere,
        include: {
          department: { select: { id: true, code: true } },
          academicYear: { select: { id: true, label: true } },
          _count: {
            select: {
              students: { where: { status: StudentStatus.ACTIVE } },
              attendanceSessions: { where: { status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] } } },
            },
          },
        },
        orderBy: { label: "asc" },
      }),
      prisma.attendanceSession.findMany({
        where: {
          class: classWhere,
          status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
        },
        select: {
          id: true,
          classId: true,
          class: { select: { departmentId: true } },
        },
      }),
      prisma.student.findMany({
        where: {
          class: classWhere,
          status: StudentStatus.ACTIVE,
        },
        select: { id: true, classId: true, departmentId: true },
      }),
    ]);

    const sessionIds = sessions.map((s) => s.id);

    // Records for attendance calculations
    const records = sessionIds.length > 0
      ? await prisma.attendanceRecord.findMany({
          where: { sessionId: { in: sessionIds } },
          select: {
            studentId: true,
            status: true,
            session: { select: { classId: true, class: { select: { departmentId: true } } } },
          },
        })
      : [];

    // Map attended counts per class
    const classAttendedMap = new Map<string, { attended: number; totalOpportunities: number }>();
    const deptAttendedMap = new Map<string, { attended: number; totalOpportunities: number }>();

    for (const c of classes) {
      const activeStudents = c._count.students;
      const totalSessions = c._count.attendanceSessions;
      const opportunities = activeStudents * totalSessions;
      classAttendedMap.set(c.id, { attended: 0, totalOpportunities: opportunities });

      const deptId = c.department.id;
      if (!deptAttendedMap.has(deptId)) {
        deptAttendedMap.set(deptId, { attended: 0, totalOpportunities: 0 });
      }
      deptAttendedMap.get(deptId)!.totalOpportunities += opportunities;
    }

    for (const rec of records) {
      const isAttended = rec.status === AttendanceStatus.PRESENT || rec.status === AttendanceStatus.LATE;
      if (isAttended) {
        const cEntry = classAttendedMap.get(rec.session.classId);
        if (cEntry) cEntry.attended += 1;

        const dEntry = deptAttendedMap.get(rec.session.class.departmentId);
        if (dEntry) dEntry.attended += 1;
      }
    }

    let overallAttended = 0;
    let overallOpportunities = 0;

    const classBreakdown = classes.map((c) => {
      const stats = classAttendedMap.get(c.id) || { attended: 0, totalOpportunities: 0 };
      overallAttended += stats.attended;
      overallOpportunities += stats.totalOpportunities;

      const avgPercentage = stats.totalOpportunities > 0
        ? Math.round((stats.attended / stats.totalOpportunities) * 1000) / 10
        : null;

      return {
        classId: c.id,
        label: c.label,
        division: c.division,
        semesterNumber: c.semesterNumber,
        departmentCode: c.department.code,
        academicYearLabel: c.academicYear.label,
        studentCount: c._count.students,
        sessionCount: c._count.attendanceSessions,
        averageAttendancePercentage: avgPercentage,
      };
    });

    const departmentBreakdown = departments.map((d) => {
      const stats = deptAttendedMap.get(d.id) || { attended: 0, totalOpportunities: 0 };
      const avgPercentage = stats.totalOpportunities > 0
        ? Math.round((stats.attended / stats.totalOpportunities) * 1000) / 10
        : null;

      const deptClasses = classes.filter((c) => c.department.id === d.id);
      const studentCount = deptClasses.reduce((acc, c) => acc + c._count.students, 0);
      const sessionCount = deptClasses.reduce((acc, c) => acc + c._count.attendanceSessions, 0);

      return {
        departmentId: d.id,
        code: d.code,
        name: d.name,
        classCount: deptClasses.length,
        studentCount,
        sessionCount,
        averageAttendancePercentage: avgPercentage,
      };
    });

    const overallAverageAttendance = overallOpportunities > 0
      ? Math.round((overallAttended / overallOpportunities) * 1000) / 10
      : null;

    return {
      summary: {
        totalDepartments: departments.length,
        totalClasses: classes.length,
        totalActiveStudents: students.length,
        totalSessionsHeld: sessions.length,
        overallAverageAttendance,
      },
      departments: departmentBreakdown,
      classes: classBreakdown,
    };
  }

  /**
   * Retrieves role-specific dashboard metrics, trend chart data, and breakdowns.
   */
  async getDashboardMetrics(actorUserId: string, actorRole: Role, query: DashboardQuery) {
    const days = Math.min(90, Math.max(7, query.days || 30));
    const startDate = new Date(Date.now() - days * 86400000);

    if (actorRole === Role.STUDENT) {
      const student = await prisma.student.findUnique({
        where: { userId: actorUserId },
        include: {
          class: { select: { id: true, label: true } },
          department: { select: { id: true, code: true, name: true } },
          faceEnrollment: { select: { id: true, status: true } },
        },
      });

      if (!student) {
        throw new AppError("Student profile not found for authenticated user", 404, "STUDENT_NOT_FOUND");
      }

      if (student.status !== StudentStatus.ACTIVE) {
        throw new AppError("Student account is pending approval or inactive", 403, "STUDENT_NOT_ACTIVE");
      }

      let sessions: any[] = [];
      if (student.classId) {
        const sessionWhere: any = {
          classId: student.classId,
          status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
          startsAt: { gte: startDate },
        };
        if (query.subjectId) sessionWhere.subjectId = query.subjectId;

        sessions = await prisma.attendanceSession.findMany({
          where: sessionWhere,
          include: {
            subject: { select: { id: true, code: true, name: true } },
          },
          orderBy: { startsAt: "asc" },
        });
      }

      const sessionIds = sessions.map((s) => s.id);

      const records = sessionIds.length > 0
        ? await prisma.attendanceRecord.findMany({
            where: {
              studentId: student.id,
              sessionId: { in: sessionIds },
            },
            include: {
              session: {
                select: {
                  startsAt: true,
                  subjectId: true,
                  subject: { select: { id: true, code: true, name: true } },
                },
              },
            },
            orderBy: { markedAt: "desc" },
          })
        : [];

      const totalEligibleSessions = sessions.length;
      const attendedRecords = records.filter(
        (r) => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE
      );
      const attendedSessions = attendedRecords.length;
      const overallPercentage = totalEligibleSessions > 0
        ? Math.round((attendedSessions / totalEligibleSessions) * 1000) / 10
        : null;

      const standing =
        overallPercentage === null
          ? "NO_SESSIONS"
          : overallPercentage >= 75
          ? "GOOD_STANDING"
          : "BELOW_THRESHOLD";

      // Group Trend by date (YYYY-MM-DD)
      const trendMap = new Map<string, { total: number; attended: number }>();
      for (const s of sessions) {
        const dateKey = s.startsAt.toISOString().slice(0, 10);
        if (!trendMap.has(dateKey)) {
          trendMap.set(dateKey, { total: 0, attended: 0 });
        }
        trendMap.get(dateKey)!.total += 1;
      }
      for (const r of attendedRecords) {
        const dateKey = r.session.startsAt.toISOString().slice(0, 10);
        if (trendMap.has(dateKey)) {
          trendMap.get(dateKey)!.attended += 1;
        }
      }

      const trend = Array.from(trendMap.entries()).map(([date, counts]) => ({
        date,
        totalSessions: counts.total,
        attendedCount: counts.attended,
        attendancePercentage:
          counts.total > 0 ? Math.round((counts.attended / counts.total) * 1000) / 10 : null,
      }));

      // Group by Subject
      const subjectMap = new Map<
        string,
        { code: string; name: string; total: number; attended: number }
      >();
      for (const s of sessions) {
        const sid = s.subjectId;
        if (!subjectMap.has(sid)) {
          subjectMap.set(sid, {
            code: s.subject.code,
            name: s.subject.name,
            total: 0,
            attended: 0,
          });
        }
        subjectMap.get(sid)!.total += 1;
      }
      for (const r of attendedRecords) {
        const sid = r.session.subjectId;
        if (subjectMap.has(sid)) {
          subjectMap.get(sid)!.attended += 1;
        }
      }

      const subjectBreakdown = Array.from(subjectMap.entries()).map(([subjectId, s]) => {
        const pct = s.total > 0 ? Math.round((s.attended / s.total) * 1000) / 10 : null;
        return {
          subjectId,
          code: s.code,
          name: s.name,
          total: s.total,
          attended: s.attended,
          percentage: pct,
          isBelowThreshold: pct !== null && pct < 75,
        };
      });

      const recentActivity = records.slice(0, 5).map((r) => ({
        recordId: r.id,
        date: r.session.startsAt.toISOString(),
        subjectCode: r.session.subject.code,
        subjectName: r.session.subject.name,
        status: r.status,
        method: r.method,
      }));

      const isFaceEnrolled = Boolean(
        student.faceEnrollment && student.faceEnrollment.status === "ACTIVE"
      );

      return {
        role: Role.STUDENT,
        timeframeDays: days,
        isFaceEnrolled,
        kpis: {
          overallAttendancePercentage: overallPercentage,
          totalEligibleSessions,
          attendedSessions,
          standing,
          threshold: 75,
        },
        trend,
        subjectBreakdown,
        recentActivity,
      };
    }

    if (actorRole === Role.TEACHER) {
      const assignments = await prisma.teacherAssignment.findMany({
        where: { teacherUserId: actorUserId, active: true },
        include: {
          class: { select: { id: true, label: true } },
          subject: { select: { id: true, code: true, name: true } },
        },
      });

      if (assignments.length === 0) {
        return {
          role: Role.TEACHER,
          timeframeDays: days,
          kpis: {
            totalAssignedClasses: 0,
            totalStudents: 0,
            totalSessionsConducted: 0,
            classAveragePercentage: null,
            belowThresholdCount: 0,
          },
          trend: [],
          subjectBreakdown: [],
          recentSessions: [],
        };
      }

      if (query.classId) {
        const isAssigned = assignments.some((a) => a.classId === query.classId);
        if (!isAssigned) {
          throw new AppError("You are not assigned to the requested class", 403, "CLASS_NOT_ASSIGNED");
        }
      }

      const assignedClassIds = query.classId
        ? [query.classId]
        : Array.from(new Set(assignments.map((a) => a.classId)));
      const assignedSubjectIds = query.subjectId
        ? [query.subjectId]
        : Array.from(new Set(assignments.map((a) => a.subjectId)));

      const sessionWhere: any = {
        teacherUserId: actorUserId,
        classId: { in: assignedClassIds },
        subjectId: { in: assignedSubjectIds },
        status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
        startsAt: { gte: startDate },
      };

      const [sessions, students] = await Promise.all([
        prisma.attendanceSession.findMany({
          where: sessionWhere,
          include: {
            class: {
              select: {
                id: true,
                label: true,
                _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } },
              },
            },
            subject: { select: { id: true, code: true, name: true } },
          },
          orderBy: { startsAt: "asc" },
        }),
        prisma.student.findMany({
          where: { classId: { in: assignedClassIds }, status: StudentStatus.ACTIVE },
          select: { id: true, classId: true },
        }),
      ]);

      const sessionIds = sessions.map((s) => s.id);
      const records = sessionIds.length > 0
        ? await prisma.attendanceRecord.findMany({
            where: { sessionId: { in: sessionIds } },
            select: {
              studentId: true,
              status: true,
              sessionId: true,
              session: { select: { startsAt: true, subjectId: true, subject: { select: { code: true, name: true } } } },
            },
          })
        : [];

      const studentAttendedMap = new Map<string, number>();
      for (const r of records) {
        if (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) {
          studentAttendedMap.set(r.studentId, (studentAttendedMap.get(r.studentId) || 0) + 1);
        }
      }

      let belowThresholdCount = 0;
      if (sessions.length > 0) {
        for (const st of students) {
          const cohortSessionCount = sessions.filter((s) => s.classId === st.classId).length;
          const attended = studentAttendedMap.get(st.id) || 0;
          if (cohortSessionCount > 0) {
            const pct = (attended / cohortSessionCount) * 100;
            if (pct < 75) belowThresholdCount += 1;
          }
        }
      }

      const totalOpportunities = sessions.reduce((sum, s) => sum + s.class._count.students, 0);
      const totalAttended = records.filter(
        (r) => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE
      ).length;
      const classAveragePercentage = totalOpportunities > 0
        ? Math.round((totalAttended / totalOpportunities) * 1000) / 10
        : null;

      const dateMap = new Map<string, { totalSessions: number; attended: number; opportunities: number }>();
      for (const s of sessions) {
        const d = s.startsAt.toISOString().slice(0, 10);
        if (!dateMap.has(d)) dateMap.set(d, { totalSessions: 0, attended: 0, opportunities: 0 });
        const entry = dateMap.get(d)!;
        entry.totalSessions += 1;
        entry.opportunities += s.class._count.students;
      }
      for (const r of records) {
        if (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) {
          const d = r.session.startsAt.toISOString().slice(0, 10);
          if (dateMap.has(d)) dateMap.get(d)!.attended += 1;
        }
      }

      const trend = Array.from(dateMap.entries()).map(([date, item]) => ({
        date,
        totalSessions: item.totalSessions,
        attendedCount: item.attended,
        attendancePercentage:
          item.opportunities > 0 ? Math.round((item.attended / item.opportunities) * 1000) / 10 : null,
      }));

      const subjectMap = new Map<string, { code: string; name: string; totalSessions: number; attended: number; opps: number }>();
      for (const s of sessions) {
        const sid = s.subjectId;
        if (!subjectMap.has(sid)) {
          subjectMap.set(sid, {
            code: s.subject.code,
            name: s.subject.name,
            totalSessions: 0,
            attended: 0,
            opps: 0,
          });
        }
        const entry = subjectMap.get(sid)!;
        entry.totalSessions += 1;
        entry.opps += s.class._count.students;
      }
      for (const r of records) {
        if (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) {
          const sid = r.session.subjectId;
          if (subjectMap.has(sid)) subjectMap.get(sid)!.attended += 1;
        }
      }

      const subjectBreakdown = Array.from(subjectMap.entries()).map(([subjectId, item]) => ({
        subjectId,
        code: item.code,
        name: item.name,
        totalSessions: item.totalSessions,
        averagePercentage: item.opps > 0 ? Math.round((item.attended / item.opps) * 1000) / 10 : null,
      }));

      const recentSessions = sessions.slice(-5).reverse().map((s) => ({
        sessionId: s.id,
        classLabel: s.class.label,
        subjectCode: s.subject.code,
        subjectName: s.subject.name,
        startsAt: s.startsAt.toISOString(),
        status: s.status,
      }));

      return {
        role: Role.TEACHER,
        timeframeDays: days,
        kpis: {
          totalAssignedClasses: assignedClassIds.length,
          totalStudents: students.length,
          totalSessionsConducted: sessions.length,
          classAveragePercentage,
          belowThresholdCount,
        },
        trend,
        subjectBreakdown,
        recentSessions,
      };
    }

    if (actorRole === Role.ADMIN) {
      const sessionWhere: any = {
        status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
        startsAt: { gte: startDate },
      };
      if (query.classId) sessionWhere.classId = query.classId;
      if (query.subjectId) sessionWhere.subjectId = query.subjectId;

      const [departments, classes, students, sessions] = await Promise.all([
        prisma.department.findMany({
          where: { active: true },
          select: { id: true, code: true, name: true },
          orderBy: { code: "asc" },
        }),
        prisma.class.findMany({
          where: { active: true },
          select: {
            id: true,
            label: true,
            departmentId: true,
            _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } },
          },
        }),
        prisma.student.findMany({
          where: { status: StudentStatus.ACTIVE },
          select: { id: true, classId: true, departmentId: true },
        }),
        prisma.attendanceSession.findMany({
          where: sessionWhere,
          include: {
            class: {
              select: {
                id: true,
                departmentId: true,
                _count: { select: { students: { where: { status: StudentStatus.ACTIVE } } } },
              },
            },
          },
          orderBy: { startsAt: "asc" },
        }),
      ]);

      const sessionIds = sessions.map((s) => s.id);
      const records = sessionIds.length > 0
        ? await prisma.attendanceRecord.findMany({
            where: { sessionId: { in: sessionIds } },
            select: {
              studentId: true,
              status: true,
              session: { select: { startsAt: true, class: { select: { departmentId: true } } } },
            },
          })
        : [];

      const studentAttendedMap = new Map<string, number>();
      for (const r of records) {
        if (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) {
          studentAttendedMap.set(r.studentId, (studentAttendedMap.get(r.studentId) || 0) + 1);
        }
      }

      let totalAtRiskStudents = 0;
      if (sessions.length > 0) {
        for (const st of students) {
          const cohortSessions = sessions.filter((s) => s.class.id === st.classId).length;
          const attended = studentAttendedMap.get(st.id) || 0;
          if (cohortSessions > 0) {
            const pct = (attended / cohortSessions) * 100;
            if (pct < 75) totalAtRiskStudents += 1;
          }
        }
      }

      const totalOpportunities = sessions.reduce((sum, s) => sum + s.class._count.students, 0);
      const totalAttended = records.filter(
        (r) => r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE
      ).length;
      const overallAverageAttendance = totalOpportunities > 0
        ? Math.round((totalAttended / totalOpportunities) * 1000) / 10
        : null;

      const dateMap = new Map<string, { sessions: number; attended: number; opps: number }>();
      for (const s of sessions) {
        const d = s.startsAt.toISOString().slice(0, 10);
        if (!dateMap.has(d)) dateMap.set(d, { sessions: 0, attended: 0, opps: 0 });
        const entry = dateMap.get(d)!;
        entry.sessions += 1;
        entry.opps += s.class._count.students;
      }
      for (const r of records) {
        if (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) {
          const d = r.session.startsAt.toISOString().slice(0, 10);
          if (dateMap.has(d)) dateMap.get(d)!.attended += 1;
        }
      }

      const trend = Array.from(dateMap.entries()).map(([date, item]) => ({
        date,
        totalSessions: item.sessions,
        averagePercentage: item.opps > 0 ? Math.round((item.attended / item.opps) * 1000) / 10 : null,
      }));

      const deptMap = new Map<string, { code: string; name: string; students: number; sessions: number; attended: number; opps: number }>();
      for (const d of departments) {
        const deptStudents = students.filter((st) => st.departmentId === d.id).length;
        deptMap.set(d.id, {
          code: d.code,
          name: d.name,
          students: deptStudents,
          sessions: 0,
          attended: 0,
          opps: 0,
        });
      }
      for (const s of sessions) {
        const deptId = s.class.departmentId;
        if (deptMap.has(deptId)) {
          const entry = deptMap.get(deptId)!;
          entry.sessions += 1;
          entry.opps += s.class._count.students;
        }
      }
      for (const r of records) {
        if (r.status === AttendanceStatus.PRESENT || r.status === AttendanceStatus.LATE) {
          const deptId = r.session.class.departmentId;
          if (deptMap.has(deptId)) {
            deptMap.get(deptId)!.attended += 1;
          }
        }
      }

      const departmentBreakdown = Array.from(deptMap.entries()).map(([departmentId, item]) => ({
        departmentId,
        code: item.code,
        name: item.name,
        studentCount: item.students,
        sessionCount: item.sessions,
        averagePercentage: item.opps > 0 ? Math.round((item.attended / item.opps) * 1000) / 10 : null,
      }));

      const recentSessions = sessions.slice(-5).reverse().map((s) => ({
        sessionId: s.id,
        startsAt: s.startsAt.toISOString(),
        status: s.status,
      }));

      return {
        role: Role.ADMIN,
        timeframeDays: days,
        kpis: {
          totalDepartments: departments.length,
          totalClasses: classes.length,
          totalActiveStudents: students.length,
          totalSessionsHeld: sessions.length,
          overallAverageAttendance,
          totalAtRiskStudents,
        },
        trend,
        departmentBreakdown,
        recentSessions,
      };
    }

    throw new AppError("Invalid role for dashboard", 400, "INVALID_ROLE");
  }

  /**
   * Helper to stage CSV generation into an isolated temporary file on disk before sending HTTP headers.
   * This guarantees:
   * 1. Bounded memory consumption for large exports (data streamed to disk in batches).
   * 2. If a database disconnect or query error occurs, headers are NOT yet sent, so Express
   *    reliably sends a clean HTTP 500 JSON error instead of an HTTP 200 with truncated CSV data.
   * 3. Successful responses include an exact Content-Length header for client-side download completeness verification.
   * 4. Temporary artifacts are guaranteed to be cleaned up on success, failure, and client disconnect.
   */
  private async stageAndStreamCsv(
    res: Response,
    filename: string,
    generator: (writeRow: (cells: unknown[]) => Promise<void>, isAborted: () => boolean) => Promise<void>
  ): Promise<void> {
    const tempDir = os.tmpdir();
    const tempId = crypto.randomBytes(16).toString("hex");
    const tempFilePath = path.join(tempDir, `csv_export_${tempId}.tmp`);

    const fileWriteStream = fs.createWriteStream(tempFilePath, { encoding: "utf-8" });
    fileWriteStream.on("error", () => {
      // Prevent unhandled error event if stream is destroyed while writes are in flight
    });

    let isClientDisconnected = false;

    const onClose = () => {
      isClientDisconnected = true;
    };
    res.on("close", onClose);

    const cleanupTemp = async () => {
      try {
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
        }
      } catch {
        // Ignore unlink failures if file already unlinked
      }
    };

    let totalBytesWritten = 0;
    const MAX_EXPORT_BYTES = 50 * 1024 * 1024; // 50MB safety ceiling to prevent disk exhaustion

    try {
      // 1. Write UTF-8 BOM
      fileWriteStream.write(UTF8_BOM);
      totalBytesWritten += Buffer.byteLength(UTF8_BOM);

      const writeRow = async (cells: unknown[]): Promise<void> => {
        if (isClientDisconnected || fileWriteStream.destroyed || fileWriteStream.writableEnded) return;
        const row = formatCsvRow(cells);
        const rowBytes = Buffer.byteLength(row, "utf-8");
        totalBytesWritten += rowBytes;

        if (totalBytesWritten > MAX_EXPORT_BYTES) {
          throw new AppError(
            "Export payload exceeds 50MB safety ceiling. Please narrow your query filters or date range.",
            413,
            "EXPORT_TOO_LARGE"
          );
        }

        const canWrite = fileWriteStream.write(row);
        if (!canWrite && !fileWriteStream.destroyed) {
          await new Promise<void>((resolve) => fileWriteStream.once("drain", () => resolve()));
        }
      };

      // 2. Generate rows into staged temporary file
      await generator(writeRow, () => isClientDisconnected);

      // 3. Finalize writing to disk
      if (!fileWriteStream.destroyed && !fileWriteStream.writableEnded) {
        await new Promise<void>((resolve, reject) => {
          fileWriteStream.end((err?: Error | null) => {
            if (err) reject(err);
            else resolve();
          });
        });
      }

      if (isClientDisconnected) {
        await cleanupTemp();
        return;
      }

      // 4. Staging succeeded! Set definitive response headers including exact Content-Length
      const stat = await fs.promises.stat(tempFilePath);

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Length", stat.size.toString());
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      // 5. Pipe staged file directly to client response
      const readStream = fs.createReadStream(tempFilePath);
      readStream.on("error", () => {
        // Prevent unhandled error on destroyed read stream
      });

      await new Promise<void>((resolve, reject) => {
        readStream.pipe(res);
        readStream.on("end", async () => {
          await cleanupTemp();
          resolve();
        });
        readStream.on("error", async (readErr) => {
          await cleanupTemp();
          reject(readErr);
        });
        res.on("error", async (resErr) => {
          readStream.destroy();
          await cleanupTemp();
          reject(resErr);
        });
        res.on("close", async () => {
          readStream.destroy();
          await cleanupTemp();
          resolve();
        });
      });
    } catch (error) {
      if (!fileWriteStream.destroyed) {
        fileWriteStream.destroy();
      }
      await cleanupTemp();
      if (!res.headersSent) {
        throw error;
      } else {
        if (!res.writableEnded) {
          res.end();
        }
      }
    } finally {
      res.off("close", onClose);
    }
  }

  /**
   * Exports student personal attendance history as CSV using staged temporary file output.
   * Student identity is strictly derived from actorUserId.
   */
  async exportStudentAttendanceCsv(
    actorUserId: string,
    query: StudentExportQuery,
    res: Response
  ): Promise<void> {
    // 1. Resolve student profile
    const student = await prisma.student.findUnique({
      where: { userId: actorUserId },
      include: {
        class: { select: { id: true, label: true } },
      },
    });

    if (!student) {
      throw new AppError("Student profile not found for authenticated user", 404, "STUDENT_NOT_FOUND");
    }

    if (student.status !== StudentStatus.ACTIVE) {
      throw new AppError("Student account is pending approval or inactive", 403, "STUDENT_NOT_ACTIVE");
    }

    // 2. Query eligible sessions (ACTIVE or COMPLETED; CANCELLED and SCHEDULED excluded)
    let eligibleSessions: { id: string }[] = [];
    if (student.classId) {
      const sessionWhere: any = {
        classId: student.classId,
        status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
      };
      if (query.subjectId) sessionWhere.subjectId = query.subjectId;
      if (query.dateFrom || query.dateTo) {
        sessionWhere.startsAt = {};
        if (query.dateFrom) sessionWhere.startsAt.gte = new Date(query.dateFrom);
        if (query.dateTo) sessionWhere.startsAt.lte = new Date(query.dateTo);
      }

      eligibleSessions = await prisma.attendanceSession.findMany({
        where: sessionWhere,
        select: { id: true },
      });
    }
    const eligibleSessionIds = eligibleSessions.map((s) => s.id);

    const today = new Date().toISOString().slice(0, 10);
    const filename = sanitizeFilename(`student-attendance-${student.rollNumber}-${today}.csv`);

    await this.stageAndStreamCsv(res, filename, async (writeRow, isAborted) => {
      await writeRow([
        "Date",
        "Session Time",
        "Subject Code",
        "Subject Name",
        "Teacher",
        "Status",
        "Method",
        "Marked At",
        "Correction Reason",
      ]);

      if (eligibleSessionIds.length === 0) {
        return;
      }

      const recordWhere: any = {
        studentId: student.id,
        sessionId: { in: eligibleSessionIds },
      };
      if (query.status) {
        recordWhere.status = query.status;
      }

      let skip = 0;
      const batchSize = 200;

      while (!isAborted()) {
        const records = await prisma.attendanceRecord.findMany({
          where: recordWhere,
          include: {
            session: {
              select: {
                startsAt: true,
                endsAt: true,
                subject: { select: { code: true, name: true } },
                teacher: { select: { name: true } },
              },
            },
          },
          orderBy: { session: { startsAt: "desc" } },
          skip,
          take: batchSize,
        });

        if (records.length === 0 || isAborted()) break;

        for (const rec of records) {
          if (isAborted()) break;
          const startsAt = rec.session.startsAt ? new Date(rec.session.startsAt) : null;
          const endsAt = rec.session.endsAt ? new Date(rec.session.endsAt) : null;
          const dateStr = startsAt ? startsAt.toISOString().slice(0, 10) : "";
          const timeRangeStr = startsAt && endsAt
            ? `${startsAt.toISOString().slice(11, 16)} - ${endsAt.toISOString().slice(11, 16)}`
            : startsAt ? startsAt.toISOString().slice(11, 16) : "";

          await writeRow([
            dateStr,
            timeRangeStr,
            rec.session.subject.code,
            rec.session.subject.name,
            rec.session.teacher?.name || "N/A",
            rec.status,
            rec.method,
            rec.markedAt ? new Date(rec.markedAt).toISOString() : "",
            rec.correctionReason || "",
          ]);
        }

        skip += records.length;
        if (records.length < batchSize) break;
      }
    });
  }

  /**
   * Exports class attendance roster or session records as CSV using staged temporary file output.
   * Enforces role-based assignment authorization: Teachers can only export assigned cohorts.
   */
  async exportTeacherAttendanceCsv(
    actorUserId: string,
    actorRole: Role,
    query: TeacherExportQuery,
    res: Response
  ): Promise<void> {
    const { classId, subjectId, dateFrom, dateTo, search, format = "roster" } = query;

    // 1. Authorization Gate: Verify assignment if actor is TEACHER
    if (actorRole === Role.TEACHER) {
      const assignmentWhere: any = {
        teacherUserId: actorUserId,
        classId,
        active: true,
      };
      if (subjectId) {
        assignmentWhere.subjectId = subjectId;
      }

      const assignment = await prisma.teacherAssignment.findFirst({
        where: assignmentWhere,
      });

      if (!assignment) {
        throw new AppError(
          "You are not authorized to export attendance reports for this class or subject",
          403,
          "FORBIDDEN"
        );
      }
    }

    // 2. Fetch Class Details
    const classCohort = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        department: { select: { code: true, name: true } },
      },
    });

    if (!classCohort) {
      throw new AppError("Class not found", 404, "CLASS_NOT_FOUND");
    }

    // 3. Find eligible held sessions (excluding cancelled and scheduled)
    const sessionWhere: any = {
      classId,
      status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
    };
    if (subjectId) sessionWhere.subjectId = subjectId;
    if (dateFrom || dateTo) {
      sessionWhere.startsAt = {};
      if (dateFrom) sessionWhere.startsAt.gte = new Date(dateFrom);
      if (dateTo) sessionWhere.startsAt.lte = new Date(dateTo);
    }

    const eligibleSessions = await prisma.attendanceSession.findMany({
      where: sessionWhere,
      select: { id: true, startsAt: true, endsAt: true, subject: { select: { code: true, name: true } } },
      orderBy: { startsAt: "desc" },
    });

    const totalSessionsHeld = eligibleSessions.length;
    const sessionIds = eligibleSessions.map((s) => s.id);

    const today = new Date().toISOString().slice(0, 10);
    const filename = sanitizeFilename(
      `class-attendance-${classCohort.label}-${format}-${today}.csv`
    );

    await this.stageAndStreamCsv(res, filename, async (writeRow, isAborted) => {
      if (format === "sessions") {
        await writeRow([
          "Roll Number",
          "Student Name",
          "Date",
          "Session Time",
          "Subject Code",
          "Subject Name",
          "Status",
          "Method",
          "Marked At",
          "Correction Reason",
        ]);

        if (sessionIds.length > 0) {
          const studentWhere: any = {
            classId,
            status: StudentStatus.ACTIVE,
          };
          if (search && search.trim()) {
            studentWhere.OR = [
              { name: { contains: search.trim(), mode: "insensitive" } },
              { rollNumber: { contains: search.trim(), mode: "insensitive" } },
            ];
          }

          let skip = 0;
          const batchSize = 200;

          while (!isAborted()) {
            const records = await prisma.attendanceRecord.findMany({
              where: {
                sessionId: { in: sessionIds },
                student: studentWhere,
              },
              include: {
                student: { select: { rollNumber: true, name: true } },
                session: {
                  select: {
                    startsAt: true,
                    endsAt: true,
                    subject: { select: { code: true, name: true } },
                  },
                },
              },
              orderBy: [
                { session: { startsAt: "desc" } },
                { student: { rollNumber: "asc" } },
              ],
              skip,
              take: batchSize,
            });

            if (records.length === 0 || isAborted()) break;

            for (const rec of records) {
              if (isAborted()) break;
              const startsAt = rec.session.startsAt ? new Date(rec.session.startsAt) : null;
              const endsAt = rec.session.endsAt ? new Date(rec.session.endsAt) : null;
              const dateStr = startsAt ? startsAt.toISOString().slice(0, 10) : "";
              const timeRangeStr = startsAt && endsAt
                ? `${startsAt.toISOString().slice(11, 16)} - ${endsAt.toISOString().slice(11, 16)}`
                : startsAt ? startsAt.toISOString().slice(11, 16) : "";

              await writeRow([
                rec.student.rollNumber,
                rec.student.name,
                dateStr,
                timeRangeStr,
                rec.session.subject.code,
                rec.session.subject.name,
                rec.status,
                rec.method,
                rec.markedAt ? new Date(rec.markedAt).toISOString() : "",
                rec.correctionReason || "",
              ]);
            }

            skip += records.length;
            if (records.length < batchSize) break;
          }
        }
      } else {
        // Default: Summary roster export with aggregate calculations per student
        await writeRow([
          "Roll Number",
          "Student Name",
          "Email",
          "Total Sessions",
          "Present",
          "Late",
          "Absent",
          "Excused",
          "Unrecorded",
          "Attended Count",
          "Attendance Percentage",
          "Status",
        ]);

        const thresholdSetting = await prisma.systemSetting.findUnique({
          where: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT" },
        });
        const threshold = thresholdSetting ? parseFloat(thresholdSetting.value) || 75.0 : 75.0;

        const studentWhere: any = {
          classId,
          status: StudentStatus.ACTIVE,
        };
        if (search && search.trim()) {
          studentWhere.OR = [
            { name: { contains: search.trim(), mode: "insensitive" } },
            { rollNumber: { contains: search.trim(), mode: "insensitive" } },
          ];
        }

        let studentSkip = 0;
        const studentBatchSize = 100;

        while (!isAborted()) {
          const students = await prisma.student.findMany({
            where: studentWhere,
            select: { id: true, rollNumber: true, name: true, email: true },
            orderBy: { rollNumber: "asc" },
            skip: studentSkip,
            take: studentBatchSize,
          });

          if (students.length === 0 || isAborted()) break;

          const batchStudentIds = students.map((s) => s.id);
          const records = sessionIds.length > 0 && batchStudentIds.length > 0
            ? await prisma.attendanceRecord.findMany({
                where: {
                  sessionId: { in: sessionIds },
                  studentId: { in: batchStudentIds },
                },
                select: { studentId: true, status: true },
              })
            : [];

          const studentRecordMap = new Map<string, { present: number; late: number; absent: number; excused: number }>();
          for (const rec of records) {
            if (!studentRecordMap.has(rec.studentId)) {
              studentRecordMap.set(rec.studentId, { present: 0, late: 0, absent: 0, excused: 0 });
            }
            const counts = studentRecordMap.get(rec.studentId)!;
            if (rec.status === AttendanceStatus.PRESENT) counts.present += 1;
            else if (rec.status === AttendanceStatus.LATE) counts.late += 1;
            else if (rec.status === AttendanceStatus.ABSENT) counts.absent += 1;
            else if (rec.status === AttendanceStatus.EXCUSED) counts.excused += 1;
          }

          for (const s of students) {
            if (isAborted()) break;
            const counts = studentRecordMap.get(s.id) || { present: 0, late: 0, absent: 0, excused: 0 };
            const attended = counts.present + counts.late;
            const recorded = counts.present + counts.late + counts.absent + counts.excused;
            const unrecorded = Math.max(0, totalSessionsHeld - recorded);
            const percentage = totalSessionsHeld > 0
              ? Math.round((attended / totalSessionsHeld) * 1000) / 10
              : null;

            let standing = "Good Standing";
            if (totalSessionsHeld === 0) {
              standing = "No Sessions Held";
            } else if (percentage !== null && percentage < threshold) {
              standing = `Low Attendance (<${threshold}%)`;
            }

            await writeRow([
              s.rollNumber,
              s.name,
              s.email,
              totalSessionsHeld,
              counts.present,
              counts.late,
              counts.absent,
              counts.excused,
              unrecorded,
              attended,
              percentage !== null ? `${percentage}%` : "N/A",
              standing,
            ]);
          }

          studentSkip += students.length;
          if (students.length < studentBatchSize) break;
        }
      }
    });
  }

  /**
   * Exports institution-level attendance summary grouped by Department and Class as CSV using staged temporary file output.
   * Access restricted to ADMIN.
   */
  async exportAdminSummaryCsv(
    query: AdminExportQuery,
    res: Response
  ): Promise<void> {
    const { departmentId, academicYearId, dateFrom, dateTo } = query;

    const classWhere: any = { active: true };
    if (departmentId) classWhere.departmentId = departmentId;
    if (academicYearId) classWhere.academicYearId = academicYearId;

    const today = new Date().toISOString().slice(0, 10);
    const filename = sanitizeFilename(`institution-attendance-summary-${today}.csv`);

    await this.stageAndStreamCsv(res, filename, async (writeRow, isAborted) => {
      await writeRow([
        "Department Code",
        "Department Name",
        "Class Label",
        "Academic Year",
        "Active Students",
        "Total Sessions Held",
        "Attended Count",
        "Total Opportunities",
        "Average Attendance %",
        "Status",
      ]);

      const classes = await prisma.class.findMany({
        where: classWhere,
        include: {
          department: { select: { code: true, name: true } },
          academicYear: { select: { label: true } },
          _count: {
            select: {
              students: { where: { status: StudentStatus.ACTIVE } },
            },
          },
        },
        orderBy: [{ department: { code: "asc" } }, { label: "asc" }],
      });

      const sessionDateFilter: any = {};
      if (dateFrom) sessionDateFilter.gte = new Date(dateFrom);
      if (dateTo) sessionDateFilter.lte = new Date(dateTo);

      for (const c of classes) {
        if (isAborted()) break;

        const sessionWhere: any = {
          classId: c.id,
          status: { in: [SessionStatus.COMPLETED, SessionStatus.ACTIVE] },
        };
        if (dateFrom || dateTo) {
          sessionWhere.startsAt = sessionDateFilter;
        }

        const eligibleSessions = await prisma.attendanceSession.findMany({
          where: sessionWhere,
          select: { id: true },
        });

        const totalSessionsHeld = eligibleSessions.length;
        const sessionIds = eligibleSessions.map((s) => s.id);
        const activeStudents = c._count.students;
        const totalOpportunities = activeStudents * totalSessionsHeld;

        let attendedCount = 0;
        if (sessionIds.length > 0) {
          attendedCount = await prisma.attendanceRecord.count({
            where: {
              sessionId: { in: sessionIds },
              status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.LATE] },
            },
          });
        }

        const averagePercentage = totalOpportunities > 0
          ? Math.round((attendedCount / totalOpportunities) * 1000) / 10
          : null;

        let status = "Good Standing";
        if (totalSessionsHeld === 0) {
          status = "No Sessions Held";
        } else if (averagePercentage !== null && averagePercentage < 75.0) {
          status = "Low Attendance (<75%)";
        }

        await writeRow([
          c.department.code,
          c.department.name,
          c.label,
          c.academicYear.label,
          activeStudents,
          totalSessionsHeld,
          attendedCount,
          totalOpportunities,
          averagePercentage !== null ? `${averagePercentage}%` : "N/A",
          status,
        ]);
      }
    });
  }

  /**
   * Cleans orphaned temporary export files from os.tmpdir() older than the specified age.
   * Useful on service boot and scheduled background cleanup to prevent disk bloat.
   */
  async cleanStaleTempFiles(olderThanMs = 3600000): Promise<number> {
    const tempDir = os.tmpdir();
    let cleanedCount = 0;
    try {
      const files = await fs.promises.readdir(tempDir);
      const now = Date.now();
      for (const file of files) {
        if (file.startsWith("csv_export_") && file.endsWith(".tmp")) {
          const fullPath = path.join(tempDir, file);
          try {
            const stat = await fs.promises.stat(fullPath);
            if (now - stat.mtimeMs > olderThanMs) {
              await fs.promises.unlink(fullPath);
              cleanedCount++;
            }
          } catch {
            // Ignore individual file unlink errors
          }
        }
      }
    } catch {
      // Ignore directory read errors
    }
    return cleanedCount;
  }
}

export const reportsService = new ReportsService();

