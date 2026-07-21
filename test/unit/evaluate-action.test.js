// test/unit/evaluate-action.test.js
//
// The step-by-step liveness DECISION (one action per upload), tested with
// fabricated per-frame signals - no camera, ML, or database. Covers the
// per-step identity, action-proof, and two-turn-reversal logic.
import { describe, expect, it } from "vitest";
import {
  evaluateAction,
  finalizeEnrollment,
} from "../../src/services/liveness/evaluate.js";

const ENROLLED = Array.from({ length: 128 }, () => 0.1);
const near = (delta) => ENROLLED.map((v) => v + delta);
const FAR = ENROLLED.map((v) => v + 0.2); // ~2.26: a different face

let seq = 0;
const frame = (over = {}) => ({
  descriptor: near(0.04 + (seq++ % 7) * 0.0005),
  yaw: 2,
  ear: 0.3,
  happy: 0.1,
  score: 0.9,
  ...over,
});

// A dense per-step blink burst: eyes open, a dip, then reopen.
const blinkStep = () => [
  frame({ ear: 0.3 }),
  frame({ ear: 0.12 }),
  frame({ ear: 0.31 }),
  frame({ ear: 0.3 }),
];

const turnStep = (sign = 1) => [
  frame({ yaw: 2 * sign }),
  frame({ yaw: 20 * sign }),
  frame({ yaw: 22 * sign }),
  frame({ yaw: 4 * sign }),
];

const smileStep = () => [
  frame({ happy: 0.1 }),
  frame({ happy: 0.85 }),
  frame({ happy: 0.9 }),
  frame({ happy: 0.88 }),
];

describe("evaluateAction (check-in, identity vs enrolled)", () => {
  it("passes a genuine blink step for the enrolled person", () => {
    const v = evaluateAction(blinkStep(), "BLINK", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.reasons).toEqual([]);
    expect(v.passed).toBe(true);
  });

  it("passes a genuine smile step", () => {
    const v = evaluateAction(smileStep(), "SMILE", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(true);
  });

  it("passes a turn step and reports its sign", () => {
    const v = evaluateAction(turnStep(1), "TURN_LEFT", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(true);
    expect(v.turnSign).toBe(1);
  });

  it("fails when the action is not performed", () => {
    // A blink step where the eyes never close.
    const frames = [
      frame({ ear: 0.3 }),
      frame({ ear: 0.31 }),
      frame({ ear: 0.3 }),
      frame({ ear: 0.29 }),
    ];
    const v = evaluateAction(frames, "BLINK", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("action_not_satisfied");
  });

  it("rejects a step performed by a different person", () => {
    const frames = blinkStep().map((f) => ({ ...f, descriptor: FAR }));
    const v = evaluateAction(frames, "BLINK", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("identity_mismatch");
  });

  it("requires the second turn to reverse the first", () => {
    // First turn was sign +1; a second +1 turn is not a reversal.
    const v = evaluateAction(turnStep(1), "TURN_RIGHT", {
      enrolled: ENROLLED,
      firstTurnSign: 1,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("action_not_satisfied");
  });

  it("accepts the second turn when it reverses the first", () => {
    const v = evaluateAction(turnStep(-1), "TURN_RIGHT", {
      enrolled: ENROLLED,
      firstTurnSign: 1,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(true);
    expect(v.turnSign).toBe(-1);
  });

  it("rejects a held photo at an angle for a turn step (no excursion)", () => {
    const frames = Array.from({ length: 5 }, (_, i) => ({
      descriptor: near(0.04 + i * 0.0006),
      yaw: 25, // fixed angle, no range
      ear: 0.3,
      happy: 0.1,
      score: 0.9,
    }));
    const v = evaluateAction(frames, "TURN_LEFT", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("action_not_satisfied");
  });

  it("fails with too few usable frames", () => {
    const v = evaluateAction([frame(), frame()], "BLINK", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("insufficient_usable_frames");
  });

  it("accepts a blink whose closed frame is the LAST frame (no captured reopen)", () => {
    // The dip alone proves the blink; requiring a reopen frame strictly after it
    // used to drop a blink performed at the end of the capture window.
    const frames = [
      frame({ ear: 0.3 }),
      frame({ ear: 0.3 }),
      frame({ ear: 0.31 }),
      frame({ ear: 0.11 }), // closed on the final frame
    ];
    const v = evaluateAction(frames, "BLINK", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.reasons).not.toContain("action_not_satisfied");
    expect(v.passed).toBe(true);
  });

  it("reports PII-safe signal aggregates on a failed step (no descriptors)", () => {
    const frames = [
      frame({ ear: 0.3 }),
      frame({ ear: 0.31 }),
      frame({ ear: 0.3 }),
      frame({ ear: 0.29 }), // never closes
    ];
    const v = evaluateAction(frames, "BLINK", {
      enrolled: ENROLLED,
      matchThreshold: 0.6,
    });
    expect(v.passed).toBe(false);
    expect(v.signals).toMatchObject({ frames: 4 });
    expect(typeof v.signals.earMin).toBe("number");
    expect(v.signals).not.toHaveProperty("descriptor");
  });
});

describe("evaluateAction (enrollment, identity vs reference)", () => {
  it("passes step 0 with no enrolled template and returns a descriptor", () => {
    const v = evaluateAction(blinkStep(), "BLINK", { matchThreshold: 0.6 });
    expect(v.passed).toBe(true);
    expect(v.descriptor).toHaveLength(128);
  });

  it("rejects a later step by a different person than step 0", () => {
    const reference = near(0.04);
    const frames = smileStep().map((f) => ({ ...f, descriptor: FAR }));
    const v = evaluateAction(frames, "SMILE", { reference, matchThreshold: 0.6 });
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("identity_mismatch");
  });
});

describe("finalizeEnrollment", () => {
  it("derives a template from consistent step descriptors", () => {
    const descriptors = [near(0.04), near(0.041), near(0.039)];
    const v = finalizeEnrollment(descriptors, 0.6);
    expect(v.passed).toBe(true);
    expect(v.descriptor).toHaveLength(128);
  });

  it("rejects step descriptors that do not cluster (mixed people)", () => {
    const descriptors = [near(0.04), FAR, near(0.041)];
    const v = finalizeEnrollment(descriptors, 0.6);
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("inconsistent_identity");
  });
});
