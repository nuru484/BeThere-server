// test/integration/dashboards.test.js
//
// Dashboard aggregation endpoints against seeded attendance: exact totals,
// per-day series, and event-type breakdowns for both the admin (all users)
// and user (own rows) variants, plus the role gate and the date-range cap.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import {
  adminCookie,
  attendantCookie,
  createAdmin,
  createAttendant,
} from "../helpers.js";

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
      data: {
        eventId: event.id,
        startDate: utc(day),
        endDate: utc(day),
        startTime: noon(day),
        endTime: noon(day),
      },
    });
  }
  return { event, sessions };
}

/**
 * Two users, one recurring and one non-recurring event:
 *   D1: userA PRESENT + userB LATE (recurring), userB ABSENT (non-recurring)
 *   D2: userA PRESENT (recurring)
 */
async function seedDashboardData() {
  const admin = await createAdmin();
  const userA = await createAttendant({ email: "a@test.local" });
  const userB = await createAttendant({ email: "b@test.local" });

  const recurring = await createEventWithSessions({
    title: "Recurring Event",
    isRecurring: true,
    days: [D1, D2],
  });
  const oneOff = await createEventWithSessions({
    title: "One-off Event",
    isRecurring: false,
    days: [D1],
  });

  await prisma.attendance.createMany({
    data: [
      {
        userId: userA.id,
        sessionId: recurring.sessions[D1].id,
        status: "PRESENT",
        checkInTime: noon(D1),
      },
      {
        userId: userB.id,
        sessionId: recurring.sessions[D1].id,
        status: "LATE",
        checkInTime: new Date(`${D1}T12:05:00.000Z`),
      },
      {
        userId: userB.id,
        sessionId: oneOff.sessions[D1].id,
        status: "ABSENT",
        checkInTime: new Date(`${D1}T12:10:00.000Z`),
      },
      {
        userId: userA.id,
        sessionId: recurring.sessions[D2].id,
        status: "PRESENT",
        checkInTime: noon(D2),
      },
    ],
  });

  return { admin, userA, userB };
}

describe("GET /dashboard/admin/attendance-data", () => {
  it("aggregates totals, per-day series, and event-type breakdown exactly", async () => {
    const { admin } = await seedDashboardData();

    const res = await request(app)
      .get(`/api/v1/dashboard/admin/attendance-data?startDate=${D1}&endDate=${D2}`)
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(200);
    const { summary, timeSeriesData, statusPercentages, statusCounts } =
      res.body.data;

    expect(summary.totalAttendances).toBe(4);
    expect(summary.uniqueUsersAttended).toBe(2);
    expect(summary.statusCounts).toEqual({
      present: 2,
      late: 1,
      absent: 1,
      total: 4,
    });
    expect(summary.statusPercentages).toEqual({
      present: "50.00",
      late: "25.00",
      absent: "25.00",
    });
    expect(summary.eventTypeBreakdown).toEqual({
      recurring: 3,
      nonRecurring: 1,
    });
    expect(summary.dateRange).toEqual({ from: D1, to: D2 });

    expect(statusCounts).toEqual({ present: 2, late: 1, absent: 1, total: 4 });
    expect(statusPercentages).toEqual({
      present: "50.00",
      late: "25.00",
      absent: "25.00",
    });

    expect(timeSeriesData).toEqual([
      { date: D1, total: 3, present: 1, late: 1, absent: 1, uniqueUsers: 2 },
      { date: D2, total: 1, present: 1, late: 0, absent: 0, uniqueUsers: 1 },
    ]);
  });

  it("only counts attendance inside the requested range", async () => {
    const { admin } = await seedDashboardData();

    const res = await request(app)
      .get(`/api/v1/dashboard/admin/attendance-data?startDate=${D2}&endDate=${D2}`)
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.totalAttendances).toBe(1);
    expect(res.body.data.timeSeriesData).toEqual([
      { date: D2, total: 1, present: 1, late: 0, absent: 0, uniqueUsers: 1 },
    ]);
  });

  it("rejects a range beyond the cap with 400", async () => {
    const { admin } = await seedDashboardData();

    const res = await request(app)
      .get(
        "/api/v1/dashboard/admin/attendance-data?startDate=2020-01-01&endDate=2026-01-01"
      )
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/range too large/i);
  });

  it("is not readable by an attendant", async () => {
    const { userA } = await seedDashboardData();

    const res = await request(app)
      .get(`/api/v1/dashboard/admin/attendance-data?startDate=${D1}&endDate=${D2}`)
      .set("Cookie", [attendantCookie(userA)]);

    expect(res.status).toBe(403);
  });
});

