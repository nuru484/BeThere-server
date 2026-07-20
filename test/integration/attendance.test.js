// test/integration/attendance.test.js
//
// Check-in and check-out through the real app. Presence is proven by the
// rotating venue code (no GPS); identity by server-side face liveness (disabled
// here via LIVENESS_ENABLED=false and covered by test/unit/evaluate.test.js).
// These tests exercise the HTTP flow, the venue-code + mode preflight gates, and
// the frame/challenge validation for both directions.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import {
  attendantCookie,
  createEventWithActiveSession,
  createAttendant,
  venueCodeFor,
  DESCRIPTOR,
} from "../helpers.js";

const FRAME = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

const requestChallenge = (user, event, { venueCode, mode } = {}) =>
  request(app)
    .post(`/api/v1/attendance/${event.id}/challenge`)
    .set("Cookie", [attendantCookie(user)])
    .send({ venueCode: venueCode ?? venueCodeFor(event.venueSecret), mode });

function submitFrames(
  method,
  user,
  event,
  { token, frames = 8, venueCode } = {}
) {
  const agent = request(app);
  // The venue code is re-checked at upload, so presence must still hold when
  // the frames arrive - not only when the challenge was minted.
  const req = agent[method](`/api/v1/attendance/${event.id}`)
    .set("Cookie", [attendantCookie(user)])
    .field("challengeToken", token ?? "")
    .field("venueCode", venueCode ?? venueCodeFor(event.venueSecret));
  for (let i = 0; i < frames; i++) req.attach("frames", FRAME, `frame-${i}.jpg`);
  return req;
}

const enrolled = (email) => createAttendant({ email, faceScan: DESCRIPTOR });

describe("POST /attendance/:eventId/challenge (preflight)", () => {
  it("issues a challenge for an enrolled attendant with a valid venue code", async () => {
    const user = await enrolled("c1@test.local");
    const { event } = await createEventWithActiveSession();

    const res = await requestChallenge(user, event);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.actions)).toBe(true);
    expect(typeof res.body.data.challengeToken).toBe("string");
  });

  it("rejects an invalid venue code with 400", async () => {
    const user = await enrolled("c2@test.local");
    const { event } = await createEventWithActiveSession();

    const res = await requestChallenge(user, event, { venueCode: "0000000000000000" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/venue code/i);
  });

  it("rejects an account with no enrolled face with 400", async () => {
    const user = await createAttendant({ email: "c3@test.local" });
    const { event } = await createEventWithActiveSession();

    const res = await requestChallenge(user, event);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no enrolled face/i);
  });
});

describe("POST /attendance/:eventId (check-in)", () => {
  it("checks in with a valid challenge and captured frames", async () => {
    const user = await enrolled("ci1@test.local");
    const { event } = await createEventWithActiveSession();

    const challenge = await requestChallenge(user, event);
    const res = await submitFrames("post", user, event, {
      token: challenge.body.data.challengeToken,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toMatch(/PRESENT|LATE/);
  });

  it("rejects too few frames (validation)", async () => {
    const user = await enrolled("ci2@test.local");
    const { event } = await createEventWithActiveSession();

    const challenge = await requestChallenge(user, event);
    const res = await submitFrames("post", user, event, {
      token: challenge.body.data.challengeToken,
      frames: 2,
    });

    expect(res.status).toBe(400);
  });

  it("rejects the upload when the venue code is no longer valid", async () => {
    const { event } = await createEventWithActiveSession();
    const user = await enrolled("stalecode@test.local");

    const challenge = await requestChallenge(user, event);
    expect(challenge.status).toBe(200);

    // Presence proved at the preflight, then the frames uploaded with a code
    // that is not the venue's current one - i.e. relayed off-site, or stale.
    const res = await submitFrames("post", user, event, {
      token: challenge.body.data.challengeToken,
      venueCode: "ffffffffffffffff",
    });

    expect(res.status).toBe(400);
    expect(await prisma.attendance.count({ where: { userId: user.id } })).toBe(0);
  });

  it("rejects a missing/invalid challenge token with 401", async () => {
    const user = await enrolled("ci3@test.local");
    const { event } = await createEventWithActiveSession();

    const res = await submitFrames("post", user, event, { token: "nope" });

    expect(res.status).toBe(401);
  });

  it("blocks a second check-in for the same session at the preflight (409)", async () => {
    const user = await enrolled("ci4@test.local");
    const { event } = await createEventWithActiveSession();

    const challenge = await requestChallenge(user, event);
    await submitFrames("post", user, event, {
      token: challenge.body.data.challengeToken,
    });

    const second = await requestChallenge(user, event);
    expect(second.status).toBe(409);
    expect(second.body.message).toMatch(/already checked in/i);
  });
});

describe("PUT /attendance/:eventId (check-out)", () => {
  async function checkInFirst(user, event) {
    const challenge = await requestChallenge(user, event);
    await submitFrames("post", user, event, {
      token: challenge.body.data.challengeToken,
    });
  }

  it("checks out with a valid out-challenge and frames", async () => {
    const user = await enrolled("co1@test.local");
    const { event } = await createEventWithActiveSession();
    await checkInFirst(user, event);

    const outChallenge = await requestChallenge(user, event, { mode: "out" });
    expect(outChallenge.status).toBe(200);

    const res = await submitFrames("put", user, event, {
      token: outChallenge.body.data.challengeToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.checkOutTime).toBeTruthy();
  });

  it("rejects an out-challenge when the user has not checked in (404)", async () => {
    const user = await enrolled("co2@test.local");
    const { event } = await createEventWithActiveSession();

    const res = await requestChallenge(user, event, { mode: "out" });
    expect(res.status).toBe(404);
  });
});
