// test/integration/session-finalizer.test.js
//
// The session-finalization sweep: once a session's daily window (plus grace)
// has closed, absentees get ABSENT rows, open attendances are auto
// checked-out with SYSTEM attribution, and the session is stamped
// finalizedAt exactly once.
import { describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../app.js";
import { prisma } from "../../src/config/prisma-client.js";
import {
  finalizeDueSessions,
} from "../../src/services/session-finalizer.service.js";
import { addUtcDays, eventCalendarDay } from "../../src/utils/time-context.js";
import { adminCookie, createAdmin, createAttendant } from "../helpers.js";

/** Event + one session on the given venue day (defaults: yesterday, so the
 * window has long closed). */
async function createFinishedSession({
  day = addUtcDays(eventCalendarDay(), -1),
  startTime = "09:00",
  endTime = "17:00",
} = {}) {
  const location = await prisma.location.create({ data: { name: "Hall" } });
  const event = await prisma.event.create({
    data: {
      title: "Finalizer Event",
      startDate: day,
      endDate: day,
      isRecurring: false,
      startTime,
      endTime,
      locationId: location.id,
      type: "MEETING",
    },
  });
  const session = await prisma.session.create({
    data: {
      eventId: event.id,
      startDate: day,
      endDate: day,
      startTime: day,
      endTime: day,
    },
  });
  return { event, session };
}

describe("session finalizer", () => {
  it("marks users who never checked in ABSENT and auto-checks-out open rows", async () => {
    const { session } = await createFinishedSession();
    const present = await createAttendant({ email: "fin-present@test.local" });
    const absent = await createAttendant({ email: "fin-absent@test.local" });

    // `present` checked in but never signed out.
    await prisma.attendance.create({
      data: {
        userId: present.id,
        sessionId: session.id,
        status: "PRESENT",
        checkInTime: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
    });

    const summary = await finalizeDueSessions();
    expect(summary.finalized).toBe(1);

    // The absentee got an ABSENT row with no check-in.
    const absentRow = await prisma.attendance.findUnique({
      where: { userId_sessionId: { userId: absent.id, sessionId: session.id } },
    });
    expect(absentRow?.status).toBe("ABSENT");
    expect(absentRow?.checkInTime).toBeNull();
    expect(absentRow?.autoCheckedOut).toBe(false);

    // The open attendance got a system check-out, clearly flagged as such.
    const presentRow = await prisma.attendance.findUnique({
      where: { userId_sessionId: { userId: present.id, sessionId: session.id } },
    });
    expect(presentRow?.checkOutTime).toBeTruthy();
    expect(presentRow?.autoCheckedOut).toBe(true);
    expect(presentRow?.status).toBe("PRESENT");

    // finalizedAt stamped.
    const finalized = await prisma.session.findUnique({
      where: { id: session.id },
    });
    expect(finalized?.finalizedAt).toBeTruthy();

    // Audit attribution is the SYSTEM actor, never the user.
    const audit = await prisma.auditLog.findFirst({
      where: { action: "SESSION_FINALIZED", targetId: session.id },
    });
    expect(audit).toBeTruthy();
    expect(audit.actorKind).toBe("SYSTEM");
    expect(audit.actorId).toBeNull();
    expect(audit.metadata).toMatchObject({ absentCreated: 1, autoCheckedOut: 1 });
  });

  it("is idempotent: a second sweep leaves a finalized session untouched", async () => {
    const { session } = await createFinishedSession();
    await createAttendant({ email: "fin-idem@test.local" });

    const first = await finalizeDueSessions();
    expect(first.finalized).toBe(1);
    const stamped = await prisma.session.findUnique({ where: { id: session.id } });

    const second = await finalizeDueSessions();
    expect(second.finalized).toBe(0);

    const after = await prisma.session.findUnique({ where: { id: session.id } });
    expect(after.finalizedAt.getTime()).toBe(stamped.finalizedAt.getTime());
    // Still exactly one ABSENT row and one audit entry.
    expect(
      await prisma.attendance.count({ where: { sessionId: session.id } })
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { action: "SESSION_FINALIZED", targetId: session.id },
      })
    ).toBe(1);
  });

  it("does not finalize a session whose window (plus grace) is still open", async () => {
    // Today's session with an all-day window: end + grace is in the future.
    const { session } = await createFinishedSession({
      day: eventCalendarDay(),
      endTime: "23:59",
    });
    await createAttendant({ email: "fin-open@test.local" });

    const summary = await finalizeDueSessions();
    expect(summary.finalized).toBe(0);
    const row = await prisma.session.findUnique({ where: { id: session.id } });
    expect(row.finalizedAt).toBeNull();
  });

  it("excludes soft-deleted users from absence marking", async () => {
    const { session } = await createFinishedSession();
    await createAttendant({ email: "fin-active@test.local" });
    const deleted = await createAttendant({ email: "fin-deleted@test.local" });
    await prisma.user.update({
      where: { id: deleted.id },
      data: { deletedAt: new Date() },
    });

    await finalizeDueSessions();

    expect(
      await prisma.attendance.count({ where: { sessionId: session.id } })
    ).toBe(1);
    expect(
      await prisma.attendance.count({
        where: { sessionId: session.id, userId: deleted.id },
      })
    ).toBe(0);
  });

  it("stamps historical sessions finalized WITHOUT fabricating absences", async () => {
    const { session } = await createFinishedSession({
      day: addUtcDays(eventCalendarDay(), -30),
    });
    await createAttendant({ email: "fin-hist@test.local" });

    const summary = await finalizeDueSessions();
    expect(summary.finalized).toBe(1);
    expect(summary.skippedHistorical).toBe(1);

    const row = await prisma.session.findUnique({ where: { id: session.id } });
    expect(row.finalizedAt).toBeTruthy();
    expect(
      await prisma.attendance.count({ where: { sessionId: session.id } })
    ).toBe(0);
  });

  it("exposes autoCheckedOut on the attendance list API", async () => {
    const { session } = await createFinishedSession();
    const user = await createAttendant({ email: "fin-api@test.local" });
    await prisma.attendance.create({
      data: {
        userId: user.id,
        sessionId: session.id,
        status: "PRESENT",
        checkInTime: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
    });
    await finalizeDueSessions();

    const admin = await createAdmin({ email: "fin-admin@test.local" });
    const res = await request(app)
      .get(`/api/v1/attendance/users/${user.id}`)
      .set("Cookie", [adminCookie(admin)]);

    expect(res.status).toBe(200);
    const row = res.body.data.find((r) => r.userId === user.id);
    expect(row.autoCheckedOut).toBe(true);
  });
});
