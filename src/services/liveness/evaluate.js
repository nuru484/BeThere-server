// src/services/liveness/evaluate.js
//
// The liveness DECISION, kept pure and dependency-free (plain numbers in, a
// verdict out) so it is unit-testable without the ML engine, a camera, or a
// database. The engine (lib/face-engine.js) turns frames into the per-frame
// signals this consumes; swapping the engine (e.g. for AWS) does not touch
// this logic.
import { euclideanDistance } from "../../utils/face-match.js";
import { LIVENESS } from "../../config/constants.js";

/**
 * @param {Array<{descriptor:number[],yaw:number,ear:number,happy:number,score:number}>} frames
 * @param {number[]} enrolled - the enrolled 128-float descriptor
 * @param {string[]} actions - the challenge action codes to prove
 * @param {number} matchThreshold - max euclidean distance for an identity match
 * @returns verdict { passed, score, matchDistance, reasons, failedActions, replaySuspected }
 */
export function evaluateLiveness(frames, enrolled, actions, matchThreshold) {
  const reasons = [];
  const failedActions = [];

  if (frames.length < LIVENESS.MIN_FRAMES) {
    return {
      passed: false,
      score: 0,
      matchDistance: null,
      reasons: ["insufficient_usable_frames"],
      failedActions: actions,
      replaySuspected: false,
    };
  }

  // --- Identity: distance of every usable frame to the enrolled template. ---
  const distances = frames.map((f) => euclideanDistance(f.descriptor, enrolled));
  const matchDistance = Math.min(...distances);

  // A perfect (near-zero) match is not a live capture - it is the stored
  // template replayed back. Real second captures always vary a little.
  const replaySuspected = matchDistance <= LIVENESS.REPLAY_MIN_DISTANCE;
  if (replaySuspected) reasons.push("replay_suspected");

  const matchingFrames = distances.filter((d) => d <= matchThreshold).length;
  // Most frames must be the enrolled person, not one lucky frame in a crowd.
  if (matchingFrames / frames.length < 0.6) {
    reasons.push("identity_mismatch");
  }
  // A frame that is a clearly different face mid-sequence means a swap.
  if (distances.some((d) => d > LIVENESS.CONTINUITY_MAX_DISTANCE)) {
    reasons.push("identity_discontinuity");
  }

  // --- Active liveness: prove each requested action from the frames. ---
  const yaws = frames.map((f) => f.yaw);
  const ears = frames.map((f) => f.ear);
  const happies = frames.map((f) => f.happy);

  const turnFrames = yaws.filter((y) => Math.abs(y) >= LIVENESS.YAW_TURN_DEGREES);
  const turnsRequested = actions.filter(
    (a) => a === "TURN_LEFT" || a === "TURN_RIGHT"
  ).length;

  for (const action of actions) {
    if (action === "BLINK") {
      const closed = Math.min(...ears) < LIVENESS.EYE_CLOSED_EAR;
      const opened = Math.max(...ears) > LIVENESS.EYE_CLOSED_EAR * 1.5;
      if (!(closed && opened)) failedActions.push("BLINK");
    } else if (action === "SMILE") {
      if (Math.max(...happies) < LIVENESS.SMILE_PROBABILITY) {
        failedActions.push("SMILE");
      }
    }
    // TURN_LEFT/TURN_RIGHT are handled together below (sign is not bound to the
    // label because front cameras mirror inconsistently).
  }

  if (turnsRequested >= 2) {
    // Two turns must go opposite ways: proves genuine head movement.
    const hasPositive = turnFrames.some((y) => y > 0);
    const hasNegative = turnFrames.some((y) => y < 0);
    if (!(hasPositive && hasNegative)) {
      failedActions.push("TURN_LEFT", "TURN_RIGHT");
    }
  } else if (turnsRequested === 1) {
    if (turnFrames.length === 0) {
      const label = actions.find((a) => a === "TURN_LEFT" || a === "TURN_RIGHT");
      failedActions.push(label);
    }
  }

  if (failedActions.length > 0) reasons.push("action_not_satisfied");

  const passed = reasons.length === 0;

  // Confidence: identity margin below threshold blended with the share of
  // actions satisfied and mean detection score. Only meaningful when passed.
  const satisfiedRatio =
    (actions.length - new Set(failedActions).size) / Math.max(actions.length, 1);
  const identityMargin = Math.max(
    0,
    Math.min(1, (matchThreshold - matchDistance) / matchThreshold)
  );
  const meanScore =
    frames.reduce((sum, f) => sum + (f.score ?? 0), 0) / frames.length;
  const score = passed
    ? Number(
        (0.5 * identityMargin + 0.35 * satisfiedRatio + 0.15 * meanScore).toFixed(
          3
        )
      )
    : 0;

  return {
    passed,
    score,
    matchDistance,
    reasons,
    failedActions: [...new Set(failedActions)],
    replaySuspected,
  };
}
