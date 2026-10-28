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
import { departmentsRouter } from "./modules/departments/departments.routes.js";
import { academicYearsRouter } from "./modules/academic/academic-years.routes.js";
import { classesRouter } from "./modules/academic/classes.routes.js";
import { subjectsRouter } from "./modules/academic/subjects.routes.js";
import { teacherAssignmentsRouter } from "./modules/academic/teacher-assignments.routes.js";
import { timetableRouter } from "./modules/timetable/timetable.routes.js";
import { sessionsRouter, attendanceRecordsRouter } from "./modules/sessions/sessions.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { settingsRouter } from "./modules/settings/settings.routes.js";

export function createApp(): Express {
  const app = express();

  // Configure reverse proxy trust based on deployment topology
  // Accepts numeric hops (e.g. 1), boolean, or IP/CIDR/subnet strings
  if (env.TRUST_PROXY === "true") {
    app.set("trust proxy", true);
  } else if (env.TRUST_PROXY === "false") {
    app.set("trust proxy", false);
  } else if (!isNaN(Number(env.TRUST_PROXY))) {
    app.set("trust proxy", Number(env.TRUST_PROXY));
  } else if (env.TRUST_PROXY) {
    app.set("trust proxy", env.TRUST_PROXY);
  }

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

  // Global rate limiter (relaxed in development/test to prevent dev/testing lockouts)
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: env.NODE_ENV === "production" ? 500 : 10000,
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
  app.use("/api/v1/departments", departmentsRouter);
  app.use("/api/v1/academic-years", academicYearsRouter);
  app.use("/api/v1/classes", classesRouter);
  app.use("/api/v1/subjects", subjectsRouter);
  app.use("/api/v1/teacher-assignments", teacherAssignmentsRouter);
  app.use("/api/v1/timetable", timetableRouter);
  app.use("/api/v1/attendance-sessions", sessionsRouter);
  app.use("/api/v1/attendance-records", attendanceRecordsRouter);
  app.use("/api/v1/reports", reportsRouter);
  app.use("/api/v1/notifications", notificationsRouter);
  app.use("/api/v1/settings", settingsRouter);

  // 404 handler
  app.use((_req: Request, _res: Response) => {
    throw new AppError("Route not found", 404, "NOT_FOUND");
  });

  // Centralized Error Handler
  app.use(errorHandler);

  return app;
}
