// test/unit/biometric-crypto.test.js
//
// The at-rest template encryption: a round-trip must recover the descriptor,
// each encryption must differ (random IV), any tamper must be rejected rather
// than silently decrypt to a partial value, and the ciphertext must be bound
// to its owner (a template moved to another user's row must fail the tag).
import { describe, expect, it } from "vitest";
import {
  encryptTemplate,
  decryptTemplate,
} from "../../src/utils/biometric-crypto.js";

const VECTOR = Array.from({ length: 128 }, (_, i) => Number(Math.sin(i).toFixed(6)));
const OWNER = 42;

describe("biometric-crypto", () => {
  it("round-trips a descriptor for its owner", () => {
    const enc = encryptTemplate(VECTOR, { userId: OWNER });
    expect(decryptTemplate(enc, { userId: OWNER })).toEqual(VECTOR);
  });

  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptTemplate(VECTOR, { userId: OWNER })).not.toBe(
      encryptTemplate(VECTOR, { userId: OWNER })
    );
  });

  it("writes the current owner-bound v2 format, not an encoding of the plaintext", () => {
    const enc = encryptTemplate(VECTOR, { userId: OWNER });
    expect(enc.startsWith("v2:")).toBe(true);
    const plainB64 = Buffer.from(JSON.stringify(VECTOR)).toString("base64");
    expect(enc).not.toContain(plainB64);
  });

  it("rejects a tampered ciphertext", () => {
    const enc = encryptTemplate(VECTOR, { userId: OWNER });
    const parts = enc.split(":");
    // Flip a character in the ciphertext segment (v2 layout: scheme:keyId:iv:tag:ct).
    parts[4] = parts[4].slice(0, -1) + (parts[4].endsWith("A") ? "B" : "A");
    expect(() => decryptTemplate(parts.join(":"), { userId: OWNER })).toThrow();
  });

  it("refuses to decrypt a template moved to another owner (AAD binding)", () => {
    const enc = encryptTemplate(VECTOR, { userId: OWNER });
    // Same ciphertext, different claimed owner: GCM tag verification fails, so
    // a row copied into user B's record cannot authenticate as user B.
    expect(() => decryptTemplate(enc, { userId: OWNER + 1 })).toThrow();
  });

  it("requires an owner id to encrypt or decrypt", () => {
    expect(() => encryptTemplate(VECTOR)).toThrow();
    const enc = encryptTemplate(VECTOR, { userId: OWNER });
    expect(() => decryptTemplate(enc)).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptTemplate("not-encrypted", { userId: OWNER })).toThrow();
    // Wrong segment count for a v2 payload.
    expect(() => decryptTemplate("v2:a:b:c", { userId: OWNER })).toThrow();
  });
});
