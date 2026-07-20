export const BCRYPT_SALT_ROUNDS = 10;

export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

// The current biometric-consent policy version. Bump when the consent notice
// materially changes so stored consents below this version force re-consent.
export const BIOMETRIC_CONSENT_VERSION = "2026-07-v1";

// Liveness capture + verification tuning. Actions are the randomized
// challenge steps; the client prompts the user through them and the server
// re-proves each from the uploaded frames.
export const LIVENESS = {
  // Actions the server may draw a challenge from. Each maps to a check the
  // face engine can prove from landmarks/expressions.
  ACTIONS: ["TURN_LEFT", "TURN_RIGHT", "BLINK", "SMILE"],
  // How many actions make up one challenge (drawn without repetition).
  ACTIONS_PER_CHALLENGE: 3,
  // Challenge lifetime; short so a leaked token is near-useless.
  CHALLENGE_TTL_MS: 60 * 1000,
  // Frame bounds for one capture upload.
  MIN_FRAMES: 6,
  MAX_FRAMES: 16,
  // Head-yaw magnitude (degrees) that counts as a deliberate turn.
  YAW_TURN_DEGREES: 18,
  // Eye-aspect-ratio below this reads as a closed eye (blink low point).
  EYE_CLOSED_EAR: 0.19,
  // Expression-net probability above this reads as a smile.
  SMILE_PROBABILITY: 0.6,
  // A captured-vs-enrolled distance at/under this is a replayed template, not
  // a live face - a real second capture is never a perfect duplicate.
  REPLAY_MIN_DISTANCE: 0.02,
  // A frame farther than this from the enrolled template is a clearly
  // DIFFERENT face (a mid-sequence swap), not just a poor match. Must sit
  // above the match threshold: two people's descriptors are typically ~1.0+
  // apart, the same person's well under the 0.6 match line.
  CONTINUITY_MAX_DISTANCE: 1.0,
};

// Rotating venue code (proof of on-site presence). Codes are stateless keyed
// hashes of the event secret + the current time window, so nothing polls or
// writes the database to rotate them - the venue display fetches a batch and
// cycles locally, and validation just recomputes the current window's code.
export const VENUE_CODE = {
  // Rotation period. Short enough that a screenshotted code is stale fast.
  PERIOD_MS: 30 * 1000,
  // Windows either side of "now" still accepted, absorbing clock skew between
  // the venue display and the server (each window is one PERIOD_MS).
  SKEW_WINDOWS: 1,
  // Hex characters of the HMAC kept as the code (64 bits: unguessable in a
  // 30s window, still small enough to render as a crisp QR).
  CODE_HEX_LENGTH: 16,
  // How many upcoming codes the display fetches per batch (10 min at 30s).
  BATCH_SIZE: 20,
};

// How long retained evidence frames live before the retention job purges them.
export const EVIDENCE_RETENTION_DAYS = 30;
// Dormant enrolled templates are purged after this many days without a
// check-in (biometric data minimization).
export const TEMPLATE_DORMANT_DAYS = 365;
