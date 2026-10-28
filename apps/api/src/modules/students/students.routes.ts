import { Router } from "express";
import { studentsController } from "./students.controller.js";
import { enrollmentController } from "../enrollment/enrollment.controller.js";
import { authenticate } from "../../middleware/auth.js";
import { requireAdmin, requireStudentSelfOrStaff, requireStudentSelfOrAdmin } from "../../middleware/rbac.js";
import { validate } from "../../middleware/validate.js";
import {
  BiometricConsentSchema,
  FaceEnrollmentSubmitSchema,
} from "@smart-attendance/shared";

export const studentsRouter: Router = Router();

// Static routes first (Admin-only Directory listing & metrics, Admin creation)
studentsRouter.get("/", authenticate, requireAdmin, studentsController.list);
studentsRouter.post("/", authenticate, requireAdmin, studentsController.create);
studentsRouter.get("/stats", authenticate, requireAdmin, studentsController.getStats);

// 1. Admin-only approval & class allocation of student
studentsRouter.post("/:id/approve", authenticate, requireAdmin, studentsController.approve);
studentsRouter.patch("/:id/class", authenticate, requireAdmin, studentsController.assignClass);

// 2. Student profile retrieval (Admin or Student self)
studentsRouter.get("/:id", authenticate, requireStudentSelfOrAdmin, studentsController.getById);

// 3. Consent Lifecycle Endpoints (Student Self or Authorized Faculty / Admin with Representative Policy)
studentsRouter.post(
  "/:id/consent",
  authenticate,
  requireStudentSelfOrStaff,
  validate(BiometricConsentSchema),
  enrollmentController.recordConsent
);

studentsRouter.get(
  "/:id/consent",
  authenticate,
  requireStudentSelfOrStaff,
  enrollmentController.getConsentStatus
);

// 4. Biometric Face Enrollment Endpoints (Student Self or Authorized Faculty / Admin)
studentsRouter.post(
  "/:id/face-enrollment",
  authenticate,
  requireStudentSelfOrStaff,
  validate(FaceEnrollmentSubmitSchema),
  enrollmentController.enrollFace
);

studentsRouter.get(
  "/:id/face-enrollment/status",
  authenticate,
  requireStudentSelfOrStaff,
  enrollmentController.getEnrollmentStatus
);

studentsRouter.post(
  "/:id/face-enrollment/revoke",
  authenticate,
  requireStudentSelfOrStaff,
  enrollmentController.revokeEnrollment
);

studentsRouter.delete(
  "/:id/face-enrollment",
  authenticate,
  requireStudentSelfOrStaff,
  enrollmentController.deleteEnrollment
);
