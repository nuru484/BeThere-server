// test/unit/evidence-frame-url.test.js
//
// The legacy-vs-new discriminator for stored evidence frame values: rows from
// before authenticated delivery hold the public URL itself (passthrough so
// old evidence keeps rendering), new rows hold a public id that must be
// signed into a short-lived authenticated URL at read time.
import { beforeAll, describe, expect, it } from "vitest";
import cloudinary from "cloudinary";
import {
  isLegacyFrameValue,
  toClientFrameUrl,
} from "../../src/services/attendance-evidence.service.js";

beforeAll(() => {
  // URL building is offline, but signing needs credentials configured (the
  // app does this in app.js; unit tests configure their own throwaways).
  cloudinary.v2.config({
    cloud_name: "test",
    api_key: "test",
    api_secret: "test-secret",
  });
});

describe("isLegacyFrameValue", () => {
  it("recognises stored delivery URLs as legacy", () => {
    expect(
      isLegacyFrameValue("https://res.cloudinary.com/x/image/upload/v1/a.jpg")
    ).toBe(true);
    expect(isLegacyFrameValue("http://cloudinary.test/a.jpg")).toBe(true);
  });

  it("treats public ids (and empty values) as non-legacy", () => {
    expect(isLegacyFrameValue("bethere/evidence/abc")).toBe(false);
    expect(isLegacyFrameValue("")).toBe(false);
    expect(isLegacyFrameValue(null)).toBe(false);
    expect(isLegacyFrameValue(undefined)).toBe(false);
  });
});

describe("toClientFrameUrl", () => {
  it("passes a legacy URL through unchanged", () => {
    const legacy = "https://res.cloudinary.com/x/image/upload/v1/bethere/evidence/a.jpg";
    expect(toClientFrameUrl(legacy)).toBe(legacy);
  });

  it("signs a public id into an authenticated delivery URL", () => {
    const url = toClientFrameUrl("bethere/evidence/abc");
    expect(url).toContain("/image/authenticated/");
    expect(url).toContain("bethere/evidence/abc");
    // The signature component proves the URL was minted server-side.
    expect(url).toMatch(/s--[\w-]+--/);
  });
});
