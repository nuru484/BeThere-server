// test/integration/detective.test.js
//
// The admin review surface (audit log, anomaly flags, evidence) AND proof that
// a failed check-in actually writes those rows - the failure branch the
// disabled test verifier normally skips, exercised here via the test-only
// verifier override.
import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// Evidence storage uploads to Cloudinary; stub it so the write-path test
// neither hits the network nor depends on real credentials. Evidence frames
// upload as authenticated assets (public id stored) and are signed into
// short-lived URLs at read time.
vi.mock("../../src/utils/cloudinary.js", () => ({
  uploadImage: vi.fn().mockResolvedValue("https://cloudinary.test/frame.jpg"),
  uploadAuthenticatedImage: vi
    .fn()
    .mockResolvedValue("bethere/evidence/frame-1"),
  signedImageUrl: vi.fn(
    (publicId) => `https://cloudinary.test/signed/${publicId}`
  ),
  deleteImage: vi.fn().mockResolvedValue(undefined),
  imageColumnValue: (value) => (value === "" ? null : value),
}));

import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { setLivenessVerifierForTest } from "../../src/services/liveness/liveness-verifier.js";
import {
  adminCookie,
  attendantCookie,
  createAdmin,
  createAttendant,
  createEventWithActiveSession,
  venueCodeFor,
  DESCRIPTOR,
} from "../helpers.js";

const FRAME = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

afterEach(() => setLivenessVerifierForTest(null));

