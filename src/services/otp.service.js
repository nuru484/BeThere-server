// src/services/otp.service.js
//
// Hashed single-use codes for OTP login and the 2FA second factor. Modeled
// on the password-reset flow: sha256 hash at rest, short TTL, attempt cap,
// atomic consume, resend cooldown. The raw code exists only in the SMS or
// email on its way to the account owner.
import crypto from "node:crypto";
import { prisma } from "../config/prisma-client.js";
import { BadRequestError, TooManyRequestsError } from "../middleware/error-handler.js";
import sendMail from "../utils/sendMail.js";
import { sendSms } from "../utils/send-sms.js";
import logger from "../utils/logger.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const hashCode = (code) => crypto.createHash("sha256").update(code).digest("hex");

const generateCode = () => crypto.randomInt(100000, 1000000).toString();

/**
 * Issues a fresh code for (kind, principal, purpose), invalidating any
 * outstanding one, and delivers it phone-first: SMS when the principal has a
 * phone, email otherwise.
 */
export async function issueOtp({ kind, principal, purpose }) {
  const recent = await prisma.otpCode.findFirst({
    where: {
      kind,
      principalId: principal.id,
      purpose,
      consumedAt: null,
      createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
  });
  if (recent) {
    throw new TooManyRequestsError(
      "A code was just sent. Please wait a minute before requesting another."
    );
  }

  await prisma.otpCode.updateMany({
    where: { kind, principalId: principal.id, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  const code = generateCode();
  const channel = principal.phone ? "SMS" : "EMAIL";

  await prisma.otpCode.create({
    data: {
      kind,
      principalId: principal.id,
      purpose,
      channel,
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });

  const label = purpose === "LOGIN" ? "login" : "verification";
  if (channel === "SMS") {
    await sendSms(
      principal.phone,
      `Your BeThere ${label} code is ${code}. It expires in 5 minutes.`
    );
  } else {
    try {
      await sendMail({
        email: principal.email,
        subject: `Your BeThere ${label} code`,
        text: `Your BeThere ${label} code is ${code}. It expires in 5 minutes.`,
      });
    } catch (error) {
      logger.error(error, "Failed to send OTP email");
      throw new BadRequestError("Could not send the code. Please try again.");
    }
  }

  return { channel };
}

/**
 * Verifies and CONSUMES a code. Wrong codes count toward the attempt cap;
 * hitting the cap kills the code entirely.
 */
export async function verifyOtp({ kind, principalId, purpose, code }) {
  const record = await prisma.otpCode.findFirst({
    where: {
      kind,
      principalId,
      purpose,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  const fail = () => {
    throw new BadRequestError("Invalid or expired code. Please try again.");
  };

  if (!record) fail();

  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });
    fail();
  }

  const matches =
    typeof code === "string" &&
    crypto.timingSafeEqual(
      Buffer.from(hashCode(code), "hex"),
      Buffer.from(record.codeHash, "hex")
    );

  if (!matches) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    fail();
  }

  // Atomic consume: a raced duplicate verification loses.
  const consumed = await prisma.otpCode.updateMany({
    where: { id: record.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) fail();
}

/** Scheduled cleanup of expired codes (BullMQ job). */
export async function cleanupExpiredOtpCodes() {
  const { count } = await prisma.otpCode.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
