// test/integration/auth-flows.test.js
//
// 2FA and passwordless OTP through the real app. The SMS/email senders are
// mocked at the module seam so the tests can read the code that "went out";
// everything else (hashing, TTLs, attempt caps, cookies) is real.
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const sent = { sms: [], mail: [] };

vi.mock("../../src/utils/send-sms.js", () => ({
  sendSms: vi.fn(async (phone, message) => {
    sent.sms.push({ phone, message });
  }),
}));
vi.mock("../../src/utils/sendMail.js", () => ({
  default: vi.fn(async ({ email, text }) => {
    sent.mail.push({ email, text });
  }),
}));

const { default: app } = await import("../../app.js");
const { createAdmin, createAttendant, cookiesFromResponse } = await import(
  "../helpers.js"
);

const lastCode = () => {
  const all = [...sent.sms.map((s) => s.message), ...sent.mail.map((m) => m.text)];
  const match = all[all.length - 1]?.match(/\b(\d{6})\b/);
  return match?.[1];
};

beforeEach(() => {
  sent.sms.length = 0;
  sent.mail.length = 0;
});

describe("2FA login", () => {
  it("password step answers twoFactorRequired, code completes the login", async () => {
    await createAttendant({
      email: "tfa@test.local",
      phone: "+233540000010",
      twoFactorEnabled: true,
    });

    const step1 = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "tfa@test.local", password: "Password123!" });

    expect(step1.status).toBe(200);
    expect(step1.body.data.twoFactorRequired).toBe(true);
    expect(step1.body.data.channel).toBe("SMS"); // phone-first
    expect(step1.headers["set-cookie"].join(";")).toMatch(/twoFaPending=/);
    // No auth cookies yet.
    expect(step1.headers["set-cookie"].join(";")).not.toMatch(/bethere_refreshToken=/);

    const code = lastCode();
    expect(code).toBeTruthy();

    const step2 = await request(app)
      .post("/api/v1/auth/login/2fa")
      .set("Cookie", cookiesFromResponse(step1))
      .send({ code });

    expect(step2.status).toBe(200);
    expect(step2.body.data.user.email).toBe("tfa@test.local");
    expect(step2.headers["set-cookie"].join(";")).toMatch(/bethere_refreshToken=/);
  });

  it("still issues the pending cookie when the resend cooldown is hit", async () => {
    await createAttendant({
      email: "tfa3@test.local",
      phone: "+233540000012",
      twoFactorEnabled: true,
    });

    const login = () =>
      request(app)
        .post("/api/v1/auth/login")
        .send({ email: "tfa3@test.local", password: "Password123!" });

    const first = await login();
    const code = lastCode();
    // A refresh within the minute must not 429 away the pending cookie - the
    // user is holding a valid code and needs something to submit it with.
    const second = await login();

    expect(second.status).toBe(200);
    expect(second.body.data.twoFactorRequired).toBe(true);
    expect(second.headers["set-cookie"].join(";")).toMatch(/twoFaPending=/);
    // No second code was sent; the outstanding one still works.
    expect(lastCode()).toBe(code);
    expect(first.status).toBe(200);

    const done = await request(app)
      .post("/api/v1/auth/login/2fa")
      .set("Cookie", cookiesFromResponse(second))
      .send({ code });
    expect(done.status).toBe(200);
  });

  it("rejects a wrong 2FA code and counts the attempt", async () => {
    await createAttendant({
      email: "tfa2@test.local",
      twoFactorEnabled: true,
    });

    const step1 = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "tfa2@test.local", password: "Password123!" });
    expect(step1.body.data.channel).toBe("EMAIL"); // no phone on file

    const step2 = await request(app)
      .post("/api/v1/auth/login/2fa")
      .set("Cookie", cookiesFromResponse(step1))
      .send({ code: "000000" });

    expect(step2.status).toBe(400);
  });
});

