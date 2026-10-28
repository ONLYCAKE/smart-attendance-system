import { Request, Response, NextFunction } from "express";
import { studentsService } from "./students.service.js";
import { AppError } from "../../middleware/errorHandler.js";

export class StudentsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await studentsService.listStudents(req.query as any);
      res.status(200).json({
        success: true,
        data: result.students,
        meta: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await studentsService.getStudentStats();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }
      const { classId } = req.body || {};
      const result = await studentsService.approveStudent(req.user!.id, studentId, { classId });
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async assignClass(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const studentId = req.params.id;
      if (!studentId) {
        throw new AppError("Student ID is required", 400, "BAD_REQUEST");
      }
      const { classId } = req.body || {};
      const result = await studentsService.assignClass(req.user!.id, studentId, classId);
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

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, email, departmentId, classId, password } = req.body || {};
      const result = await studentsService.createStudent(req.user!.id, {
        name,
        email,
        departmentId,
        classId,
        password,
      });
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const studentsController = new StudentsController();
