import { Router } from "express";
import { sessionsController } from "./sessions.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireTeacherOrAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import {
  SessionCreateSchema,
  AttendanceCorrectionSchema,
  SessionFaceRecognizeSchema,
  SessionConfirmRecognitionSchema,
} from "@smart-attendance/shared";

export const sessionsRouter: Router = Router();

// 1. Session Lifecycle Routes
sessionsRouter.post(
  "/",
  authenticate,
  requireTeacherOrAdmin,
  validate(SessionCreateSchema),
  sessionsController.create
);

sessionsRouter.get(
  "/",
  authenticate,
  requireTeacherOrAdmin,
  sessionsController.list
);

sessionsRouter.get(
  "/:id",
  authenticate,
  requireTeacherOrAdmin,
  sessionsController.getById
);

sessionsRouter.post(
  "/:id/start",
  authenticate,
  requireTeacherOrAdmin,
  sessionsController.start
);

sessionsRouter.post(
  "/:id/close",
  authenticate,
  requireTeacherOrAdmin,
  sessionsController.close
);

// 2. Attendance Recording on Active Session
sessionsRouter.post(
  "/:id/records",
  authenticate,
  requireTeacherOrAdmin,
  sessionsController.markRecords
);

// 3. Face Recognition on Active Session
sessionsRouter.post(
  "/:id/recognize",
  authenticate,
  requireTeacherOrAdmin,
  validate(SessionFaceRecognizeSchema),
  sessionsController.recognizeFace
);

sessionsRouter.post(
  "/:id/confirm-recognition",
  authenticate,
  requireTeacherOrAdmin,
  validate(SessionConfirmRecognitionSchema),
  sessionsController.confirmRecognition
);

// 4. Attendance Correction
sessionsRouter.patch(
  "/records/:id",
  authenticate,
  requireTeacherOrAdmin,
  validate(AttendanceCorrectionSchema),
  sessionsController.correctRecord
);

// Dedicated /attendance-records router (matching API_SPECIFICATION.md: PATCH /attendance-records/:id)
export const attendanceRecordsRouter: Router = Router();
attendanceRecordsRouter.patch(
  "/:id",
  authenticate,
  requireTeacherOrAdmin,
  validate(AttendanceCorrectionSchema),
  sessionsController.correctRecord
);
