import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { errorHandler, AppError } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";

export function createApp(): Express {
  const app = express();

  // Basic security and request parsing
  app.use(helmet());
  app.use(
    cors({
      origin: [env.APP_ORIGIN, "http://localhost:3000"],
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(cookieParser());

  // Global rate limiter (100 requests per 15 minutes per IP)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: "TOO_MANY_REQUESTS",
        message: "Too many requests from this IP, please try again later",
      },
    },
  });
  app.use("/api", limiter);

  // Health and API routes
  app.use("/api/v1/health", healthRouter);

  // 404 handler
  app.use((_req: Request, _res: Response) => {
    throw new AppError("Route not found", 404, "NOT_FOUND");
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