describe("2FA management", () => {
  it("enables 2FA only after a code proves the channel", async () => {
    const admin = await createAdmin({ email: "boss2@test.local" });
    const { adminCookie } = await import("../helpers.js");
    const cookie = [adminCookie(admin)];

    const challenge = await request(app)
      .post("/api/v1/auth/2fa/challenge")
      .set("Cookie", cookie);
    expect(challenge.status).toBe(200);

    const enable = await request(app)
      .post("/api/v1/auth/2fa/enable")
      .set("Cookie", cookie)
      .send({ code: lastCode() });

    expect(enable.status).toBe(200);
    expect(enable.body.data.user.twoFactorEnabled).toBe(true);

    // The next password login now demands the second factor.
    const login = await request(app)
      .post("/api/v1/auth/login")
      .send({ email: "boss2@test.local", password: "Password123!" });
    expect(login.body.data.twoFactorRequired).toBe(true);
  });
});

describe("passwordless OTP login (attendants, phone-first)", () => {
  it("logs in with a code sent by SMS and marks the phone verified", async () => {
    await createAttendant({
      email: "otp@test.local",
      phone: "+233540000020",
    });

    const req1 = await request(app)
      .post("/api/v1/auth/otp/request")
      .send({ identifier: "+233540000020" });

    expect(req1.status).toBe(200);
    expect(req1.body.data.channel).toBe("SMS");

    const verify = await request(app)
      .post("/api/v1/auth/otp/verify")
      .send({ identifier: "+233540000020", code: lastCode() });

    expect(verify.status).toBe(200);
    expect(verify.body.data.user.phoneVerified).toBe(true);
    expect(verify.headers["set-cookie"].join(";")).toMatch(/bethere_refreshToken=/);
  });

  it("is enumeration-safe for unknown identifiers", async () => {
    const res = await request(app)
      .post("/api/v1/auth/otp/request")
      .send({ identifier: "nobody@test.local" });

    expect(res.status).toBe(200);
    expect(sent.sms).toHaveLength(0);
    expect(sent.mail).toHaveLength(0);
  });

  it("answers identically for a known and an unknown identifier, twice over", async () => {
    await createAttendant({
      email: "known@test.local",
      phone: "+233540000030",
    });

    const probe = (identifier) =>
      request(app).post("/api/v1/auth/otp/request").send({ identifier });

    // Two probes: the second used to hit the 60s resend cooldown for a real
    // account (429) while an unknown one stayed at 200 - an existence oracle.
    const known = [await probe("known@test.local"), await probe("known@test.local")];
    const unknown = [await probe("ghost@test.local"), await probe("ghost@test.local")];

    for (const res of [...known, ...unknown]) {
      expect(res.status).toBe(200);
    }
    expect(known.map((r) => r.body)).toEqual(unknown.map((r) => r.body));
  });

  it("derives the channel from the identifier, not from the account", async () => {
    // The account HAS a phone, but the email was typed: answering "SMS" here
    // (the account's phone-first channel) would prove the account exists.
    await createAttendant({
      email: "hasphone@test.local",
      phone: "+233540000031",
    });

    const real = await request(app)
      .post("/api/v1/auth/otp/request")
      .send({ identifier: "hasphone@test.local" });
    const fake = await request(app)
      .post("/api/v1/auth/otp/request")
      .send({ identifier: "noaccount@test.local" });

    expect(real.body.data.channel).toBe("EMAIL");
    expect(real.body.data.channel).toBe(fake.body.data.channel);
    // The code really did go out on the channel that was reported.
    expect(sent.mail).toHaveLength(1);
    expect(sent.sms).toHaveLength(0);
  });

  it("a code cannot be used twice", async () => {
    await createAttendant({ email: "otp2@test.local", phone: "+233540000021" });

    await request(app)
      .post("/api/v1/auth/otp/request")
      .send({ identifier: "+233540000021" });
    const code = lastCode();

    const first = await request(app)
      .post("/api/v1/auth/otp/verify")
      .send({ identifier: "+233540000021", code });
    expect(first.status).toBe(200);

    const second = await request(app)
      .post("/api/v1/auth/otp/verify")
      .send({ identifier: "+233540000021", code });
    expect(second.status).toBe(400);
  });
});
