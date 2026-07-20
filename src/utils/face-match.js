// src/utils/face-match.js
//
// Descriptor primitives used by the server-side liveness evaluator. The match
// threshold itself lives in ENV.FACE_MATCH_THRESHOLD (config, not here).

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

