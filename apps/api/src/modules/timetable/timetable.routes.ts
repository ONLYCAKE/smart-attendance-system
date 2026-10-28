import { Router } from "express";
import {
  TimetableEntrySchema,
  TimetableEntryUpdateSchema,
} from "@smart-attendance/shared";
import { timetableController } from "./timetable.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";

export const timetableRouter: Router = Router();

// Static routes first
timetableRouter.get("/", authenticate, timetableController.list);
timetableRouter.get("/my-timetable", authenticate, timetableController.getMyTimetable);
timetableRouter.get("/export", authenticate, timetableController.exportCsv);

// Parameterized routes
timetableRouter.get("/:id", authenticate, timetableController.getById);
timetableRouter.post(
  "/",
  authenticate,
  requireAdmin,
  validate(TimetableEntrySchema),
  timetableController.create
);
timetableRouter.patch(
  "/:id",
  authenticate,
  requireAdmin,
  validate(TimetableEntryUpdateSchema),
  timetableController.update
);
timetableRouter.delete(
  "/:id",
  authenticate,
  requireAdmin,
  timetableController.delete
);
