import { Request, Response, NextFunction } from "express";
import { Role } from "@prisma/client";
import { AppError } from "./errorHandler.js";

export function requireRoles(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new AppError("Authentication required", 401, "UNAUTHORIZED");
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        "You do not possess the required permission for this resource",
        403,
        "FORBIDDEN"
      );
    }

    next();
  };
}

export const requireAdmin = requireRoles(Role.ADMIN);
export const requireTeacherOrAdmin = requireRoles(Role.ADMIN, Role.TEACHER);

export function requireStudentSelfOrAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "UNAUTHORIZED");
  }

  if (req.user.role === Role.ADMIN) {
    return next();
  }

  const targetStudentId = req.params.studentId || req.params.id;

  if (req.user.role === Role.STUDENT && req.user.studentId === targetStudentId) {
    return next();
  }

  throw new AppError(
    "You are not authorized to access another student's information",
    403,
    "FORBIDDEN"
  );
}
