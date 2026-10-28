import { Request, Response, NextFunction } from "express";
import { teacherAssignmentsService } from "./teacher-assignments.service.js";

export class TeacherAssignmentsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await teacherAssignmentsService.list(req.query);
      res.status(200).json({
        success: true,
        data: result.assignments,
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
      const stats = await teacherAssignmentsService.getStats();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async getTeachersList(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const teachers = await teacherAssignmentsService.getTeachersList();
      res.status(200).json({
        success: true,
        data: teachers,
      });
    } catch (error) {
      next(error);
    }
  }

  async createTeacher(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const teacher = await teacherAssignmentsService.createTeacher(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data: teacher,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assignments = await teacherAssignmentsService.getMyAssignments(req.user!.id);
      res.status(200).json({
        success: true,
        data: assignments,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assignment = await teacherAssignmentsService.getById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assignment = await teacherAssignmentsService.create(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const assignment = await teacherAssignmentsService.update(
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: assignment,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await teacherAssignmentsService.delete(req.user!.id, req.params.id as string);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const teacherAssignmentsController = new TeacherAssignmentsController();
