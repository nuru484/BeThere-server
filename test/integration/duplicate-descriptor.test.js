// test/integration/duplicate-descriptor.test.js
//
// Buddy-punching defense: the same face cannot be enrolled under a second
// account. The second enrollment is refused with 409 and a
// DUPLICATE_DESCRIPTOR anomaly is flagged for review.
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { setEnrollmentVerifierForTest } from "../../src/services/liveness/liveness-verifier.js";
import { attendantCookie, createAttendant, DESCRIPTOR } from "../helpers.js";

const FRAME = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

const stubEnroller = (descriptor) =>
  setEnrollmentVerifierForTest({
    enroll: async () => ({
      passed: true,
      reasons: [],
      failedActions: [],
      descriptor,
    }),
  });

afterEach(() => setEnrollmentVerifierForTest(null));

async function enroll(user) {
  const cookie = [attendantCookie(user)];
  const challenge = await request(app)
    .post("/api/v1/facescan/challenge")
    .set("Cookie", cookie)
    .expect(200);

  const req = request(app)
    .post("/api/v1/facescan")
    .set("Cookie", cookie)
    .field("challengeToken", challenge.body.data.challengeToken)
    .field("consent", "true");
  for (let i = 0; i < 6; i++) req.attach("frames", FRAME, `f${i}.jpg`);
  return req;
}

describe("duplicate descriptor detection", () => {
  it("rejects enrolling a face already enrolled on another account", async () => {
    const first = await createAttendant({ email: "dup1@test.local" });
    const second = await createAttendant({ email: "dup2@test.local" });

    stubEnroller(DESCRIPTOR);
    const ok = await enroll(first);
    expect(ok.status).toBe(200);

    // Same face (a near-identical template) from a different account.
    stubEnroller(DESCRIPTOR.map((n) => n + 0.001));
    const res = await enroll(second);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/another account/i);

    // No template stored for the second account.
    const stored = await prisma.user.findUnique({ where: { id: second.id } });
    expect(stored.faceScanEnc).toBeNull();

    // The review trail exists, pointing at the enrolling user.
    const flag = await prisma.anomalyFlag.findFirst({
      where: { userId: second.id, type: "DUPLICATE_DESCRIPTOR" },
    });
    expect(flag).toBeTruthy();
    expect(flag.severity).toBe("HIGH");
    expect(flag.detail).toMatchObject({ matchedUserId: first.id });
  });

  it("allows a genuinely different face to enroll", async () => {
    const first = await createAttendant({ email: "dup3@test.local" });
    const second = await createAttendant({ email: "dup4@test.local" });

    stubEnroller(DESCRIPTOR);
    await enroll(first).then((res) => expect(res.status).toBe(200));

    // Far outside the match threshold: a different person.
    stubEnroller(DESCRIPTOR.map((n) => n + 1));
    const res = await enroll(second);

    expect(res.status).toBe(200);
    expect(
      await prisma.anomalyFlag.count({
        where: { userId: second.id, type: "DUPLICATE_DESCRIPTOR" },
      })
    ).toBe(0);
  });
});
