import { Request, Response, NextFunction } from "express";
import { sessionsService } from "./sessions.service.js";
import { AppError } from "../../middleware/errorHandler.js";
import { SessionStatus } from "@prisma/client";

export class SessionsController {
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const session = await sessionsService.createSession(
        user.id,
        user.role,
        req.body
      );
      res.status(201).json({
        success: true,
        data: session,
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { classId, subjectId, status, dateFrom, dateTo, page, limit } = req.query;

      const result = await sessionsService.listSessions(user.id, user.role, {
        classId: classId as string,
        subjectId: subjectId as string,
        status: status as SessionStatus,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        page: page ? parseInt(page as string, 10) : 1,
        limit: limit ? parseInt(limit as string, 10) : 20,
      });

      res.status(200).json({
        success: true,
        data: result.sessions,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new AppError("Session ID is required", 400, "BAD_REQUEST");
      }

      const result = await sessionsService.getSessionById(
        user.id,
        user.role,
        sessionId
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async start(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new AppError("Session ID is required", 400, "BAD_REQUEST");
      }

      const result = await sessionsService.startSession(
        user.id,
        user.role,
        sessionId
      );

      res.status(200).json({
        success: true,
        data: result.session,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async close(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new AppError("Session ID is required", 400, "BAD_REQUEST");
      }

      const result = await sessionsService.closeSession(
        user.id,
        user.role,
        sessionId
      );

      res.status(200).json({
        success: true,
        data: result.session,
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  async markRecords(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new AppError("Session ID is required", 400, "BAD_REQUEST");
      }

      const result = await sessionsService.markAttendance(
        user.id,
        user.role,
        sessionId,
        req.body
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async correctRecord(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const recordId = req.params.id;
      if (!recordId) {
        throw new AppError("Record ID is required", 400, "BAD_REQUEST");
      }

      const result = await sessionsService.correctAttendanceRecord(
        user.id,
        user.role,
        recordId,
        req.body
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async recognizeFace(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new AppError("Session ID is required", 400, "BAD_REQUEST");
      }

      const result = await sessionsService.recognizeFace(
        user.id,
        user.role,
        sessionId,
        req.body
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmRecognition(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const sessionId = req.params.id;
      if (!sessionId) {
        throw new AppError("Session ID is required", 400, "BAD_REQUEST");
      }

      const result = await sessionsService.confirmRecognition(
        user.id,
        user.role,
        sessionId,
        req.body
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const sessionsController = new SessionsController();
