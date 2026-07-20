// test/integration/events-cover-image.test.js
//
// Event cover image wire semantics: file part -> replace, body '' -> remove,
// absent -> untouched - plus the multipart compatibility rules (JSON-encoded
// location string, stringified scalars) and the plain-JSON regression.
// Cloudinary is mocked - no network in tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { adminCookie, createAdmin } from "../helpers.js";

const MOCK_IMAGE_URL =
  "https://res.cloudinary.com/test/image/upload/v1/bethere/mock-cover.jpg";
const OLD_IMAGE_URL =
  "https://res.cloudinary.com/test/image/upload/v1/bethere/old-cover.jpg";

const { uploadImageMock, deleteImageMock } = vi.hoisted(() => ({
  uploadImageMock: vi.fn(async () => MOCK_IMAGE_URL),
  deleteImageMock: vi.fn(async () => {}),
}));

vi.mock("../../src/utils/cloudinary.js", async (importOriginal) => ({
  ...(await importOriginal()),
  uploadImage: uploadImageMock,
  deleteImage: deleteImageMock,
}));

beforeEach(() => {
  uploadImageMock.mockClear();
  deleteImageMock.mockClear();
});

const futureDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

/** Seeds an upcoming non-recurring event directly (no HTTP, no queue). */
async function seedEvent({ coverImage = null } = {}) {
  const location = await prisma.location.create({
    data: { name: "Seeded Hall" },
  });
  return prisma.event.create({
    data: {
      title: "Seeded Event",
      startDate: futureDate(7),
      endDate: futureDate(9),
      startTime: "06:00",
      endTime: "19:30",
      type: "MEETING",
      locationId: location.id,
      coverImage,
    },
  });
}

describe("POST /api/v1/events", () => {
  it("still accepts plain JSON with a nested location object (regression)", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post("/api/v1/events")
      .set("Cookie", [adminCookie(admin)])
      .send({
        title: "Team Retreat",
        startDate: futureDate(7).toISOString(),
        endDate: futureDate(9).toISOString(),
        startTime: "06:00",
        endTime: "19:30",
        type: "MEETING",
        isRecurring: false,
        location: { name: "Main Hall" },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.coverImage).toBeNull();
    expect(res.body.data.location.name).toBe("Main Hall");
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it("accepts multipart: stringified scalars, JSON-encoded location, cover file", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post("/api/v1/events")
      .set("Cookie", [adminCookie(admin)])
      .field("title", "Conference")
      .field("startDate", futureDate(7).toISOString())
      .field("endDate", futureDate(8).toISOString())
      .field("startTime", "06:00")
      .field("endTime", "19:30")
      .field("type", "CONFERENCE")
      .field("isRecurring", "false")
      .field(
        "location",
        JSON.stringify({
          name: "Expo Center",
          city: "Accra",
        })
      )
      .attach("coverImage", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("fake-image-bytes")]), {
        filename: "cover.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(201);
    expect(res.body.data.coverImage).toBe(MOCK_IMAGE_URL);
    expect(res.body.data.isRecurring).toBe(false);
    expect(res.body.data.location.city).toBe("Accra");
    expect(uploadImageMock).toHaveBeenCalledTimes(1);
  });
});

describe("PUT /api/v1/events/:eventId cover image wire semantics", () => {
  it("file part replaces the cover and deletes the old asset", async () => {
    const admin = await createAdmin();
    const event = await seedEvent({ coverImage: OLD_IMAGE_URL });

    const res = await request(app)
      .put(`/api/v1/events/${event.id}`)
      .set("Cookie", [adminCookie(admin)])
      .attach("coverImage", Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("new-image-bytes")]), {
        filename: "new-cover.jpg",
        contentType: "image/jpeg",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.coverImage).toBe(MOCK_IMAGE_URL);
    expect(deleteImageMock).toHaveBeenCalledWith(OLD_IMAGE_URL);
  });

  it("body coverImage '' nulls the column and deletes the old asset", async () => {
    const admin = await createAdmin();
    const event = await seedEvent({ coverImage: OLD_IMAGE_URL });

    const res = await request(app)
      .put(`/api/v1/events/${event.id}`)
      .set("Cookie", [adminCookie(admin)])
      .send({ coverImage: "" });

    expect(res.status).toBe(200);
    expect(res.body.data.coverImage).toBeNull();
    expect(deleteImageMock).toHaveBeenCalledWith(OLD_IMAGE_URL);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it("leaves the cover untouched when the field is absent", async () => {
    const admin = await createAdmin();
    const event = await seedEvent({ coverImage: OLD_IMAGE_URL });

    const res = await request(app)
      .put(`/api/v1/events/${event.id}`)
      .set("Cookie", [adminCookie(admin)])
      .send({ title: "Renamed Event" });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Renamed Event");
    expect(res.body.data.coverImage).toBe(OLD_IMAGE_URL);
    expect(deleteImageMock).not.toHaveBeenCalled();
  });

  it("rejects a client-typed coverImage URL (only '' or a file)", async () => {
    const admin = await createAdmin();
    const event = await seedEvent({ coverImage: OLD_IMAGE_URL });

    const res = await request(app)
      .put(`/api/v1/events/${event.id}`)
      .set("Cookie", [adminCookie(admin)])
      .send({ coverImage: "https://evil.example/injected.jpg" });

    expect(res.status).toBe(400);
  });
});
