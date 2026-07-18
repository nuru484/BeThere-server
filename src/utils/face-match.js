// src/utils/face-match.js

/**
 * face-api's default matcher threshold: two descriptors of the same person
 * are typically within 0.6 euclidean distance. Matches the client's capture
 * config so enrollment and verification agree.
 */
export const FACE_MATCH_THRESHOLD = 0.6;

/** True when `value` looks like a face-api descriptor (128 finite numbers). */
export function isFaceDescriptor(value) {
  return (
    Array.isArray(value) &&
    value.length === 128 &&
    value.every((n) => typeof n === "number" && Number.isFinite(n))
  );
}

/** Euclidean distance between two equal-length descriptors. */
export function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * Server-side face verification: the stored enrollment descriptor vs the
 * descriptor captured at check-in. Comparing HERE (not in the browser) is
 * what makes the check trustworthy - a client that skips the camera can no
 * longer fake a match, and the enrolled descriptor never has to be sent out.
 */
export function faceMatches(stored, captured, threshold = FACE_MATCH_THRESHOLD) {
  if (!isFaceDescriptor(stored) || !isFaceDescriptor(captured)) return false;
  return euclideanDistance(stored, captured) <= threshold;
}
