// test/integration/auth.test.js
//
// The auth core through the real app: login hygiene, the unified envelope,
// refresh ROTATION (consume + successor), replay-as-theft revocation, soft
// deleted accounts, and logout.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { clearAuthzCache } from "../../src/utils/authz-cache.js";
import {
  accessTokenFor,
  createUser,
  sessionFor,
  DESCRIPTOR,
} from "../helpers.js";

const decodePayload = (token) =>
  JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

describe("POST /api/v1/auth/login", () => {
  it("logs in with the { message, data } envelope and a safe user", async () => {
    await createUser({ email: "a@test.local", faceScan: DESCRIPTOR });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "a@test.local", password: "Password123!" });

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();
    expect(res.body.data.user.password).toBeUndefined();
    expect(res.body.data.user.faceScan).toBeUndefined();
    expect(res.body.data.user.tokenVersion).toBeUndefined();
    expect(res.body.data.user.hasFaceScan).toBe(true);
  });

  it("accepts passwords containing HTML-special characters (escape regression)", async () => {
    const password = "P&<>'x!42a";
    await createUser({ email: "special@test.local", password });

    const res = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "special@test.local", password });

    expect(res.status).toBe(200);
  });

  it("rejects login for a soft-deleted account", async () => {
    const user = await createUser({ email: "gone@test.local" });
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

describe("POST /api/v1/refreshToken (rotation)", () => {
  it("rotates: consumes the presented token and issues a successor", async () => {
    const user = await createUser({ email: "c@test.local" });
    const session = await sessionFor(user);

    const res = await request(app)
      .post("/api/v1/refreshToken")
      .set("Authorization", `Bearer ${session.refreshToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.refreshToken).toBeTruthy();

    // The successor works.
    const second = await request(app)
      .post("/api/v1/refreshToken")
      .set("Authorization", `Bearer ${res.body.data.refreshToken}`);
    expect(second.status).toBe(200);
  });

  it("treats replay of a consumed token as theft: every session dies", async () => {
    const user = await createUser({ email: "victim@test.local" });
    const session = await sessionFor(user);

    // Legitimate rotation...
    const first = await request(app)
      .post("/api/v1/refreshToken")
      .set("Authorization", `Bearer ${session.refreshToken}`);
    expect(first.status).toBe(200);

    // ...then the ORIGINAL token is presented again (stolen copy).
    const replay = await request(app)
      .post("/api/v1/refreshToken")
      .set("Authorization", `Bearer ${session.refreshToken}`);
    expect(replay.status).toBe(401);

    // The successor from the legitimate rotation is dead too...
    const successor = await request(app)
      .post("/api/v1/refreshToken")
      .set("Authorization", `Bearer ${first.body.data.refreshToken}`);
    expect(successor.status).toBe(401);

    // ...and so is the outstanding ACCESS token (epoch bump).
    const access = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${first.body.data.accessToken}`);
    expect(access.status).toBe(401);
  });

  it("rejects a refresh for a soft-deleted account", async () => {
    const user = await createUser({ email: "d@test.local" });
    const session = await sessionFor(user);
    await prisma.user.update({
      where: { id: user.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app)
      .post("/api/v1/refreshToken")
      .set("Authorization", `Bearer ${session.refreshToken}`);

    expect(res.status).toBe(401);
  });

  it("mints the CURRENT role, not the role baked into the old token", async () => {
    const user = await createUser({ email: "e@test.local", role: "ADMIN" });
    const session = await sessionFor(user);
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "USER" },
    });

    const res = await request(app)
      .post("/api/v1/refreshToken")
      .set("Authorization", `Bearer ${session.refreshToken}`);

    expect(res.status).toBe(200);
    expect(decodePayload(res.body.data.accessToken).role).toBe("USER");
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("consumes the refresh token so it can never rotate again", async () => {
    const user = await createUser({ email: "f@test.local" });
    const session = await sessionFor(user);

    const out = await request(app)
      .post("/api/v1/auth/logout")
      .set("Authorization", `Bearer ${session.refreshToken}`);
    expect(out.status).toBe(200);

    const res = await request(app)
      .post("/api/v1/refreshToken")
      .set("Authorization", `Bearer ${session.refreshToken}`);
    expect(res.status).toBe(401);
  });
});

describe("session epoch on access tokens", () => {
  it("a revoked epoch kills live access tokens, not just refreshes", async () => {
    const user = await createUser({ email: "g@test.local" });
    const token = accessTokenFor(user);

    const before = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(before.status).toBe(200);

    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    clearAuthzCache();

    const after = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(after.status).toBe(401);
  });
});
