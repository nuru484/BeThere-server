// src/utils/authorization.js
//
// Owner-or-admin gate shared by the services that expose per-user
// resources (profiles, attendance, face scans). The actor is the
// authenticated principal from the JWT ({ id, role }).
import { UnauthorizedError } from "../middleware/error-handler.js";

/**
 * Allows the actor to touch their own resource; anyone else's requires the
 * ADMIN role. Throws the caller-supplied message so each surface keeps its
 * exact wording.
 */
export function assertSelfOrAdmin(actor, targetUserId, message) {
  const actorId = parseInt(actor?.id?.toString() || "0");
  if (targetUserId !== actorId && actor?.role !== "ADMIN") {
    throw new UnauthorizedError(message);
  }
}
