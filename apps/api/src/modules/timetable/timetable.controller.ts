import { Request, Response, NextFunction } from "express";
import { timetableService } from "./timetable.service.js";

export class TimetableController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await timetableService.list(req.query, req.user);
      res.status(200).json({
        success: true,
        data: result.entries,
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

  async getMyTimetable(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await timetableService.getMyTimetable(req.user!);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async exportCsv(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { filename, csv } = await timetableService.exportCsv(req.query, req.user!);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send(csv);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entry = await timetableService.getById(req.params.id as string);
      res.status(200).json({
        success: true,
        data: entry,
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entry = await timetableService.create(req.user!.id, req.body);
      res.status(201).json({
        success: true,
        data: entry,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const entry = await timetableService.update(
        req.user!.id,
        req.params.id as string,
        req.body
      );
      res.status(200).json({
        success: true,
        data: entry,
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await timetableService.delete(req.user!.id, req.params.id as string);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const timetableController = new TimetableController();
