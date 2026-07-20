// src/services/auth-facade.js
//
// Single import surface for the auth flows: re-exports the core service and
// adds the 2FA management operations that compose OTP verification with the
// principal tables.
import { issueOtp, verifyOtp } from "./otp.service.js";
import { tableFor } from "../utils/principal.js";
import { toSafeUser } from "./auth.service.js";

export {
  demoLogin,
  findPrincipal,
  findPrincipalByEmail,
  issueSession,
  loginWithPassword,
  logout,
  requestOtpLogin,
  revokeAllSessions,
  rotateRefreshToken,
  toSafeUser,
  verifyOtpLogin,
  verifyTwoFactorLogin,
  KIND_ADMIN,
  KIND_USER,
} from "./auth.service.js";

/** Sends a code to the signed-in principal (2FA enable/disable proof). */
export const issueOtpForPrincipal = (kind, principal, purpose) =>
  issueOtp({ kind, principal, purpose });

/**
 * Toggles 2FA after the principal proves channel possession with a fresh
 * code - so 2FA can never be switched (on OR off) by a session alone.
 */
export async function setTwoFactorEnabled(kind, principalId, code, enabled) {
  await verifyOtp({ kind, principalId, purpose: "TWO_FACTOR", code });

  const updated = await tableFor(kind).update({
    where: { id: principalId },
    data: { twoFactorEnabled: enabled },
  });

  return toSafeUser(kind, updated);
}
