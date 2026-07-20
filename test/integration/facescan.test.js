// test/integration/facescan.test.js
//
// Face enrollment lifecycle over HTTP: a one-time self-enrollment that returns
// the refreshed user (so the client stops offering the scan), the re-enroll
// block, and the admin reset that lets the user enroll again.
import { describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../app.js";
import {
  adminCookie,
  attendantCookie,
  createAdmin,
  createAttendant,
  DESCRIPTOR,
} from "../helpers.js";

describe("POST /api/v1/facescan (enrollment)", () => {
  it("enrolls once and returns the refreshed user with hasFaceScan true, never the descriptor", async () => {
    const user = await createAttendant({ email: "enroll@test.local" });

    const res = await request(app)
      .post("/api/v1/facescan")
      .set("Cookie", attendantCookie(user))
      .send({ faceScan: DESCRIPTOR, consent: true });

    expect(res.status).toBe(200);
    // The client reads response.data.user to refresh its session so the
    // enrollment prompt disappears - this is the contract it depends on.
    expect(res.body.data.user.id).toBe(user.id);
    expect(res.body.data.user.hasFaceScan).toBe(true);
    // The raw template (and its ciphertext) must never leave the server.
    expect(res.body.data.user.faceScan).toBeUndefined();
    expect(res.body.data.user.faceScanEnc).toBeUndefined();
  });

  it("refuses enrollment without consent", async () => {
    const user = await createAttendant({ email: "noconsent@test.local" });

    const res = await request(app)
      .post("/api/v1/facescan")
      .set("Cookie", attendantCookie(user))
      .send({ faceScan: DESCRIPTOR, consent: false });

    expect(res.status).toBe(400);
  });

  it("blocks a second enrollment until an admin resets it", async () => {
    const user = await createAttendant({ email: "reenroll@test.local" });
    const cookie = attendantCookie(user);

    await request(app)
      .post("/api/v1/facescan")
      .set("Cookie", cookie)
      .send({ faceScan: DESCRIPTOR, consent: true })
      .expect(200);

    // Second attempt is a conflict while a scan is on file.
    await request(app)
      .post("/api/v1/facescan")
      .set("Cookie", cookie)
      .send({ faceScan: DESCRIPTOR, consent: true })
      .expect(409);

    // Admin resets, which clears the template.
    const admin = await createAdmin({ email: "reset-admin@test.local" });
    await request(app)
      .delete(`/api/v1/facescan/${user.id}`)
      .set("Cookie", adminCookie(admin))
      .expect(200);

    // The user can now enroll again, and the refreshed user reflects it.
    const again = await request(app)
      .post("/api/v1/facescan")
      .set("Cookie", cookie)
      .send({ faceScan: DESCRIPTOR, consent: true });

    expect(again.status).toBe(200);
    expect(again.body.data.user.hasFaceScan).toBe(true);
  });

  it("only lets admins reset another user's face scan", async () => {
    const user = await createAttendant({ email: "victim@test.local" });
    await request(app)
      .post("/api/v1/facescan")
      .set("Cookie", attendantCookie(user))
      .send({ faceScan: DESCRIPTOR, consent: true })
      .expect(200);

    const other = await createAttendant({ email: "other@test.local" });
    await request(app)
      .delete(`/api/v1/facescan/${user.id}`)
      .set("Cookie", attendantCookie(other))
      .expect(403);
  });
});
