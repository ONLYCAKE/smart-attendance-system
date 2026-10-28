import { Request, Response, NextFunction } from "express";
import { enrollmentService } from "./enrollment.service.js";
import { AppError } from "../../middleware/errorHandler.js";

export class EnrollmentController {
  async recordConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.studentId || req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }

      const result = await enrollmentService.recordConsent(
        req.user!.id,
        studentId,
        req.body
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getConsentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.studentId || req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }

      const result = await enrollmentService.getConsentStatus(studentId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async enrollFace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.studentId || req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }

      const result = await enrollmentService.enrollFace(
        req.user!.id,
        studentId,
        req.body
      );

      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getEnrollmentStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.studentId || req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }

      const result = await enrollmentService.getEnrollmentStatus(studentId);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async revokeEnrollment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.studentId || req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }

      const result = await enrollmentService.revokeEnrollment(
        req.user!.id,
        studentId,
        req.body?.reason
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteEnrollment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.studentId || req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }

      const result = await enrollmentService.deleteEnrollment(
        req.user!.id,
        studentId
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const enrollmentController = new EnrollmentController();
