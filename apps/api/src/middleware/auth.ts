import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role, UserStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "./errorHandler.js";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  studentId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface JwtPayload {
  userId: string;
  role: Role;
  email: string;
  tokenVersion?: number;
}

export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Extract token from HTTP-only cookie or Authorization header
    let token = req.cookies?.session_token;

    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(" ");
      if (parts.length === 2 && parts[0] === "Bearer") {
        token = parts[1];
      }
    }

    if (!token) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    // 2. Verify signature, algorithm, issuer, and audience
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
        issuer: env.JWT_ISSUER,
        audience: env.JWT_AUDIENCE,
      }) as JwtPayload;
    } catch {
      throw new AppError("Invalid or expired session token", 401, "UNAUTHORIZED");
    }

    // 3. Verify user in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        studentProfile: {
          select: { id: true, status: true },
        },
      },
    });

    if (!user) {
      throw new AppError("User account not found", 401, "UNAUTHORIZED");
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new AppError("Account is pending approval or inactive", 403, "ACCOUNT_INACTIVE");
    }

    // 4. Invalidate tokens with missing or mismatched tokenVersion (e.g. legacy/tampered tokens or after logout)
    if (decoded.tokenVersion === undefined || decoded.tokenVersion !== user.tokenVersion) {
      throw new AppError("Session has been terminated or logged out", 401, "UNAUTHORIZED");
    }

    // 5. Attach safe authenticated user context
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      studentId: user.studentProfile?.id,
    };

    next();
  } catch (error) {
    next(error);
  }
}
