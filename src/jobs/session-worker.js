// src/jobs/session-worker.js
import { Worker } from "bullmq";
import prisma from "../config/prisma-client.js";
import { createRedisConnection } from "../config/redis-connection.js";
import { addDays, startOfDay, format } from "date-fns";
import logger from "../utils/logger.js";
import { NotFoundError } from "../middleware/error-handler.js";
import { sessionQueue } from "./session-queue.js";

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
      // Recurring event - calculate next occurrence
      const lastSession = event.sessions[0];
      sessionStartDate = addDays(
        new Date(lastSession.startDate),
        event.recurrenceInterval
      );
    }

    // Calculate session end date based on durationDays
    const sessionEndDate = addDays(sessionStartDate, event.durationDays - 1);

    // Parse time strings and create full DateTime objects
    const [startHour, startMinute] = event.startTime.split(":").map(Number);
    const [endHour, endMinute] = event.endTime.split(":").map(Number);

    const startTime = new Date(sessionStartDate);
    startTime.setHours(startHour, startMinute, 0, 0);

    const endTime = new Date(sessionEndDate);
    endTime.setHours(endHour, endMinute, 0, 0);

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

    // Create the session
    const newSession = await prisma.session.create({
      data: {
        eventId: event.id,
        startDate: sessionStartDate,
        endDate: sessionEndDate,
        startTime: startTime,
        endTime: endTime,
      },
    });

    logger.info(`✅ Created session ${newSession.id} for event ${eventId}`);

    logger.info(
      `   Start: ${format(sessionStartDate, "yyyy-MM-dd")} at ${
        event.startTime
      }`
    );

    logger.info(
      `   End: ${format(sessionEndDate, "yyyy-MM-dd")} at ${event.endTime}`
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
      sessionId: newSession.id,
      startDate: sessionStartDate,
      endDate: sessionEndDate,
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
