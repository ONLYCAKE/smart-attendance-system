import { Router } from "express";
import { SystemSettingsUpdateSchema } from "@smart-attendance/shared";
import { settingsController } from "./settings.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin, requireTeacherOrAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";

export const settingsRouter: Router = Router();

// GET /settings (Admin & Teacher read-only for institutional thresholds)
settingsRouter.get(
  "/",
  authenticate,
  requireTeacherOrAdmin,
  settingsController.getSettings
);

// PATCH /settings (Admin only threshold updates)
settingsRouter.patch(
  "/",
  authenticate,
  requireAdmin,
  validate(SystemSettingsUpdateSchema),
  settingsController.updateSetting
);
