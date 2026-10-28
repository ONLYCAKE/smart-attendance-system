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
    TRUST_PROXY: z.string().default("1"),
    BIOMETRIC_LEDGER_PATH: z.string().default("./data/biometric-ledger/biometric-lifecycle-ledger.jsonl"),
    BIOMETRIC_LEDGER_KEY: z.string().min(16).optional(),
    BIOMETRIC_LEDGER_KEY_ID: z.string().default("k1"),
    ALLOW_LEGACY_UNKEYED_LEDGER: z.coerce.boolean().default(process.env.NODE_ENV !== "production"),
    BIOMETRIC_ENCRYPTION_KEY: z.string().min(16).optional(),
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
      if (data.BIOMETRIC_LEDGER_KEY && data.BIOMETRIC_LEDGER_KEY.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BIOMETRIC_LEDGER_KEY"],
          message: "In production, BIOMETRIC_LEDGER_KEY must be at least 32 characters",
        });
      }
      if (data.BIOMETRIC_ENCRYPTION_KEY && data.BIOMETRIC_ENCRYPTION_KEY.length < 32) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["BIOMETRIC_ENCRYPTION_KEY"],
          message: "In production, BIOMETRIC_ENCRYPTION_KEY must be at least 32 characters",
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
