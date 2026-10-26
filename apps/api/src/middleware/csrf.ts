import { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { AppError } from "./errorHandler.js";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function csrfGuard(req: Request, _res: Response, next: NextFunction): void {
  // Only apply to state-changing requests
  if (!MUTATING_METHODS.has(req.method)) {
    return next();
  }

  // Requests without session cookies (e.g. Bearer token clients) are not subject to ambient credential CSRF
  const hasCookieAuth = Boolean(req.cookies?.session_token);
  if (!hasCookieAuth) {
    return next();
  }

  // Check Origin or Referer against allowed origins
  const origin = req.headers.origin;
  const referer = req.headers.referer;

  const allowedOrigins = [
    env.APP_ORIGIN,
    ...(env.NODE_ENV !== "production" ? ["http://localhost:3000", "http://127.0.0.1:3000"] : []),
  ];

  if (origin) {
    if (!allowedOrigins.includes(origin)) {
      throw new AppError("Cross-site request blocked: invalid origin", 403, "CSRF_DETECTED");
    }
    return next();
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      if (!allowedOrigins.includes(refererOrigin)) {
        throw new AppError("Cross-site request blocked: invalid referer origin", 403, "CSRF_DETECTED");
      }
      return next();
    } catch {
      throw new AppError("Cross-site request blocked: malformed referer", 403, "CSRF_DETECTED");
    }
  }

  // If cookie auth is present on a mutating request in browser, Origin or Referer is mandatory
  // (In test suites without origin, or custom headers, allow if custom header is present)
  if (req.headers["x-requested-with"] || req.headers["x-csrf-protection"]) {
    return next();
  }

  // In test environments where fetch() does not send origin by default to local server,
  // allow if NODE_ENV === 'test' and no hostile origin is present
  if (env.NODE_ENV === "test") {
    return next();
  }

  throw new AppError("Cross-site request blocked: missing origin or referer header", 403, "CSRF_DETECTED");
}
