import { Request, Response, NextFunction } from "express";
import { academicYearsService } from "./academic-years.service.js";

export class AcademicYearsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await academicYearsService.list(req.query);
      res.status(200).json({
        success: true,
        data: result.academicYears,
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

  async getAll(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const years = await academicYearsService.getAll();
      res.status(200).json({
        success: true,
        data: years,
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await academicYearsService.getStats();
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
      const year = await academicYearsService.getById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: year,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const year = await academicYearsService.create(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data: year,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const year = await academicYearsService.update(
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: year,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await academicYearsService.delete(req.user!.id, req.params.id as string);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const academicYearsController = new AcademicYearsController();
