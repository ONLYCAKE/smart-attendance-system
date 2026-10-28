import { Router } from "express";
import {
  StudentReportQuerySchema,
  TeacherReportQuerySchema,
  AdminSummaryQuerySchema,
  DashboardQuerySchema,
  StudentExportQuerySchema,
  TeacherExportQuerySchema,
  AdminExportQuerySchema,
} from "@smart-attendance/shared";
import { reportsController } from "./reports.controller.js";
import { authenticate } from "../../middleware/auth.js";
import {
  requireStudent,
  requireTeacherOrAdmin,
  requireAdmin,
} from "../../middleware/rbac.js";
import { validateQuery } from "../../middleware/validate.js";

export const reportsRouter: Router = Router();

// 0. Role-Scoped Dashboard Metrics & Charts (Admin, Teacher, Student)
reportsRouter.get(
  "/dashboard",
  authenticate,
  validateQuery(DashboardQuerySchema),
  reportsController.getDashboardMetrics
);

// 1. Student Personal Attendance History & Metrics
reportsRouter.get(
  "/student/me",
  authenticate,
  requireStudent,
  validateQuery(StudentReportQuerySchema),
  reportsController.getStudentReport
);

// 1b. Student CSV Export (Self only)
reportsRouter.get(
  "/student/me/export",
  authenticate,
  requireStudent,
  validateQuery(StudentExportQuerySchema),
  reportsController.exportStudentReport
);

// 2. Teacher Class Attendance Report
reportsRouter.get(
  "/teacher/attendance",
  authenticate,
  requireTeacherOrAdmin,
  validateQuery(TeacherReportQuerySchema),
  reportsController.getTeacherAttendanceReport
);

// 2b. Teacher / Admin Class CSV Export (Authorized classes only)
reportsRouter.get(
  "/teacher/attendance/export",
  authenticate,
  requireTeacherOrAdmin,
  validateQuery(TeacherExportQuerySchema),
  reportsController.exportTeacherReport
);

// 2c. Generic Attendance CSV Export (API spec compatibility: /reports/attendance/export)
reportsRouter.get(
  "/attendance/export",
  authenticate,
  requireTeacherOrAdmin,
  reportsController.exportAttendance
);

// 3. Administrator Institutional Summary
reportsRouter.get(
  "/admin/summary",
  authenticate,
  requireAdmin,
  validateQuery(AdminSummaryQuerySchema),
  reportsController.getAdminSummary
);

// 3b. Administrator Institutional Summary CSV Export
reportsRouter.get(
  "/admin/summary/export",
  authenticate,
  requireAdmin,
  validateQuery(AdminExportQuerySchema),
  reportsController.exportAdminSummary
);