describe("GET /dashboard/admin/totals", () => {
  it("counts users and events by recurrence", async () => {
    const { admin } = await seedDashboardData();

    const res = await request(app)
      .get("/api/v1/dashboard/admin/totals")
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      totalUsers: 2,
      totalRecurringEvents: 1,
      totalNonRecurringEvents: 1,
      totalEvents: 2,
    });
  });
});

describe("GET /dashboard/users/attendance-data", () => {
  it("aggregates only the signed-in user's rows", async () => {
    const { userA } = await seedDashboardData();

    const res = await request(app)
      .get(`/api/v1/dashboard/users/attendance-data?startDate=${D1}&endDate=${D2}`)
      .set("Cookie", [attendantCookie(userA)]);

    expect(res.status).toBe(200);
    const { summary, attendanceByDate } = res.body.data;

    expect(summary.totalAttendances).toBe(2);
    expect(summary.statusBreakdown).toEqual({ present: 2, late: 0, absent: 0 });
    expect(summary.eventTypeBreakdown).toEqual({ recurring: 2, nonRecurring: 0 });
    expect(summary.dateRange).toEqual({ from: D1, to: D2 });

    expect(attendanceByDate).toEqual([
      {
        date: D1,
        total: 1,
        present: 1,
        late: 0,
        absent: 0,
        recurringEvents: 1,
        nonRecurringEvents: 0,
        events: ["Recurring Event"],
      },
      {
        date: D2,
        total: 1,
        present: 1,
        late: 0,
        absent: 0,
        recurringEvents: 1,
        nonRecurringEvents: 0,
        events: ["Recurring Event"],
      },
    ]);
  });

  it("splits statuses and event types for a mixed attendant", async () => {
    const { userB } = await seedDashboardData();

    const res = await request(app)
      .get(`/api/v1/dashboard/users/attendance-data?startDate=${D1}&endDate=${D2}`)
      .set("Cookie", [attendantCookie(userB)]);

    expect(res.status).toBe(200);
    const { summary, attendanceByDate } = res.body.data;

    expect(summary.totalAttendances).toBe(2);
    expect(summary.statusBreakdown).toEqual({ present: 0, late: 1, absent: 1 });
    expect(summary.eventTypeBreakdown).toEqual({ recurring: 1, nonRecurring: 1 });

    expect(attendanceByDate).toHaveLength(1);
    expect(attendanceByDate[0]).toMatchObject({
      date: D1,
      total: 2,
      late: 1,
      absent: 1,
      recurringEvents: 1,
      nonRecurringEvents: 1,
    });
    expect(attendanceByDate[0].events.sort()).toEqual([
      "One-off Event",
      "Recurring Event",
    ]);
  });

  it("rejects an over-cap range with 400 for users too", async () => {
    const { userA } = await seedDashboardData();

    const res = await request(app)
      .get(
        "/api/v1/dashboard/users/attendance-data?startDate=2020-01-01&endDate=2026-01-01"
      )
      .set("Cookie", [attendantCookie(userA)]);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/range too large/i);
  });

  it("is not readable by an admin (role-gated to attendants)", async () => {
    const { admin } = await seedDashboardData();

    const res = await request(app)
      .get(`/api/v1/dashboard/users/attendance-data?startDate=${D1}&endDate=${D2}`)
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(403);
  });
});
