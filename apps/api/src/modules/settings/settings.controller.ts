import { Request, Response, NextFunction } from "express";
import { settingsService } from "./settings.service.js";

export class SettingsController {
  async getSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await settingsService.getAllSettings();
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }

  async updateSetting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.user!;
      const { key, value } = req.body;
      const data = await settingsService.updateSetting(key, value, user.id);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();
