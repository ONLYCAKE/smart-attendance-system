import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../middleware/errorHandler.js";

export const DEFAULT_LOW_ATTENDANCE_THRESHOLD = 75.0;

export class SettingsService {
  /**
   * Retrieves all system configuration settings.
   */
  async getAllSettings() {
    return prisma.systemSetting.findMany({
      orderBy: { key: "asc" },
    });
  }

  /**
   * Retrieves the current low-attendance threshold as a numeric float.
   * Defaults to 75.0 if not configured or unparseable.
   */
  async getLowAttendanceThreshold(): Promise<number> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: "LOW_ATTENDANCE_THRESHOLD_PERCENT" },
    });

    if (!setting) {
      return DEFAULT_LOW_ATTENDANCE_THRESHOLD;
    }

    const parsed = parseFloat(setting.value);
    if (isNaN(parsed) || parsed <= 0 || parsed > 100) {
      return DEFAULT_LOW_ATTENDANCE_THRESHOLD;
    }

    return parsed;
  }

  /**
   * Updates or creates a configurable setting.
   * Enforces business validation and writes an audit log.
   */
  async updateSetting(key: string, value: string, actorUserId: string) {
    if (!key || !value) {
      throw new AppError("Setting key and value are required", 400, "VALIDATION_ERROR");
    }

    // Special validation for threshold
    if (key === "LOW_ATTENDANCE_THRESHOLD_PERCENT") {
      const parsed = parseFloat(value);
      if (isNaN(parsed) || parsed <= 0 || parsed > 100) {
        throw new AppError(
          "Low-attendance threshold must be a number between 1 and 100",
          400,
          "INVALID_THRESHOLD_VALUE"
        );
      }
    }

    const previousSetting = await prisma.systemSetting.findUnique({
      where: { key },
    });

    const updated = await prisma.systemSetting.upsert({
      where: { key },
      update: { value },
      create: {
        key,
        value,
        description:
          key === "LOW_ATTENDANCE_THRESHOLD_PERCENT"
            ? "Configurable institutional low-attendance alert percentage threshold"
            : undefined,
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        actorUserId,
        action: "SETTING_UPDATED",
        entityType: "SystemSetting",
        entityId: updated.id,
        metadata: JSON.stringify({
          key,
          previousValue: previousSetting?.value || null,
          newValue: value,
        }),
      },
    });

    return updated;
  }
}

export const settingsService = new SettingsService();
