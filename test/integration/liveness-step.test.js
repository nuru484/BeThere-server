// test/integration/liveness-step.test.js
//
// The step-by-step liveness flow through the real app: one action verified per
// upload before the next is prompted, for check-in, check-out, and enrollment.
// Liveness is disabled here (LIVENESS_ENABLED=false), so these exercise the HTTP
// flow, step advancement, and final commit - the decision math is covered by
// test/unit/evaluate-action.test.js.
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
const enrolled = (email) => createAttendant({ email, faceScan: DESCRIPTOR });

const stepChallenge = (path, user, body) =>
  request(app)
    .post(path)
    .set("Cookie", [attendantCookie(user)])
    .send(body);

function submitStep(method, path, user, { token, frames = 6, venueCode, consent }) {
  const req = request(app)
    [method](path)
    .set("Cookie", [attendantCookie(user)])
    .field("challengeToken", token ?? "");
  if (venueCode !== undefined) req.field("venueCode", venueCode);
  if (consent !== undefined) req.field("consent", String(consent));
  for (let i = 0; i < frames; i++) req.attach("frames", FRAME, `f-${i}.jpg`);
  return req;
}

describe("step-by-step check-in", () => {
  it("verifies each action then records attendance on the last step", async () => {
    const user = await enrolled("s-ci1@test.local");
    const { event } = await createEventWithActiveSession();
    const venueCode = venueCodeFor(event.venueSecret);

    const challenge = await stepChallenge(
      `/api/v1/attendance/${event.id}/step-challenge`,
      user,
      { venueCode, mode: "in" }
    );
    expect(challenge.status).toBe(200);
    const { challengeToken, totalSteps, nextAction } = challenge.body.data;
    expect(totalSteps).toBeGreaterThanOrEqual(3);
    expect(typeof nextAction).toBe("string");

    let last;
    for (let i = 0; i < totalSteps; i++) {
      last = await submitStep("post", `/api/v1/attendance/${event.id}/step`, user, {
        token: challengeToken,
        venueCode,
      });
      if (i < totalSteps - 1) {
        expect(last.status).toBe(200);
        expect(last.body.data.done).toBe(false);
        expect(last.body.data.currentStep).toBe(i + 1);
        expect(typeof last.body.data.nextAction).toBe("string");
      }
    }

    expect(last.status).toBe(201);
    expect(last.body.data.done).toBe(true);
    expect(last.body.data.attendance.status).toMatch(/PRESENT|LATE/);
    expect(
      await prisma.attendance.count({ where: { userId: user.id } })
    ).toBe(1);
  });

  it("rejects an invalid step token with 401", async () => {
    const user = await enrolled("s-ci2@test.local");
    const { event } = await createEventWithActiveSession();

    const res = await submitStep("post", `/api/v1/attendance/${event.id}/step`, user, {
      token: "nonsense",
      venueCode: venueCodeFor(event.venueSecret),
    });
    expect(res.status).toBe(401);
  });

  it("does not accept more steps once the scan is complete", async () => {
    const user = await enrolled("s-ci3@test.local");
    const { event } = await createEventWithActiveSession();
    const venueCode = venueCodeFor(event.venueSecret);

    const challenge = await stepChallenge(
      `/api/v1/attendance/${event.id}/step-challenge`,
      user,
      { venueCode, mode: "in" }
    );
    const { challengeToken, totalSteps } = challenge.body.data;
    for (let i = 0; i < totalSteps; i++) {
      await submitStep("post", `/api/v1/attendance/${event.id}/step`, user, {
        token: challengeToken,
        venueCode,
      });
    }

    // One extra submit after completion: the challenge is consumed.
    const extra = await submitStep(
      "post",
      `/api/v1/attendance/${event.id}/step`,
      user,
      { token: challengeToken, venueCode }
    );
    expect([401, 409]).toContain(extra.status);
  });

  it("rejects too few frames for a step (validation)", async () => {
    const user = await enrolled("s-ci4@test.local");
    const { event } = await createEventWithActiveSession();
    const venueCode = venueCodeFor(event.venueSecret);

    const challenge = await stepChallenge(
      `/api/v1/attendance/${event.id}/step-challenge`,
      user,
      { venueCode, mode: "in" }
    );
    const res = await submitStep(
      "post",
      `/api/v1/attendance/${event.id}/step`,
      user,
      { token: challenge.body.data.challengeToken, venueCode, frames: 2 }
    );
    expect(res.status).toBe(400);
  });
});

describe("step-by-step check-out", () => {
  it("checks out over per-action steps after a step check-in", async () => {
    const user = await enrolled("s-co1@test.local");
    const { event } = await createEventWithActiveSession();
    const venueCode = venueCodeFor(event.venueSecret);

    // Step check-in first.
    const inCh = await stepChallenge(
      `/api/v1/attendance/${event.id}/step-challenge`,
      user,
      { venueCode, mode: "in" }
    );
    for (let i = 0; i < inCh.body.data.totalSteps; i++) {
      await submitStep("post", `/api/v1/attendance/${event.id}/step`, user, {
        token: inCh.body.data.challengeToken,
        venueCode,
      });
    }

    // Step check-out.
    const outCh = await stepChallenge(
      `/api/v1/attendance/${event.id}/step-challenge`,
      user,
      { venueCode, mode: "out" }
    );
    expect(outCh.status).toBe(200);
    let last;
    for (let i = 0; i < outCh.body.data.totalSteps; i++) {
      last = await submitStep("put", `/api/v1/attendance/${event.id}/step`, user, {
        token: outCh.body.data.challengeToken,
        venueCode,
      });
    }
    expect(last.status).toBe(200);
    expect(last.body.data.done).toBe(true);
    expect(last.body.data.attendance.checkOutTime).toBeTruthy();
  });
});

describe("step-by-step enrollment", () => {
  it("enrolls a face over per-action steps", async () => {
    const user = await createAttendant({ email: "s-en1@test.local" });

    const challenge = await stepChallenge("/api/v1/facescan/step-challenge", user, {});
    expect(challenge.status).toBe(200);
    const { challengeToken, totalSteps } = challenge.body.data;

    let last;
    for (let i = 0; i < totalSteps; i++) {
      last = await submitStep("post", "/api/v1/facescan/step", user, {
        token: challengeToken,
        consent: true,
      });
    }
    expect(last.status).toBe(200);
    expect(last.body.data.done).toBe(true);
    expect(last.body.data.user.hasFaceScan).toBe(true);

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored.faceScanEnc).toBeTruthy();
  });

  it("requires consent on the first step", async () => {
    const user = await createAttendant({ email: "s-en2@test.local" });

    const challenge = await stepChallenge("/api/v1/facescan/step-challenge", user, {});
    const res = await submitStep("post", "/api/v1/facescan/step", user, {
      token: challenge.body.data.challengeToken,
      consent: false,
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/consent/i);
  });
});
