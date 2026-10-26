import { Router } from "express";
import rateLimit from "express-rate-limit";
import { LoginSchema, StudentRegisterSchema } from "@smart-attendance/shared";
import { authController } from "./auth.controller.js";
import { validate } from "../../middleware/validate.js";
import { authenticate } from "../../middleware/auth.js";

export const authRouter: Router = Router();

// Stricter rate limiter for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // 30 attempts per 15 min per IP
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
authRouter.post("/register", authLimiter, validate(StudentRegisterSchema), authController.register);
authRouter.get("/me", authenticate, authController.getMe);
