// test/unit/sanitize-error-data.test.js
//
// The error handler logs req.body on every handled error. These are the fields
// that must never reach a log line: biometric templates, one-time codes, the
// rotating venue code, and the identifier an OTP was sent to.
import { describe, expect, it } from "vitest";
import { sanitizeErrorData } from "../../src/middleware/error-handler.js";

describe("sanitizeErrorData", () => {
  it("redacts the biometric face template", () => {
    const body = { faceScan: Array.from({ length: 128 }, (_, i) => i / 100) };
    const out = sanitizeErrorData(body);

    expect(out.faceScan).toBe("[REDACTED]");
    expect(JSON.stringify(out)).not.toContain("0.42");
  });

  it("redacts one-time codes, the venue code, and the OTP identifier", () => {
    const out = sanitizeErrorData({
      code: "123456",
      venueCode: "a1b2c3d4e5f60718",
      identifier: "user@example.com",
    });

    expect(out.code).toBe("[REDACTED]");
    expect(out.venueCode).toBe("[REDACTED]");
    expect(out.identifier).toBe("[REDACTED]");
  });

  it("still redacts the original credential fields", () => {
    const out = sanitizeErrorData({
      password: "hunter2",
      currentPassword: "hunter1",
      accessToken: "ey.J",
      apiKey: "sk-live",
    });

    expect(Object.values(out)).toEqual([
      "[REDACTED]",
      "[REDACTED]",
      "[REDACTED]",
      "[REDACTED]",
    ]);
  });

  it("recurses through nested objects and arrays", () => {
    const out = sanitizeErrorData({
      user: { profile: { faceScan: [1, 2, 3] } },
      attempts: [{ code: "111111" }, { code: "222222" }],
    });

    expect(out.user.profile.faceScan).toBe("[REDACTED]");
    expect(out.attempts[0].code).toBe("[REDACTED]");
    expect(out.attempts[1].code).toBe("[REDACTED]");
  });

  it("leaves non-sensitive fields intact", () => {
    const out = sanitizeErrorData({ eventId: 7, mode: "in", role: "ADMIN" });

    expect(out).toEqual({ eventId: 7, mode: "in", role: "ADMIN" });
  });
});
