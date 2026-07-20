// src/utils/authorization.js
//
// Authorization gates shared by the services. The actor is the
// authenticated principal from the JWT ({ id, kind, role }).
import { ForbiddenError } from "../middleware/error-handler.js";

/**
 * Allows an ATTENDANT actor to touch their own resource; anyone else's
 * requires the ADMIN kind. Admins and attendants live in separate tables
 * with overlapping ids, so "self" requires the kind to match too.
 *
 * Denials are 403, never 401: the actor IS authenticated, and cookie clients
 * read a 401 as "session expired" and log the user out - so a stale link or an
 * IDOR probe would sign a legitimate user out instead of showing an error.
 */
export function assertSelfOrAdmin(actor, targetUserId, message) {
  const actorId = parseInt(actor?.id?.toString() || "0");
  const isSelf = actor?.kind === "USER" && targetUserId === actorId;
  // Both branches key off `kind` (the authoritative principal-table marker),
  // not `role`, so the admin check can't be satisfied by a spoofed role claim.
  if (!isSelf && actor?.kind !== "ADMIN") {
    throw new ForbiddenError(message);
  }
}

/**
 * Admin self-service mutations (profile, picture): an ADMIN may only touch
 * their own Admin row - peers are managed through the dedicated admin
 * management endpoints, not impersonated through profile updates.
 */
export function assertSelfAdmin(actor, targetAdminId, message) {
  const actorId = parseInt(actor?.id?.toString() || "0");
  if (actor?.kind !== "ADMIN" || actorId !== targetAdminId) {
    throw new ForbiddenError(message);
  }
}

/** Endpoints that only make sense for attendants (check-in, face data). */
export function assertAttendant(actor, message = "Only attendants can perform this action.") {
  if (actor?.kind !== "USER") {
    throw new ForbiddenError(message);
  }
}
