// src/services/liveness/liveness-verifier.js
//
// The swap seam. Everything upstream depends on this interface, never on
// face-api directly, so replacing the self-hosted engine with a certified
// vendor (AWS Rekognition Face Liveness, FaceTec, ...) is a one-file change:
// add a verifier with the same verify() shape and select it here.
//
//   verify({ frameBuffers, enrolledDescriptor, actions })
//     -> { passed, score, matchDistance, reasons, failedActions, replaySuspected, disabled? }
import crypto from "node:crypto";
import ENV from "../../config/env.js";
import { evaluateEnrollment, evaluateLiveness } from "./evaluate.js";

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

/**
 * ENROLLMENT runs the same engine but has no template to match against: it
 * proves the capture is live and self-consistent, then derives the template
 * from the frames. Keeping it behind the same seam means a certified vendor
 * replaces enrollment and verification together.
 */
const faceApiEnroller = {
  async enroll({ frameBuffers, actions }) {
    const { analyzeFrames } = await import("../../lib/face-engine.js");
    const frames = await analyzeFrames(frameBuffers);
    return evaluateEnrollment(frames, actions, ENV.FACE_MATCH_THRESHOLD);
  },
};

/**
 * No-op enroller for local/test runs without the ML models. It still has to
 * yield a template, so it derives a deterministic pseudo-descriptor from the
 * user id: stable across re-runs and DIFFERENT per user, so a disabled dev
 * environment cannot collapse every account onto one shared template. Never
 * reachable in production - env.js refuses to boot with LIVENESS_ENABLED=false
 * there.
 */
const disabledEnroller = {
  async enroll({ userId }) {
    const seed = crypto
      .createHash("sha256")
      .update(`liveness-disabled-enrollment:${userId}`)
      .digest();
    const descriptor = Array.from({ length: 128 }, (_, i) =>
      Number(((seed[i % seed.length] / 255) * 0.4).toFixed(6))
    );
    return {
      passed: true,
      reasons: ["liveness_disabled"],
      failedActions: [],
      descriptor,
      disabled: true,
    };
  },
};

// Test-only overrides so the liveness FAILURE branch (evidence + anomaly +
// audit writes) and enrollment can be exercised without real ML. Honored only
// under NODE_ENV=test so they can never affect a real deployment.
let testOverride = null;
export function setLivenessVerifierForTest(verifier) {
  testOverride = verifier;
}

let enrollmentTestOverride = null;
export function setEnrollmentVerifierForTest(verifier) {
  enrollmentTestOverride = verifier;
}

/** Selects the active verifier from configuration. */
export function getLivenessVerifier() {
  if (testOverride && ENV.NODE_ENV === "test") return testOverride;
  return ENV.LIVENESS_ENABLED ? faceApiVerifier : disabledVerifier;
}

/** Selects the active enroller from configuration. */
export function getEnrollmentVerifier() {
  if (enrollmentTestOverride && ENV.NODE_ENV === "test") {
    return enrollmentTestOverride;
  }
  return ENV.LIVENESS_ENABLED ? faceApiEnroller : disabledEnroller;
}
