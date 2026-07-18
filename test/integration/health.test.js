// test/integration/health.test.js
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";

describe("health endpoints", () => {
  it("GET /health answers 200 without auth", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("GET /health/db verifies database connectivity", async () => {
    const res = await request(app).get("/health/db");
    expect(res.status).toBe(200);
    expect(res.body.db).toBe("up");
  });
});
