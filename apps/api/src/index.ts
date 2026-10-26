import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`🚀 Smart Attendance API running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  console.log(`📍 Health check: http://localhost:${env.PORT}/api/v1/health`);
});

// Graceful shutdown
const shutdown = () => {
  console.log("Shutting down gracefully...");
  server.close(() => {
    console.log("Server closed.");
    process.exit(0);
  });
};

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
