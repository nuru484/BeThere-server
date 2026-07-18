// src/utils/authorization.js
//
// Authorization gates shared by the services. The actor is the
// authenticated principal from the JWT ({ id, kind, role }).
import { ForbiddenError, UnauthorizedError } from "../middleware/error-handler.js";

/**
 * Allows an ATTENDANT actor to touch their own resource; anyone else's
 * requires the ADMIN kind. Admins and attendants live in separate tables
 * with overlapping ids, so "self" requires the kind to match too.
 */
export function assertSelfOrAdmin(actor, targetUserId, message) {
  const actorId = parseInt(actor?.id?.toString() || "0");
  const isSelf = actor?.kind === "USER" && targetUserId === actorId;
  if (!isSelf && actor?.role !== "ADMIN") {
    throw new UnauthorizedError(message);
  }
}

/** Endpoints that only make sense for attendants (check-in, face data). */
export function assertAttendant(actor, message = "Only attendants can perform this action.") {
  if (actor?.kind !== "USER") {
    throw new ForbiddenError(message);
  }
}
