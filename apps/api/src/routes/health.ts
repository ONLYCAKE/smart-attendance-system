
import { Router, Request, Response } from "express";
import fs from "fs";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import {
  readBiometricLedgerEntries,
  getLedgerFilePath,
  getQuarantinedStudentIds,
} from "../modules/enrollment/biometric-ledger.js";

export const healthRouter: Router = Router();

healthRouter.get("/", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    service: "smart-attendance-api",
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor(process.uptime()),
  });
});

healthRouter.get("/ready", async (_req: Request, res: Response) => {
  try {
    // 1. Verify database connectivity
    await prisma.$queryRaw`SELECT 1`;

    // 2. Verify biometric ledger health and fail-closed readiness
    const ledgerPath = getLedgerFilePath();
    if (fs.existsSync(ledgerPath)) {
      readBiometricLedgerEntries();

      // Verify that no pending unreconciled deletions remain in PostgreSQL
      // If a student is quarantined in the durable ledger, their database face enrollment MUST NOT be ACTIVE!
      const quarantinedIds = Array.from(getQuarantinedStudentIds());
      if (quarantinedIds.length > 0) {
        const unreconciledCount = await prisma.faceEnrollment.count({
          where: {
            studentId: { in: quarantinedIds },
            status: "ACTIVE",
          },
        });

        if (unreconciledCount > 0) {
          return res.status(503).json({
            status: "unready",
            error: `Biometric ledger has ${unreconciledCount} pending deletion(s) unreconciled with database face enrollments. Service unready until restore reconciliation completes.`,
          });
        }
      }
    } else {
      const activeEnrollments = await prisma.faceEnrollment.count({ where: { status: "ACTIVE" } });
      if (activeEnrollments > 0) {
        return res.status(503).json({
          status: "unready",
          error: "Biometric ledger file is missing for an active biometric installation",
        });
      }
    }

    return res.status(200).json({
      status: "ready",
      database: "connected",
      ledger: "verified",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return res.status(503).json({
      status: "unready",
      error: err.message || "Readiness check failed",
    });
  }
});
