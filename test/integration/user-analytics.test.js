// test/integration/user-analytics.test.js
//
// The attendant (USER) analytics slices, all scoped to the signed-in user:
// personal KPIs + streak, now/next, the personal trend, status/event
// breakdowns, and the calendar heatmap - plus the role gate.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { adminCookie, attendantCookie, createAdmin, createAttendant } from "../helpers.js";

const D1 = "2026-03-10";
const D2 = "2026-03-11";
const utc = (iso) => new Date(`${iso}T00:00:00.000Z`);
const noon = (iso) => new Date(`${iso}T12:00:00.000Z`);

async function createEventWithSessions({ title, isRecurring, days }) {
  const location = await prisma.location.create({ data: { name: `${title} Hall` } });
  const event = await prisma.event.create({
    data: {
      title,
      startDate: utc(days[0]),
      endDate: utc(days.at(-1)),
      isRecurring,
      startTime: "09:00",
      endTime: "17:00",
      locationId: location.id,
      type: "MEETING",
    },
  });
  const sessions = {};
  for (const day of days) {
    sessions[day] = await prisma.session.create({
      data: { eventId: event.id, startDate: utc(day), endDate: utc(day), startTime: noon(day), endTime: noon(day) },
    });
  }
  return { event, sessions };
}

async function seed() {
  const admin = await createAdmin();
  const userA = await createAttendant({ email: "a@test.local" });
  const userB = await createAttendant({ email: "b@test.local" });
  const recurring = await createEventWithSessions({ title: "Recurring Event", isRecurring: true, days: [D1, D2] });
  const oneOff = await createEventWithSessions({ title: "One-off Event", isRecurring: false, days: [D1] });

  await prisma.attendance.createMany({
    data: [
      { userId: userA.id, sessionId: recurring.sessions[D1].id, status: "PRESENT", checkInTime: noon(D1) },
      { userId: userB.id, sessionId: recurring.sessions[D1].id, status: "LATE", checkInTime: new Date(`${D1}T12:05:00.000Z`) },
      { userId: userB.id, sessionId: oneOff.sessions[D1].id, status: "ABSENT", checkInTime: null, createdAt: noon(D1) },
      { userId: userA.id, sessionId: recurring.sessions[D2].id, status: "PRESENT", checkInTime: noon(D2) },
    ],
  });
  return { admin, userA, userB };
}

const range = `startDate=${D1}&endDate=${D2}`;

describe("GET /dashboard/users/kpis", () => {
  it("computes the signed-in user's own KPIs and streak", async () => {
    const { userA } = await seed();
    const res = await request(app)
      .get(`/api/v1/dashboard/users/kpis?${range}`)
      .set("Cookie", [attendantCookie(userA)]);

    expect(res.status).toBe(200);
    const { kpis } = res.body.data;
    expect(kpis.attendanceRate.value).toBe(100);
    expect(kpis.onTimeRate.value).toBe(100);
    expect(kpis.attended.value).toBe(2);
    expect(kpis.currentStreak.value).toBe(2); // two present sessions, no miss
  });

  it("reflects a mixed attendant's own rows only", async () => {
    const { userB } = await seed();
    const res = await request(app)
      .get(`/api/v1/dashboard/users/kpis?${range}`)
      .set("Cookie", [attendantCookie(userB)]);
    expect(res.status).toBe(200);
    const { kpis } = res.body.data;
    expect(kpis.attendanceRate.value).toBe(50); // 1 attended of 2
    expect(kpis.onTimeRate.value).toBe(0); // the one attendance was late
    expect(kpis.attended.value).toBe(1);
  });

  it("is not readable by an admin (attendant-gated)", async () => {
    const { admin } = await seed();
    const res = await request(app)
      .get(`/api/v1/dashboard/users/kpis?${range}`)
      .set("Cookie", [adminCookie(admin)]);
    expect(res.status).toBe(403);
  });
});

describe("GET /dashboard/users/now-next", () => {
  it("returns no active check-in and no upcoming for past-only data", async () => {
    const { userA } = await seed();
    const res = await request(app)
      .get("/api/v1/dashboard/users/now-next")
      .set("Cookie", [attendantCookie(userA)]);
    expect(res.status).toBe(200);
    expect(res.body.data.checkedIn).toBeNull();
    expect(res.body.data.next).toBeNull();
    expect(res.body.data.canCheckIn).toBe(false);
  });
});

describe("GET /dashboard/users/attendance-trend + breakdowns + calendar", () => {
  it("buckets the user's own attendance and breaks it down", async () => {
    const { userA } = await seed();
    const cookie = [attendantCookie(userA)];

    const trend = await request(app).get(`/api/v1/dashboard/users/attendance-trend?${range}`).set("Cookie", cookie);
    expect(trend.status).toBe(200);
    expect(trend.body.data.timeSeries).toHaveLength(2);
    expect(trend.body.data.timeSeries[0]).toMatchObject({ label: D1, present: 1, total: 1 });

    const status = await request(app).get(`/api/v1/dashboard/users/status-breakdown?${range}`).set("Cookie", cookie);
    const byKey = Object.fromEntries(status.body.data.segments.map((s) => [s.key, s.count]));
    expect(byKey).toEqual({ PRESENT: 2, LATE: 0, ABSENT: 0 });

    const events = await request(app).get(`/api/v1/dashboard/users/event-breakdown?${range}`).set("Cookie", cookie);
    expect(events.body.data.segments[0]).toMatchObject({ label: "Recurring Event", count: 2, total: 2, attendanceRate: 100 });

    const calendar = await request(app).get(`/api/v1/dashboard/users/calendar?${range}`).set("Cookie", cookie);
    expect(calendar.body.data.days).toHaveLength(2);
    expect(calendar.body.data.days.every((d) => d.status === "present")).toBe(true);
  });
});
