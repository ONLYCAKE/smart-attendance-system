import { Request, Response, NextFunction } from "express";
import { departmentsService } from "./departments.service.js";

export class DepartmentsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await departmentsService.list(req.query);
      res.status(200).json({
        success: true,
        data: result.departments,
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
      const stats = await departmentsService.getStats();
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
      const department = await departmentsService.getById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: department,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentsService.create(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data: department,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const department = await departmentsService.update(
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: department,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await departmentsService.delete(req.user!.id, req.params.id as string);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const departmentsController = new DepartmentsController();
