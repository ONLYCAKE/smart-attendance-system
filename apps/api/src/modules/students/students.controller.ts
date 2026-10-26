import { Request, Response, NextFunction } from "express";
import { studentsService } from "./students.service.js";
import { AppError } from "../../middleware/errorHandler.js";

export class StudentsController {
  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }
      const result = await studentsService.approveStudent(req.user!.id, studentId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }
      const student = await studentsService.getStudentById(studentId);
      res.status(200).json({
        success: true,
        data: student,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const studentsController = new StudentsController();
