// test/integration/attendance.test.js
//
// Check-in through the real app: SERVER-SIDE face verification (the trust
// model fix - a matching descriptor checks in, a wrong one is rejected, a
// missing one never reaches the geofence), plus the GPS gate.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import {
  accessTokenFor,
  createEventWithActiveSession,
  createUser,
  DESCRIPTOR,
  WRONG_DESCRIPTOR,
} from "../helpers.js";

const LAT = 6.6885;
const LNG = -1.6244;

describe("POST /api/v1/attendance/:eventId (check-in)", () => {
  it("checks in when the captured descriptor matches the enrolled one", async () => {
    const user = await createUser({
      email: "face@test.local",
      faceScan: DESCRIPTOR,
    });
    const { event } = await createEventWithActiveSession();

    const res = await request(app)
      .post(`/api/v1/attendance/${event.id}`)
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .send({ latitude: LAT, longitude: LNG, faceDescriptor: DESCRIPTOR });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toMatch(/PRESENT|LATE/);
  });

  it("rejects a non-matching descriptor with 401", async () => {
    const user = await createUser({
      email: "face2@test.local",
      faceScan: DESCRIPTOR,
    });
    const { event } = await createEventWithActiveSession();

    const res = await request(app)
      .post(`/api/v1/attendance/${event.id}`)
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .send({
        latitude: LAT,
        longitude: LNG,
        faceDescriptor: WRONG_DESCRIPTOR,
      });

    expect(res.status).toBe(401);
    expect(res.body.message).toMatch(/face verification failed/i);
  });

  it("rejects a check-in without a descriptor (validation)", async () => {
    const user = await createUser({
      email: "face3@test.local",
      faceScan: DESCRIPTOR,
    });
    const { event } = await createEventWithActiveSession();

    const res = await request(app)
      .post(`/api/v1/attendance/${event.id}`)
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .send({ latitude: LAT, longitude: LNG });

    expect(res.status).toBe(400);
  });

  it("rejects an account with no enrolled face with 400", async () => {
    const user = await createUser({ email: "noface@test.local" });
    const { event } = await createEventWithActiveSession();

    const res = await request(app)
      .post(`/api/v1/attendance/${event.id}`)
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      .send({ latitude: LAT, longitude: LNG, faceDescriptor: DESCRIPTOR });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no enrolled face/i);
  });

  it("rejects a check-in outside the 50m geofence", async () => {
    const user = await createUser({
      email: "far@test.local",
      faceScan: DESCRIPTOR,
    });
    const { event } = await createEventWithActiveSession();

    const res = await request(app)
      .post(`/api/v1/attendance/${event.id}`)
      .set("Authorization", `Bearer ${accessTokenFor(user)}`)
      // ~1.1km north of the event location.
      .send({ latitude: LAT + 0.01, longitude: LNG, faceDescriptor: DESCRIPTOR });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/within 50 meters/i);
  });
});
