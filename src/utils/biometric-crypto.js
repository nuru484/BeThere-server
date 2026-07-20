// src/utils/biometric-crypto.js
//
// Authenticated encryption for enrolled face templates at rest (AES-256-GCM).
// A DB dump must not leak biometrics, so the 128-float descriptor is stored
// only as ciphertext and decrypted in memory at match time.
//
// Two wire formats coexist:
//   v2:keyId:iv:tag:ciphertext   (current) - key id + per-owner AAD binding
//   v1:iv:tag:ciphertext         (legacy)  - single key, no AAD
// all segments base64 except the scheme/key-id tokens.
//
// Two properties beyond plain confidentiality:
//   1. OWNER BINDING (AAD). The owning user id is fed to GCM as additional
//      authenticated data, so a ciphertext copied into another user's row
//      (SQLi, a restored backup, a rogue DBA) fails the tag check instead of
//      silently authenticating that attacker's check-ins against the victim's
//      face. v1 rows predate this and carry no AAD.
//   2. KEY ROTATION. The key id travels in the payload, and the keyring
//      (ENV.FACE_TEMPLATE_ENC_KEYS) can hold several keys, so the active
//      encryption key can be rotated while every old template still decrypts
//      under the key it was written with - no mass re-enrollment.
import crypto from "node:crypto";
import ENV from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM standard nonce length.
const V1 = "v1"; // Legacy: no key id, no AAD.
const V2 = "v2"; // Current: key id + owner AAD.

/** The 32-byte key registered under `id`, or a descriptive throw. */
function keyById(id) {
  const key = ENV.FACE_TEMPLATE_ENC_KEYS.get(id);
  if (!key) {
    throw new Error(
      `No biometric encryption key configured for id "${id}". ` +
        `Keep the key in FACE_TEMPLATE_ENC_KEYS to read templates written with it.`
    );
  }
  return key;
}

/**
 * The additional authenticated data that binds a ciphertext to its owner. A
 * missing user id is a programming error (every call site has the owner), so
 * it throws rather than encrypting an unbound template.
 */
function aadFor(userId) {
  if (userId === undefined || userId === null || String(userId).length === 0) {
    throw new Error(
      "A userId is required to encrypt/decrypt a face template (owner AAD binding)."
    );
  }
  return Buffer.from(`user:${userId}`, "utf8");
}

/**
 * Encrypts a JSON-serializable value (the descriptor array) for a specific
 * owner. Always writes the current v2 format under the active key.
 */
export function encryptTemplate(value, { userId } = {}) {
  const aad = aadFor(userId);
  const keyId = ENV.FACE_TEMPLATE_ENC_ACTIVE_KEY_ID;
  const key = keyById(keyId);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(aad);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    V2,
    keyId,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypts a wire string back to the original value. Throws on tamper (the GCM
 * tag fails, including an owner-mismatch when v2 AAD does not match), on a
 * malformed payload, or on an unknown scheme/key - a corrupt template must
 * never silently read as a partial match.
 */
export function decryptTemplate(payload, { userId } = {}) {
  if (typeof payload !== "string") {
    throw new Error("Encrypted template must be a string.");
  }
  const parts = payload.split(":");
  const scheme = parts[0];

  let key;
  let ivB64;
  let tagB64;
  let ctB64;
  let aad = null;

  if (scheme === V2) {
    if (parts.length !== 5) {
      throw new Error("Malformed encrypted template (v2).");
    }
    const [, keyId, iv, tag, ct] = parts;
    key = keyById(keyId);
    ivB64 = iv;
    tagB64 = tag;
    ctB64 = ct;
    // v2 is owner-bound; the AAD must match the id used at encryption time.
    aad = aadFor(userId);
  } else if (scheme === V1) {
    // Pre-keyring ciphertext: no key id (uses the v1 key), no AAD. New writes
    // are always v2, so this path only reads templates enrolled before the
    // upgrade; a backfill can re-encrypt them to v2 lazily.
    if (parts.length !== 4) {
      throw new Error("Malformed encrypted template (v1).");
    }
    const [, iv, tag, ct] = parts;
    key = keyById(V1);
    ivB64 = iv;
    tagB64 = tag;
    ctB64 = ct;
  } else {
    throw new Error("Malformed or unsupported encrypted template.");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(ivB64, "base64")
  );
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}