async function seedAnomaly(user, event) {
  const evidence = await prisma.attendanceEvidence.create({
    data: {
      userId: user.id,
      eventId: event.id,
      frameUrls: ["https://cloudinary.test/a.jpg"],
      livenessScore: 0.1,
      matchDistance: 0.92,
      reason: "identity_mismatch",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
  const flag = await prisma.anomalyFlag.create({
    data: {
      userId: user.id,
      eventId: event.id,
      type: "LIVENESS_FAILED",
      severity: "MEDIUM",
      evidenceId: evidence.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      actorKind: "USER",
      actorId: user.id,
      action: "CHECK_IN_LIVENESS_FAILED",
      targetType: "Event",
      targetId: event.id,
    },
  });
  return flag;
}

describe("GET /api/v1/review/anomalies", () => {
  it("returns anomalies enriched with the attendant and evidence (admin only)", async () => {
    const admin = await createAdmin({ email: "rev-admin@test.local" });
    const user = await createAttendant({ email: "flagged@test.local" });
    const { event } = await createEventWithActiveSession();
    await seedAnomaly(user, event);

    const res = await request(app)
      .get("/api/v1/review/anomalies")
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].user.email).toBe("flagged@test.local");
    expect(res.body.data[0].evidence.frameUrls.length).toBe(1);
    // Legacy rows stored the delivery URL itself; it passes through unsigned.
    expect(res.body.data[0].evidence.frameUrls[0]).toBe(
      "https://cloudinary.test/a.jpg"
    );
    expect(res.body.meta.total).toBe(1);
  });

  it("signs stored public ids into delivery URLs at read time", async () => {
    const admin = await createAdmin({ email: "rev-sign@test.local" });
    const user = await createAttendant({ email: "signed@test.local" });
    const { event } = await createEventWithActiveSession();

    // A new-style row: the column holds the authenticated public id, never a
    // fetchable URL.
    const evidence = await prisma.attendanceEvidence.create({
      data: {
        userId: user.id,
        eventId: event.id,
        frameUrls: ["bethere/evidence/frame-xyz"],
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.anomalyFlag.create({
      data: {
        userId: user.id,
        eventId: event.id,
        type: "LIVENESS_FAILED",
        severity: "MEDIUM",
        evidenceId: evidence.id,
      },
    });

    const res = await request(app)
      .get("/api/v1/review/anomalies")
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(200);
    expect(res.body.data[0].evidence.frameUrls).toEqual([
      "https://cloudinary.test/signed/bethere/evidence/frame-xyz",
    ]);
  });

  it("forbids an attendant from the review surface (403)", async () => {
    const user = await createAttendant({ email: "nosy@test.local" });
    const res = await request(app)
      .get("/api/v1/review/anomalies")
      .set("Cookie", [attendantCookie(user)]);
    expect(res.status).toBe(403);
  });

  it("filters by resolved state and resolves an anomaly", async () => {
    const admin = await createAdmin({ email: "rev2@test.local" });
    const user = await createAttendant({ email: "flag2@test.local" });
    const { event } = await createEventWithActiveSession();
    const flag = await seedAnomaly(user, event);
    const cookie = [adminCookie(admin)];

    const unresolved = await request(app)
      .get("/api/v1/review/anomalies?resolved=false")
      .set("Cookie", cookie);
    expect(unresolved.body.data.length).toBe(1);

    const resolve = await request(app)
      .patch(`/api/v1/review/anomalies/${flag.id}/resolve`)
      .set("Cookie", cookie);
    expect(resolve.status).toBe(200);

    const stillUnresolved = await request(app)
      .get("/api/v1/review/anomalies?resolved=false")
      .set("Cookie", cookie);
    expect(stillUnresolved.body.data.length).toBe(0);

    const resolved = await request(app)
      .get("/api/v1/review/anomalies?resolved=true")
      .set("Cookie", cookie);
    expect(resolved.body.data.length).toBe(1);
    expect(resolved.body.data[0].resolvedAt).toBeTruthy();
  });
});

describe("GET /api/v1/review/audit-logs", () => {
  it("returns the audit log for admins and 403s attendants", async () => {
    const admin = await createAdmin({ email: "audit-admin@test.local" });
    const user = await createAttendant({ email: "audited@test.local" });
    const { event } = await createEventWithActiveSession();
    await seedAnomaly(user, event);

    const ok = await request(app)
      .get("/api/v1/review/audit-logs")
      .set("Cookie", [adminCookie(admin)]);
    expect(ok.status).toBe(200);
    expect(ok.body.data.some((l) => l.action === "CHECK_IN_LIVENESS_FAILED")).toBe(true);

    const denied = await request(app)
      .get("/api/v1/review/audit-logs")
      .set("Cookie", [attendantCookie(user)]);
    expect(denied.status).toBe(403);
  });
});

describe("failed check-in writes evidence + anomaly + audit", () => {
  it("records the failure trail and returns 401", async () => {
    // Force the liveness verdict to fail regardless of the frames.
    setLivenessVerifierForTest({
      verify: async () => ({
        passed: false,
        score: 0.05,
        matchDistance: 0.94,
        reasons: ["identity_mismatch"],
        failedActions: [],
        replaySuspected: false,
      }),
    });

    const user = await createAttendant({
      email: "willfail@test.local",
      faceScan: DESCRIPTOR,
    });
    const { event } = await createEventWithActiveSession();

    const challenge = await request(app)
      .post(`/api/v1/attendance/${event.id}/challenge`)
      .set("Cookie", [attendantCookie(user)])
      .send({ venueCode: venueCodeFor(event.venueSecret) });
    expect(challenge.status).toBe(200);

    const req = request(app)
      .post(`/api/v1/attendance/${event.id}`)
      .set("Cookie", [attendantCookie(user)])
      .field("challengeToken", challenge.body.data.challengeToken)
      .field("venueCode", venueCodeFor(event.venueSecret));
    for (let i = 0; i < 8; i++) req.attach("frames", FRAME, `f${i}.jpg`);
    const res = await req;

    expect(res.status).toBe(401);

    // No attendance row, but a full review trail.
    const [anomalies, audits, evidence, attendance] = await Promise.all([
      prisma.anomalyFlag.count({ where: { userId: user.id } }),
      prisma.auditLog.count({
        where: { actorId: user.id, action: "CHECK_IN_LIVENESS_FAILED" },
      }),
      prisma.attendanceEvidence.count({ where: { userId: user.id } }),
      prisma.attendance.count({ where: { userId: user.id } }),
    ]);
    expect(anomalies).toBe(1);
    expect(audits).toBe(1);
    expect(evidence).toBe(1);
    expect(attendance).toBe(0);

    // The stored values are authenticated public ids - a leaked DB row or API
    // response body must never contain a standing URL to biometric frames.
    const storedEvidence = await prisma.attendanceEvidence.findFirst({
      where: { userId: user.id },
    });
    expect(storedEvidence.frameUrls.length).toBeGreaterThan(0);
    for (const value of storedEvidence.frameUrls) {
      expect(value).not.toMatch(/^https?:\/\//);
    }
  });
});
