// src/utils/biometric-crypto.js
//
// Authenticated encryption for enrolled face templates at rest (AES-256-GCM).
// A DB dump must not leak biometrics, so the 128-float descriptor is stored
// only as ciphertext and decrypted in memory at match time. The wire format is
// three base64 segments joined by ":" - "iv:tag:ciphertext" - versioned by a
// leading "v1:" so the scheme can evolve without ambiguity.
import crypto from "node:crypto";
import ENV from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length
const VERSION = "v1";

/**
 * Resolves the configured key to exactly 32 bytes. Accepts a 64-char hex or a
 * base64 string; anything that does not decode to 32 bytes fails at first use
 * (a weak/short biometric key is a misconfiguration, not a runtime fallback).
 */
function resolveKey() {
  const raw = ENV.FACE_TEMPLATE_ENC_KEY;
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else {
    key = Buffer.from(raw, "base64");
  }
  if (key.length !== 32) {
    throw new Error(
      "FACE_TEMPLATE_ENC_KEY must decode to 32 bytes (use `openssl rand -hex 32`)."
    );
  }
  return key;
}

/** Encrypts a JSON-serializable value (the descriptor array) to the wire string. */
export function encryptTemplate(value) {
  const key = resolveKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a wire string back to the original value. Throws on tamper (the GCM
 * tag fails), on a malformed payload, or on an unknown version - a corrupt
 * template must never silently read as a partial match.
 */
export function decryptTemplate(payload) {
  if (typeof payload !== "string") {
    throw new Error("Encrypted template must be a string.");
  }
  const parts = payload.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("Malformed or unsupported encrypted template.");
  }
  const [, ivB64, tagB64, ctB64] = parts;
  const key = resolveKey();
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64")
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}
