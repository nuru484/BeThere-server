// test/integration/security-hardening.test.js
//
// CORS allow/deny, the readiness endpoint, query-filter hardening on the
// list surfaces, and the upload gates (magic bytes + multer limits).
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import ENV from "../../src/config/env.js";
import {
  adminCookie,
  attendantCookie,
  createAdmin,
  createAttendant,
  DESCRIPTOR,
} from "../helpers.js";

describe("CORS", () => {
  it("allows the FRONTEND_URL origin with credentials", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", ENV.FRONTEND_URL);

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe(ENV.FRONTEND_URL);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("denies an unknown origin with 403 CORS_ORIGIN_DENIED", async () => {
    const res = await request(app)
      .get("/health")
      .set("Origin", "https://evil.example");

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("CORS_ORIGIN_DENIED");
  });
});

describe("GET /health/ready", () => {
  it("reports ready when the database is reachable", async () => {
    const res = await request(app).get("/health/ready");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", db: "up" });
  });
});

describe("query filter hardening", () => {
  it("400s an array search param on /users instead of a Prisma error", async () => {
    const admin = await createAdmin({ email: "qh1@test.local" });

    const res = await request(app)
      .get("/api/v1/users?search[]=a&search[]=b")
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid search/i);
  });

  it("400s array params on /events", async () => {
    const admin = await createAdmin({ email: "qh2@test.local" });

    for (const query of ["search[]=a", "type[]=a", "location[]=a"]) {
      const res = await request(app)
        .get(`/api/v1/events?${query}`)
        .set("Cookie", [adminCookie(admin)]);
      expect(res.status).toBe(400);
    }
  });

  it("400s a bogus anomaly type on /review/anomalies with a field message", async () => {
    const admin = await createAdmin({ email: "qh3@test.local" });

    const res = await request(app)
      .get("/api/v1/review/anomalies?type=BOGUS")
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/invalid anomaly type/i);
  });

  it("400s array params on /review/audit-logs", async () => {
    const admin = await createAdmin({ email: "qh4@test.local" });

    const res = await request(app)
      .get("/api/v1/review/audit-logs?action[]=a")
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(400);
  });
});

describe("upload gates", () => {
  const JPEG = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from("jpeg-bytes"),
  ]);

  it("rejects a correct mimetype with non-image bytes (magic-byte check)", async () => {
    const user = await createAttendant({ email: "up1@test.local" });

    const res = await request(app)
      .patch(`/api/v1/users/${user.id}/profile-picture`)
      .set("Cookie", [attendantCookie(user)])
      .attach("profilePicture", Buffer.from("<script>alert(1)</script>"), {
        filename: "innocent.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_IMAGE");
  });

  it("rejects a disallowed mimetype at the multer filter", async () => {
    const user = await createAttendant({ email: "up2@test.local" });

    const res = await request(app)
      .patch(`/api/v1/users/${user.id}/profile-picture`)
      .set("Cookie", [attendantCookie(user)])
      .attach("profilePicture", Buffer.from("plain text"), {
        filename: "notes.txt",
        contentType: "text/plain",
      });

    expect(res.status).toBe(400);
  });

  it("rejects an oversized frame with a clean 400, not a 500", async () => {
    const user = await createAttendant({
      email: "up3@test.local",
      faceScan: DESCRIPTOR,
    });
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(2 * 1024 * 1024),
    ]);

    const req = request(app)
      .post("/api/v1/facescan")
      .set("Cookie", [attendantCookie(user)])
      .field("challengeToken", "x")
      .field("consent", "true")
      .attach("frames", big, "big.jpg");
    const res = await req;

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UPLOAD_ERROR");
  });

  it("rejects more frames than the burst allows with a clean 400", async () => {
    const user = await createAttendant({
      email: "up4@test.local",
      faceScan: DESCRIPTOR,
    });

    const req = request(app)
      .post("/api/v1/facescan")
      .set("Cookie", [attendantCookie(user)])
      .field("challengeToken", "x")
      .field("consent", "true");
    for (let i = 0; i < 17; i++) {
      req.attach("frames", JPEG, `frame-${i}.jpg`);
    }
    const res = await req;

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("UPLOAD_ERROR");
  });
});
