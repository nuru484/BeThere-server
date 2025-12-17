// src/jobs/session-scheduler.js
import { Queue } from "bullmq";
import { prisma } from "../config/prisma-client.js";
import { createRedisConnection } from "../config/redis-connection.js";
import { addDays, startOfDay, isBefore, isEqual } from "date-fns";
import { sessionQueue } from "./session-queue.js";
import logger from "../utils/logger.js";

export const sessionSchedulerQueue = new Queue("sessionScheduler", {
  connection: createRedisConnection(),
});

export async function scheduleUpcomingSessions() {
  logger.info("🔍 Checking for events needing session creation...");

  const tomorrow = startOfDay(addDays(new Date(), 1));

  const events = await prisma.event.findMany({
    include: {
      sessions: {
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
  });

  let scheduledCount = 0;

  for (const event of events) {
    let shouldCreateSession = false;
    let targetDate;

    if (event.sessions.length === 0) {
      targetDate = startOfDay(new Date(event.startDate));
      shouldCreateSession = isEqual(targetDate, tomorrow);
    } else if (event.isRecurring) {
      const lastSession = event.sessions[0];
      targetDate = addDays(
        startOfDay(new Date(lastSession.startDate)),
        event.recurrenceInterval
      );

      const withinEventPeriod =
        !event.endDate ||
        isBefore(targetDate, new Date(event.endDate)) ||
        isEqual(targetDate, new Date(event.endDate));

      shouldCreateSession = isEqual(targetDate, tomorrow) && withinEventPeriod;
    }

    if (shouldCreateSession) {
      const delay = tomorrow.getTime() - Date.now();

      await sessionQueue.add("createSession", { eventId: event.id }, { delay });

      scheduledCount++;
      logger.info(
        `📅 Scheduled session creation for event "${event.title}" (ID: ${event.id})`
      );
    }
  }

  logger.info(`✅ Scheduled ${scheduledCount} session(s) for creation`);
  return scheduledCount;
}
