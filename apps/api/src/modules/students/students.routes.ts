import { Router } from "express";
import { studentsController } from "./students.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin, requireStudentSelfOrAdmin } from "../../middleware/rbac.js";

export const studentsRouter: Router = Router();

// 1. Admin-only approval of pending student
studentsRouter.post("/:id/approve", authenticate, requireAdmin, studentsController.approve);

// 2. Student profile retrieval (Admin or Student self)
studentsRouter.get("/:id", authenticate, requireStudentSelfOrAdmin, studentsController.getById);
