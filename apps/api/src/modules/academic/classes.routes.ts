import { Router } from "express";
import { ClassSchema, ClassUpdateSchema } from "@smart-attendance/shared";
import { classesController } from "./classes.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";

export const classesRouter: Router = Router();

// Static routes first
classesRouter.get("/", authenticate, classesController.list);
classesRouter.get("/all", authenticate, classesController.getAll);
classesRouter.get("/stats", authenticate, requireAdmin, classesController.getStats);

// Parameterized routes
classesRouter.get("/:id", authenticate, classesController.getById);
classesRouter.post(
  "/",
  authenticate,
  requireAdmin,
  validate(ClassSchema),
  classesController.create
);
classesRouter.patch(
  "/:id",
  authenticate,
  requireAdmin,
  validate(ClassUpdateSchema),
  classesController.update
);
classesRouter.delete(
  "/:id",
  authenticate,
  requireAdmin,
  classesController.delete
);
