// test/integration/users.test.js
//
// The users surface regressions: profile-update hash leak, broken phone
// search, biometric exposure in lists, change-password status codes, and
// the page-size cap.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import {
  accessTokenFor,
  createUser,
  DESCRIPTOR,
} from "../helpers.js";

describe("PUT /api/v1/users/:userId", () => {
  it("never returns the password hash (leak regression)", async () => {
    const user = await createUser({ email: "u1@test.local" });

    const res = await request(app)
      .put(`/api/v1/users/${user.id}`)
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .send({ firstName: "Renamed" });

    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe("Renamed");
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.faceScan).toBeUndefined();
  });
});

describe("GET /api/v1/users", () => {
  it("searches by phone without crashing (phoneNumber regression)", async () => {
    const admin = await createUser({
      email: "admin@test.local",
      role: "ADMIN",
    });
    await createUser({
      email: "target@test.local",
      phone: "+233540000001",
    });

    const res = await request(app)
      .get("/api/v1/users?search=540000001")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe("target@test.local");
  });

  it("exposes hasFaceScan instead of the raw descriptor", async () => {
    const admin = await createUser({
      email: "admin2@test.local",
      role: "ADMIN",
      faceScan: DESCRIPTOR,
    });

    const res = await request(app)
      .get("/api/v1/users")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`);

    expect(res.status).toBe(200);
    for (const row of res.body.data) {
      expect(row.faceScan).toBeUndefined();
      expect(typeof row.hasFaceScan).toBe("boolean");
    }
  });

  it("caps limit at 100 so one request cannot pull the table", async () => {
    const admin = await createUser({
      email: "admin3@test.local",
      role: "ADMIN",
    });

    const res = await request(app)
      .get("/api/v1/users?limit=100000")
      .set("Authorization", `Bearer ${accessTokenFor(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(100);
  });
});

describe("PATCH change password", () => {
  it("answers 400 (not 500) for a wrong current password", async () => {
    const user = await createUser({ email: "cp@test.local" });

    const res = await request(app)
      .patch("/api/v1/users/change-password")
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .send({
        currentPassword: "wrong-password-1",
        newPassword: "NewPassword123!",
      });

    expect(res.status).toBe(400);
  });
});
