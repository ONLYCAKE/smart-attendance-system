import { Request, Response, NextFunction } from "express";
import { classesService } from "./classes.service.js";

export class ClassesController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await classesService.list(req.query);
      res.status(200).json({
        success: true,
        data: result.classes,
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

  async getAll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const classes = await classesService.getAll({
        departmentId: req.query.departmentId as string | undefined,
        academicYearId: req.query.academicYearId as string | undefined,
      });
      res.status(200).json({
        success: true,
        data: classes,
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await classesService.getStats();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cls = await classesService.getById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: cls,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cls = await classesService.create(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data: cls,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const cls = await classesService.update(
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: cls,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await classesService.delete(req.user!.id, req.params.id as string);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const classesController = new ClassesController();
