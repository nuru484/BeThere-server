// test/integration/attendance-reports.test.js
//
// The admin reports surface: flattened rows under filters, the top-attendees
// leaderboard, the status summary, and pagination meta. (Array-param 400s for
// the shared filters are covered in attendance.test.js.)
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { adminCookie, attendantCookie, createAdmin } from "../helpers.js";

const D1 = "2026-03-10";
const D2 = "2026-03-11";
const D3 = "2026-03-12";
const utc = (iso) => new Date(`${iso}T00:00:00.000Z`);
const noon = (iso) => new Date(`${iso}T12:00:00.000Z`);

/**
 * One recurring event with three daily sessions. Alice attends all three
 * (2x PRESENT, 1x LATE), Bob only the first (ABSENT) - so the leaderboard
 * order and every summary number are exact.
 */
async function seedReportData() {
  const admin = await createAdmin();
  const alice = await prisma.user.create({
    data: { firstName: "Alice", lastName: "Wonder", email: "alice@test.local" },
  });
  const bob = await prisma.user.create({
    data: { firstName: "Bob", lastName: "Builder", email: "bob@test.local" },
  });

  const location = await prisma.location.create({
    data: { name: "Main Hall", city: "Accra", country: "Ghana" },
  });
  const event = await prisma.event.create({
    data: {
      title: "Weekly Standup",
      startDate: utc(D1),
      endDate: utc(D3),
      isRecurring: true,
      startTime: "09:00",
      endTime: "17:00",
      locationId: location.id,
      type: "MEETING",
    },
  });

  const sessions = {};
  for (const day of [D1, D2, D3]) {
    sessions[day] = await prisma.session.create({
      data: {
        eventId: event.id,
        startDate: utc(day),
        endDate: utc(day),
        startTime: noon(day),
        endTime: noon(day),
      },
    });
  }

  await prisma.attendance.createMany({
    data: [
      { userId: alice.id, sessionId: sessions[D1].id, status: "PRESENT", checkInTime: noon(D1) },
      { userId: bob.id, sessionId: sessions[D1].id, status: "ABSENT", checkInTime: new Date(`${D1}T12:30:00.000Z`) },
      { userId: alice.id, sessionId: sessions[D2].id, status: "PRESENT", checkInTime: noon(D2) },
      { userId: alice.id, sessionId: sessions[D3].id, status: "LATE", checkInTime: noon(D3) },
    ],
  });

  return { admin, alice, bob, event, location };
}

const getReports = (admin, query = "") =>
  request(app)
    .get(`/api/v1/attendance-reports${query}`)
    .set("Cookie", [adminCookie(admin)]);

describe("GET /attendance-reports", () => {
  it("returns flattened rows, leaderboard, summary, and meta", async () => {
    const { admin, alice, event, location } = await seedReportData();

    const res = await getReports(admin);

    expect(res.status).toBe(200);
    expect(res.body.meta).toEqual({ total: 4, page: 1, limit: 10, totalPages: 1 });
    expect(res.body.data).toHaveLength(4);

    // Newest check-in first.
    expect(res.body.data.map((row) => row.status)).toEqual([
      "LATE",
      "PRESENT",
      "ABSENT",
      "PRESENT",
    ]);

    const first = res.body.data[0];
    expect(first).toMatchObject({
      userId: alice.id,
      userName: "Alice Wonder",
      userEmail: "alice@test.local",
      eventTitle: "Weekly Standup",
      eventId: event.id,
      eventType: "MEETING",
      isRecurring: true,
      status: "LATE",
      location: {
        id: location.id,
        name: "Main Hall",
        city: "Accra",
        country: "Ghana",
      },
    });

    expect(res.body.summary).toEqual({
      totalAttendance: 4,
      presentCount: 2,
      lateCount: 1,
      absentCount: 1,
    });
  });

  it("orders top attendees by attendance count", async () => {
    const { admin, alice, bob } = await seedReportData();

    const res = await getReports(admin);

    expect(res.status).toBe(200);
    expect(res.body.topAttendees).toHaveLength(2);
    expect(res.body.topAttendees[0]).toMatchObject({
      userId: alice.id,
      userName: "Alice Wonder",
      email: "alice@test.local",
      attendanceCount: 3,
    });
    expect(res.body.topAttendees[1]).toMatchObject({
      userId: bob.id,
      userName: "Bob Builder",
      attendanceCount: 1,
    });
  });

  it("applies the status filter to rows, summary, and leaderboard", async () => {
    const { admin, alice } = await seedReportData();

    const res = await getReports(admin, "?status=PRESENT");

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((row) => row.status === "PRESENT")).toBe(true);
    expect(res.body.summary).toEqual({
      totalAttendance: 2,
      presentCount: 2,
      lateCount: 0,
      absentCount: 0,
    });
    // Bob has no PRESENT rows, so the filtered leaderboard is Alice alone.
    expect(res.body.topAttendees).toEqual([
      expect.objectContaining({ userId: alice.id, attendanceCount: 2 }),
    ]);
  });

  it("filters by free-text search on the attendant's name", async () => {
    const { admin, bob } = await seedReportData();

    const res = await getReports(admin, "?search=Bob");

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0]).toMatchObject({
      userId: bob.id,
      userName: "Bob Builder",
      status: "ABSENT",
    });
  });

  it("filters by check-in date range", async () => {
    const { admin } = await seedReportData();

    const res = await getReports(
      admin,
      `?checkInStartDate=${D3}&checkInEndDate=${D3}`
    );

    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].status).toBe("LATE");
    expect(res.body.summary).toEqual({
      totalAttendance: 1,
      presentCount: 0,
      lateCount: 1,
      absentCount: 0,
    });
  });

  it("paginates with the standard meta block", async () => {
    const { admin } = await seedReportData();

    const res = await getReports(admin, "?limit=3&page=2");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toEqual({ total: 4, page: 2, limit: 3, totalPages: 2 });
  });

  it("is not readable by an attendant", async () => {
    const { alice } = await seedReportData();

    const res = await request(app)
      .get("/api/v1/attendance-reports")
      .set("Cookie", [attendantCookie(alice)]);

    expect(res.status).toBe(403);
  });
});
