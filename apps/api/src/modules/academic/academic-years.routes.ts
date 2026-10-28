import { Router } from "express";
import { AcademicYearSchema, AcademicYearUpdateSchema } from "@smart-attendance/shared";
import { academicYearsController } from "./academic-years.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";

export const academicYearsRouter: Router = Router();

// Static routes first
academicYearsRouter.get("/", authenticate, academicYearsController.list);
academicYearsRouter.get("/all", authenticate, academicYearsController.getAll);
academicYearsRouter.get("/stats", authenticate, requireAdmin, academicYearsController.getStats);

// Parameterized routes
academicYearsRouter.get("/:id", authenticate, academicYearsController.getById);
academicYearsRouter.post(
  "/",
  authenticate,
  requireAdmin,
  validate(AcademicYearSchema),
  academicYearsController.create
);
academicYearsRouter.patch(
  "/:id",
  authenticate,
  requireAdmin,
  validate(AcademicYearUpdateSchema),
  academicYearsController.update
);
academicYearsRouter.delete(
  "/:id",
  authenticate,
  requireAdmin,
  academicYearsController.delete
);
