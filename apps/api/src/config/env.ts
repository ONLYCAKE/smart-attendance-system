import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/smart_attendance"),
    JWT_SECRET: z.string().min(16).default("dev_jwt_secret_must_be_changed_in_prod_12345"),
    JWT_ISSUER: z.string().default("smart-attendance-api"),
    JWT_AUDIENCE: z.string().default("smart-attendance-client"),
    SESSION_SECRET: z.string().min(16).default("dev_session_secret_must_be_changed_in_prod_12345"),
    APP_ORIGIN: z.string().default("http://localhost:3000"),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV === "production") {
      if (
        data.JWT_SECRET === "dev_jwt_secret_must_be_changed_in_prod_12345" ||
        data.JWT_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["JWT_SECRET"],
          message: "In production, JWT_SECRET must be at least 32 characters and cannot use default dev secret",
        });
      }
      if (
        data.SESSION_SECRET === "dev_session_secret_must_be_changed_in_prod_12345" ||
        data.SESSION_SECRET.length < 32
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["SESSION_SECRET"],
          message: "In production, SESSION_SECRET must be at least 32 characters and cannot use default dev secret",
        });
      }
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment configuration:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
