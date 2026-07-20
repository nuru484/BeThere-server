// src/services/liveness/liveness-verifier.js
//
// The swap seam. Everything upstream depends on this interface, never on
// face-api directly, so replacing the self-hosted engine with a certified
// vendor (AWS Rekognition Face Liveness, FaceTec, ...) is a one-file change:
// add a verifier with the same verify() shape and select it here.
//
//   verify({ frameBuffers, enrolledDescriptor, actions })
//     -> { passed, score, matchDistance, reasons, failedActions, replaySuspected, disabled? }
import ENV from "../../config/env.js";
import { evaluateLiveness } from "./evaluate.js";

/**
 * Self-hosted verifier: runs the face engine over the raw frames, then applies
 * the pure decision logic against the enrolled template. The engine (and the
 * heavy tfjs/WASM stack it loads) is imported lazily, so a process that never
 * verifies a check-in - the worker, the test suite, a disabled deployment -
 * never pays that memory cost.
 */
const faceApiVerifier = {
  async verify({ frameBuffers, enrolledDescriptor, actions }) {
    const { analyzeFrames } = await import("../../lib/face-engine.js");
    const frames = await analyzeFrames(frameBuffers);
    return evaluateLiveness(
      frames,
      enrolledDescriptor,
      actions,
      ENV.FACE_MATCH_THRESHOLD
    );
  },
};

/**
 * No-op verifier for test/dev (LIVENESS_ENABLED=false), mirroring how the rate
 * limiters skip in test env. It passes without touching the ML models; the
 * decision logic itself is covered directly by unit tests on evaluateLiveness.
 */
const disabledVerifier = {
  async verify() {
    return {
      passed: true,
      score: null,
      matchDistance: null,
      reasons: ["liveness_disabled"],
      failedActions: [],
      replaySuspected: false,
      disabled: true,
    };
  },
};

/** Selects the active verifier from configuration. */
export function getLivenessVerifier() {
  return ENV.LIVENESS_ENABLED ? faceApiVerifier : disabledVerifier;
}
