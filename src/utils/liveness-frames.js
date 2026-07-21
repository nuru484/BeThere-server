// src/utils/liveness-frames.js
//
// Shared frame-count guard for the multipart liveness capture uploads
// (enrollment, check-in, check-out). Takes the parsed files array, not the
// request, so it stays free of Express types.
import { LIVENESS } from "../config/constants.js";
import { ValidationError } from "../middleware/error-handler.js";

/** Validates the uploaded frame count and returns the frame buffers. */
export function framesOrThrow(files) {
  const uploaded = files ?? [];
  if (
    uploaded.length < LIVENESS.MIN_FRAMES ||
    uploaded.length > LIVENESS.MAX_FRAMES
  ) {
    throw new ValidationError(
      `Please capture between ${LIVENESS.MIN_FRAMES} and ${LIVENESS.MAX_FRAMES} frames.`
    );
  }
  return uploaded.map((file) => file.buffer);
}

/**
 * Frame-count guard for ONE step of the step-by-step flow (a single action's
 * dense burst) - fewer frames than a full batch.
 */
export function stepFramesOrThrow(files) {
  const uploaded = files ?? [];
  if (
    uploaded.length < LIVENESS.MIN_STEP_FRAMES ||
    uploaded.length > LIVENESS.MAX_STEP_FRAMES
  ) {
    throw new ValidationError(
      `Please capture between ${LIVENESS.MIN_STEP_FRAMES} and ${LIVENESS.MAX_STEP_FRAMES} frames for this step.`
    );
  }
  return uploaded.map((file) => file.buffer);
}
