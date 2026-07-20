// test/unit/biometric-crypto.test.js
//
// The at-rest template encryption: a round-trip must recover the descriptor,
// each encryption must differ (random IV), and any tamper must be rejected
// rather than silently decrypt to a partial value.
import { describe, expect, it } from "vitest";
import {
  encryptTemplate,
  decryptTemplate,
} from "../../src/utils/biometric-crypto.js";

const VECTOR = Array.from({ length: 128 }, (_, i) => Number(Math.sin(i).toFixed(6)));

describe("biometric-crypto", () => {
  it("round-trips a descriptor", () => {
    const enc = encryptTemplate(VECTOR);
    expect(decryptTemplate(enc)).toEqual(VECTOR);
  });

  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptTemplate(VECTOR)).not.toBe(encryptTemplate(VECTOR));
  });

  it("is versioned ciphertext, not an encoding of the plaintext", () => {
    const enc = encryptTemplate(VECTOR);
    expect(enc.startsWith("v1:")).toBe(true);
    // The ciphertext must not be a mere base64 of the serialized descriptor.
    const plainB64 = Buffer.from(JSON.stringify(VECTOR)).toString("base64");
    expect(enc).not.toContain(plainB64);
  });

  it("rejects a tampered ciphertext", () => {
    const enc = encryptTemplate(VECTOR);
    const parts = enc.split(":");
    // Flip a character in the ciphertext segment.
    parts[3] = parts[3].slice(0, -1) + (parts[3].endsWith("A") ? "B" : "A");
    expect(() => decryptTemplate(parts.join(":"))).toThrow();
  });

  it("rejects a malformed payload", () => {
    expect(() => decryptTemplate("not-encrypted")).toThrow();
    expect(() => decryptTemplate("v2:a:b:c")).toThrow();
  });
});
