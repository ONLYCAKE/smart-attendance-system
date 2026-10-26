import express, { Express, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import { csrfGuard } from "./middleware/csrf.js";
import { errorHandler, AppError } from "./middleware/errorHandler.js";
import { healthRouter } from "./routes/health.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { studentsRouter } from "./modules/students/students.routes.js";

export function createApp(): Express {
  const app = express();

  const allowedOrigins =
    env.NODE_ENV === "production"
      ? [env.APP_ORIGIN]
      : [env.APP_ORIGIN, "http://localhost:3000", "http://127.0.0.1:3000"];

  // Basic security and request parsing
  app.use(helmet());
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
    })
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(cookieParser());
  app.use(csrfGuard);

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
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/students", studentsRouter);

  // 404 handler
  app.use((_req: Request, _res: Response) => {
    throw new AppError("Route not found", 404, "NOT_FOUND");
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
