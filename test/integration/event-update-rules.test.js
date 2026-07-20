// test/integration/event-update-rules.test.js
//
// The update invariants in event.service.js that keep attendance history
// coherent: the start date locks once attendance exists, a passed one-off
// event only accepts conversion to recurring (and even then keeps its start
// date), and a non-recurring shape always requires an end date.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import { adminCookie, createAdmin, createAttendant } from "../helpers.js";

const PAST_DAY = "2026-06-01";
const FUTURE_DAY = "2026-09-01";
const utc = (iso) => new Date(`${iso}T00:00:00.000Z`);

async function createEvent({ startDate, endDate = null, isRecurring = false }) {
  const location = await prisma.location.create({ data: { name: "Rule Hall" } });
  return prisma.event.create({
    data: {
      title: "Rules Event",
      startDate: utc(startDate),
      endDate: endDate ? utc(endDate) : null,
      isRecurring,
      startTime: "09:00",
      endTime: "17:00",
      locationId: location.id,
      type: "MEETING",
    },
  });
}

/** A session on the event's start day with one attendance row on it. */
async function addAttendance(event, day) {
  const user = await createAttendant({ email: `rules-${event.id}@test.local` });
  const session = await prisma.session.create({
    data: {
      eventId: event.id,
      startDate: utc(day),
      endDate: utc(day),
      startTime: utc(day),
      endTime: utc(day),
    },
  });
  await prisma.attendance.create({
    data: {
      userId: user.id,
      sessionId: session.id,
      status: "PRESENT",
      checkInTime: new Date(`${day}T12:00:00.000Z`),
    },
  });
}

const putEvent = (admin, eventId, body) =>
  request(app)
    .put(`/api/v1/events/${eventId}`)
    .set("Cookie", [adminCookie(admin)])
    .send(body);

describe("PUT /events/:eventId update rules", () => {
  it("locks the start date once attendance exists", async () => {
    const admin = await createAdmin();
    const event = await createEvent({
      startDate: FUTURE_DAY,
      endDate: FUTURE_DAY,
    });
    await addAttendance(event, FUTURE_DAY);

    const res = await putEvent(admin, event.id, { startDate: "2026-09-05" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Cannot update the start date of an event that already has attendance records."
    );
  });

  it("accepts an unchanged start date even with attendance", async () => {
    const admin = await createAdmin();
    const event = await createEvent({
      startDate: FUTURE_DAY,
      endDate: FUTURE_DAY,
    });
    await addAttendance(event, FUTURE_DAY);

    const res = await putEvent(admin, event.id, {
      startDate: FUTURE_DAY,
      title: "Renamed Event",
    });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe("Renamed Event");
  });

  it("refuses any edit to a passed non-recurring event", async () => {
    const admin = await createAdmin();
    const event = await createEvent({ startDate: PAST_DAY, endDate: PAST_DAY });

    const res = await putEvent(admin, event.id, { title: "Too Late" });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Cannot update a non-recurring event that has already passed. Set isRecurring to true to convert it to a recurring event."
    );
  });

  it("refuses a new start date while converting a passed event to recurring", async () => {
    const admin = await createAdmin();
    const event = await createEvent({ startDate: PAST_DAY, endDate: PAST_DAY });

    const res = await putEvent(admin, event.id, {
      isRecurring: true,
      startDate: FUTURE_DAY,
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "Cannot update the start date when converting a past non-recurring event to recurring. You can only change the recurring settings."
    );
  });

  it("converts a passed non-recurring event to recurring", async () => {
    const admin = await createAdmin();
    const event = await createEvent({ startDate: PAST_DAY, endDate: PAST_DAY });

    const res = await putEvent(admin, event.id, {
      isRecurring: true,
      recurrenceInterval: 7,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.isRecurring).toBe(true);
    expect(res.body.data.recurrenceInterval).toBe(7);
  });

  it("allows the conversion to restate the SAME start date", async () => {
    const admin = await createAdmin();
    const event = await createEvent({ startDate: PAST_DAY, endDate: PAST_DAY });

    const res = await putEvent(admin, event.id, {
      isRecurring: true,
      startDate: PAST_DAY,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.isRecurring).toBe(true);
  });

  it("requires an end date when a recurring event turns non-recurring", async () => {
    const admin = await createAdmin();
    const event = await createEvent({
      startDate: FUTURE_DAY,
      isRecurring: true,
    });

    const res = await putEvent(admin, event.id, { isRecurring: false });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(
      "endDate is required for non-recurring events"
    );
  });

  it("rejects a recurrence interval shorter than the occurrence", async () => {
    // The stall: the next occurrence would start on a day the current one
    // already has a Session row for, so generation freezes there and the
    // daily sweep re-enqueues the same event forever.
    const admin = await createAdmin();
    const event = await createEvent({
      startDate: FUTURE_DAY,
      isRecurring: true,
    });

    const res = await putEvent(admin, event.id, {
      isRecurring: true,
      durationDays: 5,
      recurrenceInterval: 2,
    });

    expect(res.status).toBe(400);
    // Caught at the boundary: both halves are in the body.
    expect(
      res.body.details.errors.map((e) => e.message).join(" ")
    ).toMatch(/at least durationDays/i);
  });

  it("rejects the same shape assembled across two partial updates", async () => {
    // The validator only sees the request body; the merged check in the
    // service is what catches a half supplied by the stored row.
    const admin = await createAdmin();
    const event = await createEvent({
      startDate: FUTURE_DAY,
      isRecurring: true,
    });

    const widen = await putEvent(admin, event.id, { durationDays: 5 });
    expect(widen.status).toBe(400);
    expect(widen.body.message).toMatch(/at least durationDays/i);
  });

  it("accepts an interval equal to the occurrence length", async () => {
    const admin = await createAdmin();
    const event = await createEvent({
      startDate: FUTURE_DAY,
      isRecurring: true,
    });

    const res = await putEvent(admin, event.id, {
      isRecurring: true,
      durationDays: 3,
      recurrenceInterval: 3,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.durationDays).toBe(3);
  });

  it("404s for an unknown event", async () => {
    const admin = await createAdmin();

    const res = await putEvent(admin, 99999, { title: "Ghost" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Event with ID 99999 not found.");
  });
});
