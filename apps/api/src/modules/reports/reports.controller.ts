import { Request, Response, NextFunction } from "express";
import { reportsService } from "./reports.service.js";

export class ReportsController {
  async getStudentReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const result = await reportsService.getStudentPersonalReport(
        user.id,
        req.query as any
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTeacherAttendanceReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const result = await reportsService.getTeacherAttendanceReport(
        user.id,
        user.role,
        req.query as any
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getAdminSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await reportsService.getAdminInstitutionSummary(
        req.query as any
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getDashboardMetrics(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const result = await reportsService.getDashboardMetrics(
        user.id,
        user.role,
        req.query as any
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async exportStudentReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      await reportsService.exportStudentAttendanceCsv(
        user.id,
        req.query as any,
        res
      );
    } catch (error) {
      next(error);
    }
  }

  async exportTeacherReport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      await reportsService.exportTeacherAttendanceCsv(
        user.id,
        user.role,
        req.query as any,
        res
      );
    } catch (error) {
      next(error);
    }
  }

  async exportAdminSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await reportsService.exportAdminSummaryCsv(
        req.query as any,
        res
      );
    } catch (error) {
      next(error);
    }
  }

  async exportAttendance(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      if (req.query.classId) {
        await reportsService.exportTeacherAttendanceCsv(
          user.id,
          user.role,
          req.query as any,
          res
        );
      } else if (user.role === "ADMIN") {
        await reportsService.exportAdminSummaryCsv(
          req.query as any,
          res
        );
      } else {
        res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "classId query parameter is required for attendance report export",
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
}

export const reportsController = new ReportsController();
