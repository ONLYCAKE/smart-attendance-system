import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, Server } from "http";
import { createApp } from "../src/app.js";

describe("API Foundation & Health Endpoints", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createApp();
    server = createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it("GET /api/v1/health should return 200 OK with status and service metadata", async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("service", "smart-attendance-api");
    expect(body).toHaveProperty("timestamp");
    expect(body).toHaveProperty("environment");
  });

  it("GET /api/v1/non-existent-route should return 404 with standard error envelope", async () => {
    const res = await fetch(`${baseUrl}/api/v1/non-existent-route`);
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(body.error).toHaveProperty("code", "NOT_FOUND");
    expect(body.error).toHaveProperty("message", "Route not found");
  });
});
