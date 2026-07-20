// test/integration/auth-me-demo.test.js
//
// GET /auth/me resolves the current principal from the cookie (client
// hydration without persisting the user), and demo login is inert unless
// explicitly enabled (DEMO_LOGIN_ENABLED is false in the test env).
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { createAttendant, attendantCookie } from "../helpers.js";

describe("GET /api/v1/auth/me", () => {
  it("returns the current user for a valid cookie", async () => {
    const user = await createAttendant({ email: "me@test.local" });

    const res = await request(app)
      .get("/api/v1/auth/me")
      .set("Cookie", [attendantCookie(user)]);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("me@test.local");
    expect(res.body.data.user.role).toBe("USER");
    expect(res.body.data.user.password).toBeUndefined();
  });

  it("401s without a session cookie", async () => {
    const res = await request(app).get("/api/v1/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/demo-login", () => {
  it("is forbidden when DEMO_LOGIN_ENABLED is off", async () => {
    const res = await request(app)
      .post("/api/v1/auth/demo-login")
      .send({ role: "ADMIN" });

    expect(res.status).toBe(403);
  });

  it("validates the role", async () => {
    const res = await request(app)
      .post("/api/v1/auth/demo-login")
      .send({ role: "SUPERUSER" });

    expect(res.status).toBe(400);
  });
});
