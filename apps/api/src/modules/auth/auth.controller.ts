import { Request, Response, NextFunction } from "express";
import { authService } from "./auth.service.js";
import { env } from "../../config/env.js";

const COOKIE_NAME = "session_token";
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class AuthController {
  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { user, token } = await authService.login(req.body);

      // Set secure HTTP-only cookie
      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        data: {
          user,
          token, // Returned for non-browser/testing clients
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.id) {
        await authService.logout(req.user.id);
      }

      res.clearCookie(COOKIE_NAME, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });

      res.status(200).json({
        success: true,
        data: {
          message: "Signed out successfully",
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.registerStudent(req.body);
      res.status(201).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  async getRegistrationOptions(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const options = await authService.getRegistrationOptions();
      res.status(200).json({
        success: true,
        data: options,
      });
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await authService.getMe(req.user!.id);
      res.status(200).json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateFirstLoginPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { password } = req.body || {};
      const { user, token, message } = await authService.updateFirstLoginPassword(
        req.user!.id,
        password
      );

      // Refresh secure cookie with updated token
      res.cookie(COOKIE_NAME, token, COOKIE_OPTIONS);

      res.status(200).json({
        success: true,
        data: {
          user,
          token,
          message,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
