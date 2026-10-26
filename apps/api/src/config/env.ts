import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default("postgresql://postgres:postgres@localhost:5432/smart_attendance"),
  JWT_SECRET: z.string().min(16).default("dev_jwt_secret_must_be_changed_in_prod_12345"),
  SESSION_SECRET: z.string().min(16).default("dev_session_secret_must_be_changed_in_prod_12345"),
  APP_ORIGIN: z.string().default("http://localhost:3000"),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment configuration:", parsedEnv.error.format());
  process.exit(1);
}

export const env = parsedEnv.data;
