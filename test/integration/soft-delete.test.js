// test/integration/soft-delete.test.js
//
// Soft-delete semantics and the unified password policy through the API.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { accessTokenFor, createUser } from "../helpers.js";

describe("soft deletes", () => {
  it("DELETE /users/:id soft-deletes: gone from lists, row survives", async () => {
    const admin = await createUser({ email: "admin@test.local", role: "ADMIN" });
    const target = await createUser({ email: "bye@test.local" });

    const del = await request(app)
      .delete(`/api/v1/users/${target.id}`)
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`);
    expect(del.status).toBe(200);

    const list = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`);
    expect(list.body.data.map((u) => u.email)).not.toContain("bye@test.local");

    // The row is still there (findUnique bypasses the scope on purpose).
    const raw = await prisma.user.findUnique({ where: { id: target.id } });
    expect(raw).not.toBeNull();
    expect(raw.deletedAt).not.toBeNull();
  });

  it("the delete-all endpoints are gone", async () => {
    const admin = await createUser({ email: "admin2@test.local", role: "ADMIN" });

    const users = await request(app)
      .delete("/api/v1/users")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`);
    expect(users.status).toBe(404);

    const events = await request(app)
      .delete("/api/v1/events")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`);
    expect(events.status).toBe(404);
  });
});

describe("unified password policy", () => {
  it("rejects a weak password at user creation (min 8 + classes)", async () => {
    const admin = await createUser({ email: "admin3@test.local", role: "ADMIN" });

    const res = await request(app)
      .post("/api/v1/users")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`)
      .send({
        firstName: "Weak",
        lastName: "Password",
        email: "weak@test.local",
        password: "abc1",
      });

    expect(res.status).toBe(400);
  });
});
