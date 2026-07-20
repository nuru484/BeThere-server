// src/services/attendance-evidence.service.js
//
// Retains captured frames ONLY for flagged/anomalous attempts (data
// minimization - a normal check-in stores no images). Frames go to Cloudinary
// under a dedicated folder; expiresAt drives the retention purge that deletes
// both the DB row and the remote assets.
import { prisma } from "../config/prisma-client.js";
import { deleteImage, uploadImage } from "../utils/cloudinary.js";
import logger from "../utils/logger.js";
import { EVIDENCE_RETENTION_DAYS } from "../config/constants.js";

const EVIDENCE_FOLDER = "bethere/evidence";

/**
 * Stores up to a few evidence frames for a flagged attempt and returns the
 * evidence row. Best-effort per frame; a failed upload is skipped, not fatal.
 */
export async function storeEvidence({
  userId,
  eventId,
  attendanceId = null,
  frameBuffers,
  livenessScore = null,
  matchDistance = null,
  reason = null,
}) {
  // Cap the retained frames: a couple of key frames are enough to review.
  const buffers = frameBuffers.slice(0, 3);
  const frameUrls = [];
  for (const buffer of buffers) {
    try {
      frameUrls.push(await uploadImage(buffer, { folder: EVIDENCE_FOLDER }));
    } catch (error) {
      logger.error(error, "Failed to upload evidence frame");
    }
  }

  const expiresAt = new Date(
    Date.now() + EVIDENCE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  return prisma.attendanceEvidence.create({
    data: {
      userId,
      eventId,
      attendanceId,
      frameUrls,
      livenessScore,
      matchDistance,
      reason,
      expiresAt,
    },
  });
}

/**
 * Retention: deletes evidence past its expiry, destroying the Cloudinary
 * assets first (best-effort) so no orphaned biometrics linger remotely.
 */
export async function purgeExpiredEvidence() {
  const expired = await prisma.attendanceEvidence.findMany({
    where: { expiresAt: { lt: new Date() } },
    select: { id: true, frameUrls: true },
  });

  for (const row of expired) {
    const urls = Array.isArray(row.frameUrls) ? row.frameUrls : [];
    await Promise.all(urls.map((url) => deleteImage(url)));
  }

  const { count } = await prisma.attendanceEvidence.deleteMany({
    where: { id: { in: expired.map((r) => r.id) } },
  });
  return count;
}
