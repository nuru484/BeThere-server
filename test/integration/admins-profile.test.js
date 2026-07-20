// test/integration/admins-profile.test.js
//
// The admin self-profile surface: the client switches /users -> /admins by
// role, so these endpoints must mirror the user envelopes exactly. Guards:
// safe shape (no hash), self-only mutations, cross-table email uniqueness.
// Cloudinary is mocked - no network in tests.
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { adminCookie, attendantCookie, createAdmin, createAttendant } from "../helpers.js";

const MOCK_IMAGE_URL =
  "https://res.cloudinary.com/test/image/upload/v1/bethere/mock-image.jpg";

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

describe("GET /api/v1/admins/:adminId", () => {
  it("returns the safe admin shape with role ADMIN (user-envelope parity)", async () => {
    const admin = await createAdmin({ email: "a1@test.local" });

    const res = await request(app)
      .get(`/api/v1/admins/${admin.id}`)
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(admin.id);
    expect(res.body.data.role).toBe("ADMIN");
    expect(res.body.data.email).toBe("a1@test.local");
    expect(res.body.data.password).toBeUndefined();
    expect(res.body.data.tokenVersion).toBeUndefined();
    expect(res.body.data.deletedAt).toBeUndefined();
  });

  it("lets an admin read ANOTHER admin", async () => {
    const admin = await createAdmin({ email: "reader@test.local" });
    const peer = await createAdmin({ email: "peer@test.local" });

    const res = await request(app)
      .get(`/api/v1/admins/${peer.id}`)
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe("peer@test.local");
  });

  it("is closed to attendants", async () => {
    const admin = await createAdmin({ email: "closed@test.local" });
    const user = await createAttendant({ email: "u@test.local" });

    const res = await request(app)
      .get(`/api/v1/admins/${admin.id}`)
      .set("Cookie", [attendantCookie(user)]);

    expect(res.status).toBe(403);
  });
});

describe("PUT /api/v1/admins/:adminId", () => {
  it("updates the admin's own profile (the users 404 bug, fixed)", async () => {
    const admin = await createAdmin({ email: "self@test.local" });

    const res = await request(app)
      .put(`/api/v1/admins/${admin.id}`)
      .set("Cookie", [adminCookie(admin)])
      .send({ firstName: "Renamed", phone: "+233540000010" });

    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe("Renamed");
    expect(res.body.data.phone).toBe("+233540000010");
    expect(res.body.data.role).toBe("ADMIN");
    expect(res.body.data.password).toBeUndefined();
  });

  it("rejects updating ANOTHER admin's profile (self-only)", async () => {
    const admin = await createAdmin({ email: "actor@test.local" });
    const peer = await createAdmin({ email: "victim@test.local" });

    const res = await request(app)
      .put(`/api/v1/admins/${peer.id}`)
      .set("Cookie", [adminCookie(admin)])
      .send({ firstName: "Hijacked" });

    expect(res.status).toBe(401);
  });

  it("answers 409 when the new email belongs to an attendant", async () => {
    const admin = await createAdmin({ email: "mine@test.local" });
    await createAttendant({ email: "taken@test.local" });

    const res = await request(app)
      .put(`/api/v1/admins/${admin.id}`)
      .set("Cookie", [adminCookie(admin)])
      .send({ email: "taken@test.local" });

    expect(res.status).toBe(409);
  });
});

describe("PATCH /api/v1/admins/:adminId/profile-picture", () => {
  it("uploads and stores the new picture for the admin themself", async () => {
    const admin = await createAdmin({ email: "pic@test.local" });

    const res = await request(app)
      .patch(`/api/v1/admins/${admin.id}/profile-picture`)
      .set("Cookie", [adminCookie(admin)])
      .attach("profilePicture", Buffer.from("fake-image-bytes"), {
        filename: "me.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(200);
    expect(res.body.data.profilePicture).toBe(MOCK_IMAGE_URL);
    expect(uploadImageMock).toHaveBeenCalledTimes(1);
  });

  it("rejects replacing ANOTHER admin's picture (self-only)", async () => {
    const admin = await createAdmin({ email: "picactor@test.local" });
    const peer = await createAdmin({ email: "picvictim@test.local" });

    const res = await request(app)
      .patch(`/api/v1/admins/${peer.id}/profile-picture`)
      .set("Cookie", [adminCookie(admin)])
      .attach("profilePicture", Buffer.from("fake-image-bytes"), {
        filename: "me.png",
        contentType: "image/png",
      });

    expect(res.status).toBe(401);
    expect(uploadImageMock).not.toHaveBeenCalled();
  });

  it("answers 400 when no file is attached", async () => {
    const admin = await createAdmin({ email: "nofile@test.local" });

    const res = await request(app)
      .patch(`/api/v1/admins/${admin.id}/profile-picture`)
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(400);
  });
});
