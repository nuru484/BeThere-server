// src/services/retention.service.js
//
// The scheduled data-minimization sweep. Runs on the token-cleanup worker and
// keeps three kinds of transient/sensitive data from accumulating:
//   - expired auth material (reset tokens, OTP codes, refresh tokens),
//   - single-use liveness challenges,
//   - flagged-attempt evidence past its retention window, and
//   - dormant enrolled face templates (biometric minimization).
import { prisma } from "../config/prisma-client.js";
import logger from "../utils/logger.js";
import { TEMPLATE_DORMANT_DAYS } from "../config/constants.js";
import { cleanupExpiredResetTokens } from "./password-reset.service.js";
import { cleanupExpiredOtpCodes } from "./otp.service.js";
import { cleanupExpiredRefreshTokens } from "./auth.service.js";
import { cleanupExpiredChallenges } from "./liveness-challenge.service.js";
import { purgeExpiredEvidence } from "./attendance-evidence.service.js";

/**
 * Purges enrolled templates for accounts that have not checked in for
 * TEMPLATE_DORMANT_DAYS. Clears the consent record alongside the template so a
 * re-enrollment must re-consent.
 */
async function purgeDormantTemplates() {
  const cutoff = new Date(
    Date.now() - TEMPLATE_DORMANT_DAYS * 24 * 60 * 60 * 1000
  );
  const { count } = await prisma.user.updateMany({
    where: {
      AND: [
        { OR: [{ faceScanEnc: { not: null } }, { faceScan: { not: null } }] },
        {
          OR: [
            { faceLastUsedAt: { lt: cutoff } },
            // NULL never satisfies `lt` in SQL, so a template that has never
            // verified a check-in - notably the legacy plaintext enrollments
            // that predate faceLastUsedAt - would otherwise be skipped
            // forever. Fall back to updatedAt: it is bumped by any write to
            // the row, so it is never earlier than the enrollment itself and
            // cannot purge a freshly enrolled template.
            { faceLastUsedAt: null, updatedAt: { lt: cutoff } },
          ],
        },
      ],
    },
    data: {
      faceScanEnc: null,
      faceScan: null,
      biometricConsentAt: null,
      biometricConsentVersion: null,
      faceLastUsedAt: null,
    },
  });
  return count;
}

/** Runs every retention task; each is independent so one failure is isolated. */
export async function runRetention() {
  const tasks = {
    resetTokens: cleanupExpiredResetTokens,
    otpCodes: cleanupExpiredOtpCodes,
    refreshTokens: cleanupExpiredRefreshTokens,
    challenges: cleanupExpiredChallenges,
    evidence: purgeExpiredEvidence,
    dormantTemplates: purgeDormantTemplates,
  };

  const counts = {};
  for (const [name, task] of Object.entries(tasks)) {
    try {
      counts[name] = await task();
    } catch (error) {
      logger.error(error, `Retention task "${name}" failed`);
      counts[name] = null;
    }
  }
  logger.info({ retention: counts }, "Retention sweep complete");
  return counts;
}
