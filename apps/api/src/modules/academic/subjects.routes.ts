import { Router } from "express";
import { SubjectSchema, SubjectUpdateSchema } from "@smart-attendance/shared";
import { subjectsController } from "./subjects.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";

export const subjectsRouter: Router = Router();

// Static routes first
subjectsRouter.get("/", authenticate, subjectsController.list);
subjectsRouter.get("/all", authenticate, subjectsController.getAll);
subjectsRouter.get("/stats", authenticate, requireAdmin, subjectsController.getStats);
subjectsRouter.get("/next-code", authenticate, requireAdmin, subjectsController.getNextCode);

// Parameterized routes
subjectsRouter.get("/:id", authenticate, subjectsController.getById);
subjectsRouter.post(
  "/",
  authenticate,
  requireAdmin,
  validate(SubjectSchema),
  subjectsController.create
);
subjectsRouter.patch(
  "/:id",
  authenticate,
  requireAdmin,
  validate(SubjectUpdateSchema),
  subjectsController.update
);
subjectsRouter.delete(
  "/:id",
  authenticate,
  requireAdmin,
  subjectsController.delete
);
