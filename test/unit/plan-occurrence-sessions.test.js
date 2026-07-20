// test/unit/plan-occurrence-sessions.test.js
//
// Sessions are stored one row PER DAY. Attendance is unique on
// (userId, sessionId), so a single row spanning a multi-day event meant one
// check-in for the whole span - a five-day conference recorded one day per
// attendee and refused the rest with "already checked in".
import { describe, expect, it } from "vitest";
import { planOccurrenceSessions } from "../../src/jobs/session-worker.js";

const day = (iso) => new Date(`${iso}T00:00:00`);

const plan = (over = {}) =>
  planOccurrenceSessions({
    eventId: 1,
    occurrenceStart: day("2026-07-20"),
    durationDays: 1,
    startTime: "09:00",
    endTime: "17:00",
    ...over,
  });

describe("planOccurrenceSessions", () => {
  it("plans a single row for a one-day event", () => {
    const rows = plan();

    expect(rows).toHaveLength(1);
    expect(rows[0].startDate).toEqual(rows[0].endDate);
    expect(rows[0].startTime.getHours()).toBe(9);
    expect(rows[0].endTime.getHours()).toBe(17);
  });

  it("plans one row per day across a multi-day event", () => {
    const rows = plan({ durationDays: 5 });

    expect(rows).toHaveLength(5);
    // Consecutive days, each self-contained so attendance is per day.
    expect(rows.map((r) => r.startDate.getDate())).toEqual([20, 21, 22, 23, 24]);
    rows.forEach((row) => {
      expect(row.startDate).toEqual(row.endDate);
      expect(row.startTime.getHours()).toBe(9);
      expect(row.endTime.getHours()).toBe(17);
    });
  });

  it("carries the daily time window onto every day, not just the first", () => {
    const rows = plan({ durationDays: 3, startTime: "08:30", endTime: "12:45" });

    rows.forEach((row) => {
      expect([row.startTime.getHours(), row.startTime.getMinutes()]).toEqual([
        8, 30,
      ]);
      expect([row.endTime.getHours(), row.endTime.getMinutes()]).toEqual([
        12, 45,
      ]);
    });
  });

  it("never plans past the event's end date", () => {
    const rows = plan({ durationDays: 5, eventEndDate: day("2026-07-22") });

    expect(rows).toHaveLength(3);
    expect(rows.at(-1).startDate.getDate()).toBe(22);
  });

  it("treats a missing or zero duration as a single day", () => {
    expect(plan({ durationDays: 0 })).toHaveLength(1);
    expect(plan({ durationDays: undefined })).toHaveLength(1);
  });
});
