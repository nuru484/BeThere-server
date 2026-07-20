// test/unit/evaluate.test.js
//
// The liveness DECISION, tested directly with fabricated per-frame signals so
// the security logic is covered without a camera, ML models, or a database.
import { describe, expect, it } from "vitest";
import { evaluateLiveness } from "../../src/services/liveness/evaluate.js";

const ENROLLED = Array.from({ length: 128 }, () => 0.1);
const near = (delta) => ENROLLED.map((v) => v + delta);
const NEAR = near(0.04); // ~0.45 euclidean: a match, not a replay
const FAR = ENROLLED.map((v) => v + 0.2); // ~2.26: a different face

const frame = (over = {}) => ({
  descriptor: NEAR,
  yaw: 2,
  ear: 0.35,
  happy: 0.1,
  score: 0.9,
  ...over,
});

// A sequence that satisfies TURN + BLINK + SMILE for the enrolled person.
const goodFrames = () => [
  frame({ yaw: 25 }), // a turn
  frame({ ear: 0.1 }), // blink low point
  frame({ happy: 0.9 }), // smile + eyes open
  frame(),
  frame(),
  frame(),
];

const ACTIONS = ["TURN_LEFT", "BLINK", "SMILE"];

describe("evaluateLiveness", () => {
  it("passes a live, matching, action-satisfying sequence", () => {
    const v = evaluateLiveness(goodFrames(), ENROLLED, ACTIONS, 0.6);
    expect(v.passed).toBe(true);
    expect(v.reasons).toEqual([]);
    expect(v.score).toBeGreaterThan(0);
  });

  it("blocks an exact replay of the enrolled template", () => {
    const frames = goodFrames().map((f) => ({ ...f, descriptor: ENROLLED }));
    const v = evaluateLiveness(frames, ENROLLED, ACTIONS, 0.6);
    expect(v.passed).toBe(false);
    expect(v.replaySuspected).toBe(true);
    expect(v.reasons).toContain("replay_suspected");
  });

  it("blocks a different person (identity mismatch)", () => {
    const frames = goodFrames().map((f) => ({ ...f, descriptor: FAR }));
    const v = evaluateLiveness(frames, ENROLLED, ACTIONS, 0.6);
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("identity_mismatch");
  });

  it("flags a mid-sequence face swap as discontinuity", () => {
    const frames = goodFrames();
    frames[3] = frame({ descriptor: FAR }); // one clearly different face
    const v = evaluateLiveness(frames, ENROLLED, ACTIONS, 0.6);
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("identity_discontinuity");
  });

  it("fails when a required action is not performed (no smile)", () => {
    const frames = goodFrames().map((f) => ({ ...f, happy: 0.1 }));
    const v = evaluateLiveness(frames, ENROLLED, ACTIONS, 0.6);
    expect(v.passed).toBe(false);
    expect(v.failedActions).toContain("SMILE");
    expect(v.reasons).toContain("action_not_satisfied");
  });

  it("requires two opposite turns when both are challenged", () => {
    // Only positive-yaw turns present; TURN_LEFT+TURN_RIGHT needs both signs.
    const frames = goodFrames().map((f) => ({ ...f, yaw: 25, ear: 0.35, happy: 0.9 }));
    const v = evaluateLiveness(frames, ENROLLED, ["TURN_LEFT", "TURN_RIGHT"], 0.6);
    expect(v.passed).toBe(false);
    expect(v.failedActions).toEqual(
      expect.arrayContaining(["TURN_LEFT", "TURN_RIGHT"])
    );
  });

  it("fails with too few usable frames", () => {
    const v = evaluateLiveness([frame(), frame()], ENROLLED, ACTIONS, 0.6);
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("insufficient_usable_frames");
  });
});
