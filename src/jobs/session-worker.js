// src/jobs/session-worker.js
import { Worker } from "bullmq";
import { prisma } from "../config/prisma-client.js";
import { createRedisConnection } from "../config/redis-connection.js";
import { addDays, startOfDay, format } from "date-fns";
import logger from "../utils/logger.js";
import { NotFoundError } from "../middleware/error-handler.js";
import { sessionQueue } from "./session-queue.js";

/**
 * Plans the Session rows for ONE occurrence of an event: one row PER DAY.
 *
 * A single row spanning several days used to be created for a multi-day event,
 * but Attendance is unique on (userId, sessionId) - so that one row meant one
 * check-in for the ENTIRE span, and a Mon-Fri conference could only ever
 * record a single day per attendee. A day per row makes attendance per day,
 * which is what a "session" means everywhere else in the product.
 *
 * Pure on purpose: the date arithmetic is the part worth testing, and it needs
 * neither Redis nor a database.
 */
export function planOccurrenceSessions({
  eventId,
  occurrenceStart,
  durationDays,
  startTime,
  endTime,
  eventEndDate = null,
}) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const lastAllowedDay = eventEndDate ? startOfDay(new Date(eventEndDate)) : null;

  const rows = [];
  for (let offset = 0; offset < Math.max(1, durationDays || 1); offset++) {
    const day = addDays(occurrenceStart, offset);
    // Never run an occurrence past the event's own end date.
    if (lastAllowedDay && day > lastAllowedDay) break;

    const dayStart = new Date(day);
    dayStart.setHours(startHour, startMinute, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setHours(endHour, endMinute, 0, 0);

    rows.push({
      eventId,
      startDate: day,
      endDate: day,
      startTime: dayStart,
      endTime: dayEnd,
    });
  }

  return rows;
}

export const sessionWorker = new Worker(
  "sessionQueue",
  async (job) => {
    const { eventId } = job.data;

    logger.info(`📅 Processing session creation for event: ${eventId}`);

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        sessions: {
          orderBy: { startDate: "desc" },
          take: 1,
        },
      },
    });

    if (!event) {
      throw new NotFoundError(`Event ${eventId} not found`);
    }

    // Determine the next session start date
    let sessionStartDate;

    if (event.sessions.length === 0) {
      // First session - use event's startDate
      sessionStartDate = startOfDay(new Date(event.startDate));
    } else {
      // Recurring event - calculate the next occurrence. Sessions are stored
      // one per day, so the newest row is the LAST day of the previous
      // occurrence; step back to that occurrence's first day before adding the
      // interval, or a multi-day event would drift by durationDays - 1 each time.
      const lastSession = event.sessions[0];
      const lastOccurrenceStart = addDays(
        new Date(lastSession.startDate),
        -(Math.max(1, event.durationDays || 1) - 1)
      );
      sessionStartDate = addDays(
        lastOccurrenceStart,
        event.recurrenceInterval
      );
    }

    // Check if session already exists
    const existingSession = await prisma.session.findUnique({
      where: {
        eventId_startDate: {
          eventId: event.id,
          startDate: sessionStartDate,
        },
      },
    });

    if (existingSession) {
      logger.info(
        `⚠️ Session already exists for event ${eventId} on ${sessionStartDate}`
      );

      return { status: "skipped", reason: "Session already exists" };
    }

    // Check if we should still create sessions (if event has endDate)
    if (event.endDate && sessionStartDate > new Date(event.endDate)) {
      logger.info(
        `🛑 Event ${eventId} has ended. No more sessions will be created.`
      );

      return { status: "completed", reason: "Event ended" };
    }

    // One row per day of this occurrence, so attendance is recorded per day.
    const plannedSessions = planOccurrenceSessions({
      eventId: event.id,
      occurrenceStart: sessionStartDate,
      durationDays: event.durationDays,
      startTime: event.startTime,
      endTime: event.endTime,
      eventEndDate: event.endDate,
    });

    // skipDuplicates keeps the job idempotent if it is retried part-way.
    const { count } = await prisma.session.createMany({
      data: plannedSessions,
      skipDuplicates: true,
    });

    const lastPlanned = plannedSessions[plannedSessions.length - 1];
    logger.info(
      `✅ Created ${count} session(s) for event ${eventId}: ` +
        `${format(sessionStartDate, "yyyy-MM-dd")} -> ` +
        `${format(lastPlanned.startDate, "yyyy-MM-dd")} ` +
        `(${event.startTime}-${event.endTime})`
    );

    // If recurring, schedule the next session creation
    if (event.isRecurring) {
      const nextSessionDate = addDays(
        sessionStartDate,
        event.recurrenceInterval
      );

      // Only schedule if within event's endDate (if set)
      if (!event.endDate || nextSessionDate <= new Date(event.endDate)) {
        const delay = nextSessionDate.getTime() - Date.now();

        if (delay > 0) {
          await sessionQueue.add(
            "createSession",
            { eventId: event.id },
            { delay }
          );
          logger.info(
            `🔄 Scheduled next session for ${format(
              nextSessionDate,
              "yyyy-MM-dd"
            )}`
          );
        }
      }
    }

    return {
      status: "success",
      sessionsCreated: count,
      startDate: sessionStartDate,
      endDate: lastPlanned.startDate,
    };
  },
  {
    connection: createRedisConnection(),
  }
);

sessionWorker.on("failed", (job, err) => {
  logger.error(err.message, `❌ Session job ${job?.id} failed`);
});

sessionWorker.on("completed", (job, result) => {
  logger.info(result, `✅ Session job ${job.id} completed successfully`);
});
