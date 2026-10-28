import { Request, Response, NextFunction } from "express";
import { subjectsService } from "./subjects.service.js";

export class SubjectsController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await subjectsService.list(req.query);
      res.status(200).json({
        success: true,
        data: result.subjects,
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
      const subjects = await subjectsService.getAll(
        req.query.departmentId as string | undefined
      );
      res.status(200).json({
        success: true,
        data: subjects,
      });
    } catch (error) {
      next(error);
    }
  }

  async getStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await subjectsService.getStats();
      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  async getNextCode(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const departmentId = req.query.departmentId as string;
      const result = await subjectsService.getNextCode(departmentId);
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
      const subject = await subjectsService.getById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: subject,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const subject = await subjectsService.create(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data: subject,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const subject = await subjectsService.update(
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: subject,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await subjectsService.delete(req.user!.id, req.params.id as string);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const subjectsController = new SubjectsController();
