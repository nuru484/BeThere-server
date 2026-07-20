// test/integration/rate-limit.test.js
//
// The limiters run for real here (test override), against tracked in-memory
// stores that reset between tests. Covers the 429 envelope, the
// failures-only login counter, per-principal keying on the attendance
// surface (a venue shares one NAT), and the RAPID_ATTEMPTS anomaly flag.
//
// Not covered: the fail-closed (passOnStoreError: false) behavior on
// credential limiters - it only triggers on a store error, and the memory
// store used in tests cannot fail. That path would need a fault-injecting
// Redis stub around a RedisStore, which the shared-client design does not
// currently seam out.
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import {
  resetRateLimitCounters,
  setRateLimitTestOverride,
} from "../../src/middleware/rate-limit.js";
import {
  attendantCookie,
  createAttendant,
  DESCRIPTOR,
} from "../helpers.js";

beforeEach(() => {
  setRateLimitTestOverride(true);
  resetRateLimitCounters();
});

afterAll(() => {
  setRateLimitTestOverride(false);
});

const login = (email, password) =>
  request(app).post("/api/v1/auth/login").send({ email, password });

describe("login limiter", () => {
  it("blocks after 10 FAILED attempts with the standard 429 envelope", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await login("nobody@test.local", "wrong-password");
      expect(res.status).toBe(401);
    }

    const blocked = await login("nobody@test.local", "wrong-password");
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      status: "error",
      code: "RATE_LIMIT_EXCEEDED",
    });
    expect(blocked.body.message).toMatch(/too many/i);
  });

  it("does not count successful logins toward the limit", async () => {
    await createAttendant({
      email: "limit-ok@test.local",
      password: "Password123!",
    });

    for (let i = 0; i < 12; i++) {
      const res = await login("limit-ok@test.local", "Password123!");
      expect(res.status).toBe(200);
    }

    // Still capacity for failures afterwards: the counter tracked none of
    // the successes.
    const failed = await login("limit-ok@test.local", "wrong");
    expect(failed.status).toBe(401);
  });
});

describe("attendance limiter (per principal)", () => {
  const challenge = (user) =>
    request(app)
      .post("/api/v1/attendance/1/challenge")
      .set("Cookie", [attendantCookie(user)])
      .send({ venueCode: "0000000000000000" });

  it("keys per principal: one user hitting the wall does not 429 the venue", async () => {
    const userA = await createAttendant({
      email: "limit-a@test.local",
      faceScan: DESCRIPTOR,
    });
    const userB = await createAttendant({
      email: "limit-b@test.local",
      faceScan: DESCRIPTOR,
    });

    // Burn user A's 20-attempt budget (every attempt 404s on the unknown
    // event - all attempts count on this surface).
    for (let i = 0; i < 20; i++) {
      const res = await challenge(userA);
      expect(res.status).not.toBe(429);
    }
    const blockedA = await challenge(userA);
    expect(blockedA.status).toBe(429);
    expect(blockedA.body.code).toBe("RATE_LIMIT_EXCEEDED");

    // Same "IP" (supertest), different principal: unaffected.
    const resB = await challenge(userB);
    expect(resB.status).not.toBe(429);
  });

  it("flags a RAPID_ATTEMPTS anomaly when an attendant hits the wall", async () => {
    const user = await createAttendant({
      email: "limit-rapid@test.local",
      faceScan: DESCRIPTOR,
    });

    for (let i = 0; i < 21; i++) {
      await challenge(user);
    }

    // The 21st hit the limiter, which records the anomaly (best-effort but
    // synchronous enough to await here via polling once).
    const flag = await prisma.anomalyFlag.findFirst({
      where: { userId: user.id, type: "RAPID_ATTEMPTS" },
    });
    expect(flag).toBeTruthy();
    expect(flag.severity).toBe("MEDIUM");
  });
});

describe("OTP request limiter on /auth/2fa/challenge", () => {
  it("applies a request cap to the send-costing 2FA challenge endpoint", async () => {
    const user = await createAttendant({
      email: "limit-2fa@test.local",
      password: "Password123!",
    });

    // The endpoint requires auth; the OTP request limiter (5 per window,
    // IP-keyed) sits in front. The service-level cooldown answers 429 too,
    // so assert the LIMITER's envelope appears from the 6th request on.
    let last;
    for (let i = 0; i < 6; i++) {
      last = await request(app)
        .post("/api/v1/auth/2fa/challenge")
        .set("Cookie", [attendantCookie(user)])
        .send({});
    }
    expect(last.status).toBe(429);
    expect(last.body.code).toBe("RATE_LIMIT_EXCEEDED");
  });
});
