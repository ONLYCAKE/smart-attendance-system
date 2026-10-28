import { Router } from "express";
import rateLimit from "express-rate-limit";
import { LoginSchema, StudentRegisterSchema } from "@smart-attendance/shared";
import { authController } from "./auth.controller.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/auth.js";

import { env } from "../../config/env.js";

export const authRouter: Router = Router();

// Stricter rate limiter for authentication endpoints (relaxed in dev/test)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 30 : 1000, // 30 attempts per 15 min per IP in production, 1000 in dev
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: "TOO_MANY_REQUESTS",
      message: "Too many authentication attempts. Please try again after 15 minutes.",
    },
  },
});

authRouter.post("/login", authLimiter, validate(LoginSchema), authController.login);
authRouter.post("/logout", authenticate, authController.logout);
authRouter.get("/registration-options", authController.getRegistrationOptions);
authRouter.post("/register", authLimiter, validate(StudentRegisterSchema), authController.register);
authRouter.get("/me", authenticate, authController.getMe);
authRouter.post("/first-login-password", authenticate, authController.updateFirstLoginPassword);
