
import { Router, Request, Response } from "express";
import { env } from "../config/env.js";

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
