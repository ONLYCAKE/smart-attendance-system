import { Router } from "express";
import {
  TeacherAssignmentSchema,
  TeacherAssignmentUpdateSchema,
} from "@smart-attendance/shared";
import { teacherAssignmentsController } from "./teacher-assignments.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";

export const teacherAssignmentsRouter: Router = Router();

// Static routes first
teacherAssignmentsRouter.get("/", authenticate, teacherAssignmentsController.list);
teacherAssignmentsRouter.get(
  "/stats",
  authenticate,
  requireAdmin,
  teacherAssignmentsController.getStats
);
teacherAssignmentsRouter.get(
  "/teachers",
  authenticate,
  requireAdmin,
  teacherAssignmentsController.getTeachersList
);
teacherAssignmentsRouter.post(
  "/teachers",
  authenticate,
  requireAdmin,
  teacherAssignmentsController.createTeacher
);
teacherAssignmentsRouter.get(
  "/my-assignments",
  authenticate,
  teacherAssignmentsController.getMyAssignments
);

// Parameterized routes
teacherAssignmentsRouter.get("/:id", authenticate, teacherAssignmentsController.getById);
teacherAssignmentsRouter.post(
  "/",
  authenticate,
  requireAdmin,
  validate(TeacherAssignmentSchema),
  teacherAssignmentsController.create
);
teacherAssignmentsRouter.patch(
  "/:id",
  authenticate,
  requireAdmin,
  validate(TeacherAssignmentUpdateSchema),
  teacherAssignmentsController.update
);
teacherAssignmentsRouter.delete(
  "/:id",
  authenticate,
  requireAdmin,
  teacherAssignmentsController.delete
);
