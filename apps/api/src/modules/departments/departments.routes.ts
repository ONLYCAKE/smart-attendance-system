import { Router } from "express";
import { DepartmentSchema, DepartmentUpdateSchema } from "@smart-attendance/shared";
import { departmentsController } from "./departments.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";

export const departmentsRouter: Router = Router();

// Static routes first
departmentsRouter.get("/", authenticate, departmentsController.list);
departmentsRouter.get("/stats", authenticate, requireAdmin, departmentsController.getStats);

// Parameterized routes
departmentsRouter.get("/:id", authenticate, departmentsController.getById);
departmentsRouter.post(
  "/",
  authenticate,
  requireAdmin,
  validate(DepartmentSchema),
  departmentsController.create
);
departmentsRouter.patch(
  "/:id",
  authenticate,
  requireAdmin,
  validate(DepartmentUpdateSchema),
  departmentsController.update
);
departmentsRouter.delete(
  "/:id",
  authenticate,
  requireAdmin,
  departmentsController.delete
);
