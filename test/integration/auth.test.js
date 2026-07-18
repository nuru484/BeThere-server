// test/integration/auth.test.js
//
// The auth core through the real app: cookie-only login for both
// principals, refresh ROTATION via cookies, replay-as-theft revocation,
// soft-deleted accounts, and logout.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { clearAuthzCache } from "../../src/utils/authz-cache.js";
import {
  adminCookie,
  attendantCookie,
  cookiesFromResponse,
  createAdmin,
  createAttendant,
  sessionFor,
  DESCRIPTOR,
} from "../helpers.js";

describe("POST /api/v1/auth/login (cookie-only)", () => {
  it("sets httpOnly auth cookies and returns only the safe user", async () => {
    await createAttendant({ email: "a@test.local", faceScan: DESCRIPTOR });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "a@test.local", password: "Password123!" });

    expect(res.status).toBe(200);
    // No token in the body - cookies only.
    expect(JSON.stringify(res.body)).not.toMatch(/accessToken|refreshToken/);
    expect(res.body.data.user.hasFaceScan).toBe(true);
    expect(res.body.data.user.role).toBe("USER");
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.faceScan).toBeUndefined();

    const setCookies = res.headers["set-cookie"].join(";");
    expect(setCookies).toMatch(/accessToken=/);
    expect(setCookies).toMatch(/refreshToken=/);
    expect(setCookies).toMatch(/HttpOnly/);
  });

  it("logs an ADMIN in from the Admin table with role ADMIN", async () => {
    await createAdmin({ email: "boss@test.local" });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "boss@test.local", password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe("ADMIN");
  });

  it("rejects login for a soft-deleted account", async () => {
    const user = await createAttendant({ email: "gone@test.local" });
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "gone@test.local", password: "Password123!" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/v1/refreshToken (cookie rotation)", () => {
  it("rotates via cookie: consumes the token, sets fresh cookies", async () => {
    const user = await createAttendant({ email: "c@test.local" });
    const session = await sessionFor("USER", user);

    const res = await request(app)
      .post("/api/v1/refreshToken")
      .set("Cookie", [session.refreshCookie]);

    expect(res.status).toBe(200);
    const fresh = cookiesFromResponse(res);
    expect(fresh.join(";")).toMatch(/accessToken=/);

    // The successor cookie works; the original is consumed.
    const second = await request(app)
      .post("/api/v1/refreshToken")
      .set("Cookie", fresh.filter((c) => c.startsWith("refreshToken=")));
    expect(second.status).toBe(200);

    const replay = await request(app)
      .post("/api/v1/refreshToken")
      .set("Cookie", [session.refreshCookie]);
    expect(replay.status).toBe(401);
  });

  it("treats replay as theft: every session for the principal dies", async () => {
    const user = await createAttendant({ email: "victim@test.local" });
    const session = await sessionFor("USER", user);

    const first = await request(app)
      .post("/api/v1/refreshToken")
      .set("Cookie", [session.refreshCookie]);
    expect(first.status).toBe(200);
    const firstCookies = cookiesFromResponse(first);

    // Stolen copy replayed.
    const replay = await request(app)
      .post("/api/v1/refreshToken")
      .set("Cookie", [session.refreshCookie]);
    expect(replay.status).toBe(401);

    // Successor refresh dead, and the live access token dead too.
    const successor = await request(app)
      .post("/api/v1/refreshToken")
      .set("Cookie", firstCookies.filter((c) => c.startsWith("refreshToken=")));
    expect(successor.status).toBe(401);

    const access = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Cookie", firstCookies.filter((c) => c.startsWith("accessToken=")));
    expect(access.status).toBe(401);
  });

  it("rejects refresh for a soft-deleted account", async () => {
    const user = await createAttendant({ email: "d@test.local" });
    const session = await sessionFor("USER", user);
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app)
      .post("/api/v1/refreshToken")
      .set("Cookie", [session.refreshCookie]);

    expect(res.status).toBe(401);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("consumes the refresh token and clears the cookies", async () => {
    const user = await createAttendant({ email: "f@test.local" });
    const session = await sessionFor("USER", user);

    const out = await request(app)
      .post("/api/v1/auth/logout")
      .set("Cookie", session.cookies);
    expect(out.status).toBe(200);
    expect(out.headers["set-cookie"].join(";")).toMatch(/accessToken=;/);

    const res = await request(app)
      .post("/api/v1/refreshToken")
      .set("Cookie", [session.refreshCookie]);
    expect(res.status).toBe(401);
  });
});

describe("session epoch", () => {
  it("a revoked epoch kills live access cookies immediately", async () => {
    const user = await createAttendant({ email: "g@test.local" });
    const cookie = attendantCookie(user);

    const before = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Cookie", [cookie]);
    expect(before.status).toBe(200);

    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    clearAuthzCache();

    const after = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Cookie", [cookie]);
    expect(after.status).toBe(401);
  });

  it("admins and attendants with the same id are distinct principals", async () => {
    const admin = await createAdmin({ email: "same-id-admin@test.local" });
    const user = await createAttendant({ email: "same-id-user@test.local" });

    // The attendant cannot read the admin surface even if ids collide.
    const res = await request(app)
      .get("/api/v1/admins")
      .set("Cookie", [attendantCookie(user)]);
    expect(res.status).toBe(403);

    const ok = await request(app)
      .get("/api/v1/admins")
      .set("Cookie", [adminCookie(admin)]);
    expect(ok.status).toBe(200);
  });
});
