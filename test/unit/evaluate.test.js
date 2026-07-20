// test/unit/evaluate.test.js
//
// The liveness DECISION, tested directly with fabricated per-frame signals so
// the security logic is covered without a camera, ML models, or a database.
import { describe, expect, it } from "vitest";
import { evaluateLiveness } from "../../src/services/liveness/evaluate.js";

const ENROLLED = Array.from({ length: 128 }, () => 0.1);
const near = (delta) => ENROLLED.map((v) => v + delta);
const FAR = ENROLLED.map((v) => v + 0.2); // ~2.26: a different face

// Real captures are never byte-identical, so every fabricated frame gets its
// own slight variation (still comfortably a match, still well clear of the
// exact-replay floor). A burst of identical descriptors is treated as a
// re-sent still, which is exercised deliberately below.
let frameSeq = 0;
const frame = (over = {}) => ({
  descriptor: near(0.04 + (frameSeq++ % 7) * 0.0005),
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
    // Only positive-yaw turns present; the second turn must reverse the first.
    const frames = goodFrames().map((f) => ({ ...f, yaw: 25, ear: 0.35, happy: 0.9 }));
    const v = evaluateLiveness(frames, ENROLLED, ["TURN_LEFT", "TURN_RIGHT"], 0.6);
    expect(v.passed).toBe(false);
    // The first turn is genuinely proven; only the reversal is missing.
    expect(v.failedActions).toEqual(expect.arrayContaining(["TURN_RIGHT"]));
    expect(v.reasons).toContain("action_not_satisfied");
  });

  it("rejects the right actions performed in the WRONG order", () => {
    // Every signal the challenge asks for is present somewhere in the burst,
    // just not in the challenged sequence. The old set-wise check passed this,
    // which is what let one fixed kit of stills satisfy any challenge draw.
    const frames = [
      frame({ happy: 0.9 }), // smiled first
      frame({ ear: 0.1 }), // then blinked
      frame(),
      frame({ yaw: 25 }), // turned last
      frame(),
      frame(),
    ];
    const v = evaluateLiveness(frames, ENROLLED, ACTIONS, 0.6);

    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("action_not_satisfied");
  });

  it("accepts the same actions when performed in the challenged order", () => {
    const frames = [
      frame({ yaw: 25 }),
      frame({ ear: 0.1 }),
      frame(),
      frame({ happy: 0.9 }),
      frame(),
      frame(),
    ];
    const v = evaluateLiveness(frames, ENROLLED, ACTIONS, 0.6);

    expect(v.passed).toBe(true);
    expect(v.reasons).toEqual([]);
  });

  it("rejects a burst that is mostly one repeated still", () => {
    const still = frame({ yaw: 25, ear: 0.1, happy: 0.9 });
    const frames = [still, { ...still }, { ...still }, { ...still }, frame(), frame()];
    const v = evaluateLiveness(frames, ENROLLED, ACTIONS, 0.6);

    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("duplicate_frames");
  });

  it("tolerates a single duplicated frame from a stalled camera", () => {
    const frames = goodFrames();
    frames[5] = { ...frames[4] }; // one repeat, the rest genuine
    const v = evaluateLiveness(frames, ENROLLED, ACTIONS, 0.6);

    expect(v.reasons).not.toContain("duplicate_frames");
  });

  it("fails with too few usable frames", () => {
    const v = evaluateLiveness([frame(), frame()], ENROLLED, ACTIONS, 0.6);
    expect(v.passed).toBe(false);
    expect(v.reasons).toContain("insufficient_usable_frames");
  });
});
