import { Request, Response, NextFunction } from "express";
import { notificationsService } from "./notifications.service.js";

export class NotificationsController {
  async getMyNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const data = await notificationsService.getStudentNotifications(
        user.id,
        req.query as any
      );
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const id = req.params.id as string;
      const data = await notificationsService.markAsRead(id, user.id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async resolveNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const id = req.params.id as string;
      const data = await notificationsService.resolveNotification(
        id,
        user.id,
        user.role
      );
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async getClassNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const classId = req.params.classId as string;
      const data = await notificationsService.getClassNotifications(
        classId,
        user.id,
        user.role
      );
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async evaluateAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { classId, studentId } = req.body;

      if (studentId) {
        const result = await notificationsService.evaluateStudentAlerts(studentId);
        res.status(200).json({
          success: true,
          data: result,
        });
        return;
      }

      if (classId) {
        const result = await notificationsService.evaluateClassAlerts(
          classId,
          user.id,
          user.role
        );
        res.status(200).json({
          success: true,
          data: result,
        });
        return;
      }

      if (user.role === "ADMIN") {
        const result = await notificationsService.evaluateInstitutionAlerts();
        res.status(200).json({
          success: true,
          data: result,
        });
        return;
      }

      res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "classId or studentId is required for alert evaluation",
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationsController = new NotificationsController();
