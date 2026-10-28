import { Router } from "express";
import {
  NotificationQuerySchema,
  EvaluateAlertsInputSchema,
} from "@smart-attendance/shared";
import { notificationsController } from "./notifications.controller.js";
import { authenticate } from "../../middleware/auth.js";
import {
  requireStudent,
  requireTeacherOrAdmin,
} from "../../middleware/rbac.js";
import { validateQuery, validate } from "../../middleware/validate.js";

export const notificationsRouter: Router = Router();

// Student self-notifications
notificationsRouter.get(
  "/my",
  authenticate,
  requireStudent,
  validateQuery(NotificationQuerySchema),
  notificationsController.getMyNotifications
);

// Student marks notification as read
notificationsRouter.patch(
  "/:id/read",
  authenticate,
  requireStudent,
  notificationsController.markAsRead
);

// Resolve notification (student owner, assigned teacher, or admin)
notificationsRouter.patch(
  "/:id/resolve",
  authenticate,
  notificationsController.resolveNotification
);

// Class active alerts for teachers & admins
notificationsRouter.get(
  "/class/:classId",
  authenticate,
  requireTeacherOrAdmin,
  notificationsController.getClassNotifications
);

// Trigger alert evaluation (teacher for class, admin for class/institution)
notificationsRouter.post(
  "/evaluate",
  authenticate,
  requireTeacherOrAdmin,
  validate(EvaluateAlertsInputSchema),
  notificationsController.evaluateAlerts
);
