// src/services/event.service.js
//
// Event mutations: create/update with the recurring-vs-fixed duration
// rules, session (re)scheduling through the BullMQ queue, and soft
// deletion. Scheduling failures never fail the request - they are logged
// and the session worker's sweep picks the event up later.
import crypto from "node:crypto";
import { startOfDay, addDays } from "date-fns";
import { prisma } from "../config/prisma-client.js";
import {
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.js";
import { sessionQueue } from "../jobs/session-queue.js";
import {
  deleteImage,
  imageColumnValue,
  uploadImage,
} from "../utils/cloudinary.js";
import logger from "../utils/logger.js";

/** Inclusive day count between two dates (both endpoints counted). */
function inclusiveDurationDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Queues session creation for an event: delayed until its start date if
 * that is in the future, immediate otherwise. Log wording comes from the
 * caller so create and update keep their distinct messages.
 */
async function queueSessionCreation(eventId, eventStartDate, messages) {
  const delay = eventStartDate.getTime() - Date.now();

  if (delay > 0) {
    await sessionQueue.add("createSession", { eventId }, { delay });
    logger.info(messages.scheduled);
  } else {
    await sessionQueue.add("createSession", { eventId });
    logger.info(messages.immediate);
  }
}

/** Creates the event (with nested location) and schedules its first session. */
export async function createEvent(input, file) {
  const {
    location,
    startDate,
    endDate,
    startTime,
    endTime,
    isRecurring,
    durationDays,
    // Whitelisted editable columns only - anything else in the body (archived,
    // deletedAt, venueSecret, timestamps, ...) is dropped, so a client can't
    // mass-assign its way past domain guards.
    title,
    description,
    recurrenceInterval,
    type,
    // The cover image only ever arrives as a FILE part; a client-typed body
    // value is dropped so nobody can write arbitrary URLs into the column.
    coverImage: _ignoredCoverImage,
  } = input;

  if (!isRecurring && !endDate) {
    throw new ValidationError("endDate is required for non-recurring events");
  }

  let calculatedDuration = durationDays;

  if (!isRecurring && startDate && endDate) {
    calculatedDuration = inclusiveDurationDays(startDate, endDate);
  }

  const coverImage = file ? await uploadImage(file.buffer) : undefined;

  const eventData = {
    title,
    ...(description !== undefined && { description }),
    type,
    ...(recurrenceInterval !== undefined && { recurrenceInterval }),
    ...(coverImage !== undefined && { coverImage }),
    venueSecret: crypto.randomBytes(32).toString("hex"),
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    startTime,
    endTime,
    isRecurring: isRecurring || false,
    durationDays: calculatedDuration || 1,
    location: {
      create: {
        name: location.name,
        city: location.city || null,
        country: location.country || null,
      },
    },
  };

  const event = await prisma.event.create({
    data: eventData,
    include: {
      location: true,
    },
  });

  try {
    const eventStartDate = startOfDay(new Date(startDate));
    await queueSessionCreation(event.id, eventStartDate, {
      scheduled: `📅 Scheduled first session for event ${
        event.id
      } on ${eventStartDate.toISOString()}`,
      immediate: `📅 Queued immediate session creation for event ${event.id}`,
    });
  } catch (error) {
    logger.error(error, `Failed to schedule session for event ${event.id}`);
  }

  return event;
}

/**
 * Updates an event, enforcing the rules that keep attendance history
 * coherent (no start-date changes once attendance exists, no edits to
 * passed one-off events unless converting them to recurring), then
 * reconciles session scheduling with the new shape.
 */
export async function updateEvent(eventId, input, file) {
  const {
    location,
    startDate,
    endDate,
    startTime,
    endTime,
    isRecurring,
    durationDays,
    coverImage,
    // Whitelisted editable columns only (see createEvent) - no mass assignment.
    title,
    description,
    recurrenceInterval,
    type,
  } = input;

  // findFirst: a soft-deleted event reads as absent.
  const existingEvent = await prisma.event.findFirst({
    where: { id: eventId },
    include: {
      location: true,
      sessions: {
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
  });

  if (!existingEvent) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  const currentDate = new Date();
  const eventEndDate = existingEvent.endDate || existingEvent.startDate;
  const hasEventPassed = new Date(eventEndDate) < currentDate;

  const hasAttendance = await prisma.attendance.count({
    where: {
      session: {
        eventId,
      },
    },
  });

  if (startDate && hasAttendance > 0) {
    const existingStartDate = new Date(existingEvent.startDate);
    const newStartDateParsed = new Date(startDate);

    if (existingStartDate.getTime() !== newStartDateParsed.getTime()) {
      throw new ValidationError(
        "Cannot update the start date of an event that already has attendance records."
      );
    }
  }

  if (!existingEvent.isRecurring && hasEventPassed) {
    if (isRecurring === true) {
      if (
        startDate &&
        new Date(startDate).getTime() !==
          new Date(existingEvent.startDate).getTime()
      ) {
        throw new ValidationError(
          "Cannot update the start date when converting a past non-recurring event to recurring. You can only change the recurring settings."
        );
      }
    } else {
      throw new ValidationError(
        "Cannot update a non-recurring event that has already passed. Set isRecurring to true to convert it to a recurring event."
      );
    }
  }

  let calculatedDuration = durationDays;

  const newStartDate = startDate
    ? new Date(startDate)
    : existingEvent.startDate;
  const newEndDate = endDate ? new Date(endDate) : existingEvent.endDate;
  const newIsRecurring =
    isRecurring !== undefined ? isRecurring : existingEvent.isRecurring;

  if (!newIsRecurring && !newEndDate) {
    throw new ValidationError("endDate is required for non-recurring events");
  }

  if (!newIsRecurring && newStartDate && newEndDate) {
    calculatedDuration = inclusiveDurationDays(newStartDate, newEndDate);
  }

  // Cover image wire semantics (see utils/cloudinary.js imageColumnValue):
  // a file part replaces, body coverImage '' removes, absence leaves the
  // column untouched. undefined below means "no change".
  const newCoverImage = file
    ? await uploadImage(file.buffer)
    : imageColumnValue(coverImage);

  const updateData = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(type !== undefined && { type }),
    ...(recurrenceInterval !== undefined && { recurrenceInterval }),
    ...(newCoverImage !== undefined && { coverImage: newCoverImage }),
    ...(startDate && { startDate: new Date(startDate) }),
    ...(endDate !== undefined && {
      endDate: endDate ? new Date(endDate) : null,
    }),
    ...(startTime && { startTime }),
    ...(endTime && { endTime }),
    ...(isRecurring !== undefined && { isRecurring }),
    ...(calculatedDuration && { durationDays: calculatedDuration }),
  };

  if (location) {
    updateData.location = {
      update: {
        name: location.name,
        city: location.city || null,
        country: location.country || null,
      },
    };
  }

  const updatedEvent = await prisma.event.update({
    where: { id: eventId },
    data: updateData,
    include: {
      location: true,
      sessions: {
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
  });

  // The replaced/removed asset is deleted only after the row change stuck;
  // deleteImage is best-effort and never fails the request.
  if (newCoverImage !== undefined && existingEvent.coverImage) {
    await deleteImage(existingEvent.coverImage);
  }

  await reconcileSessionSchedule(existingEvent, updatedEvent, {
    startDate,
    isRecurring,
  });

  return updatedEvent;
}

/** Post-update session scheduling: best effort, never fails the request. */
async function reconcileSessionSchedule(
  existingEvent,
  updatedEvent,
  { startDate, isRecurring }
) {
  try {
    const startDateChanged =
      startDate &&
      new Date(startDate).getTime() !==
        new Date(existingEvent.startDate).getTime();

    const recurringStatusChanged =
      isRecurring !== undefined && isRecurring !== existingEvent.isRecurring;

    const hasNoSessions = existingEvent.sessions.length === 0;

    if (hasNoSessions || startDateChanged || recurringStatusChanged) {
      const eventStartDate = startOfDay(updatedEvent.startDate);

      // Check if there's already a session for the new start date.
      // findUnique on the compound key: Session is not soft-deletable.
      const sessionExists = await prisma.session.findUnique({
        where: {
          eventId_startDate: {
            eventId: updatedEvent.id,
            startDate: eventStartDate,
          },
        },
      });

      if (!sessionExists) {
        await queueSessionCreation(updatedEvent.id, eventStartDate, {
          scheduled: `📅 Rescheduled session for updated event ${updatedEvent.id}`,
          immediate: `📅 Queued immediate session creation for updated event ${updatedEvent.id}`,
        });
      } else {
        logger.info(
          `ℹ️ Session already exists for event ${
            updatedEvent.id
          } on ${eventStartDate.toISOString()}`
        );
      }
    }

    // If converted to recurring, schedule the next occurrence.
    if (
      recurringStatusChanged &&
      updatedEvent.isRecurring &&
      updatedEvent.sessions.length > 0
    ) {
      const lastSession = updatedEvent.sessions[0];
      const nextSessionDate = addDays(
        startOfDay(new Date(lastSession.startDate)),
        updatedEvent.recurrenceInterval
      );

      const withinEventPeriod =
        !updatedEvent.endDate ||
        nextSessionDate <= new Date(updatedEvent.endDate);

      if (withinEventPeriod) {
        const delay = nextSessionDate.getTime() - Date.now();

        if (delay > 0) {
          await sessionQueue.add(
            "createSession",
            { eventId: updatedEvent.id },
            { delay }
          );
          logger.info(
            `🔄 Scheduled next recurring session for event ${updatedEvent.id}`
          );
        }
      }
    }
  } catch (error) {
    logger.error(
      error,
      `❌ Failed to reschedule session for event ${updatedEvent.id}:`
    );
  }
}

/** Soft delete: refused while attendance history exists. */
export async function deleteEvent(eventId) {
  // findFirst so the soft-delete scope applies (a deleted event is gone).
  const event = await prisma.event.findFirst({
    where: { id: eventId },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  const hasAttendance = await prisma.attendance.count({
    where: {
      session: {
        eventId,
      },
    },
  });

  if (hasAttendance > 0) {
    throw new ValidationError(
      "Cannot delete an event that has attendance records. Please archive the event instead to preserve historical data."
    );
  }

  // Soft delete: the event leaves every list but its rows survive.
  await prisma.event.update({
    where: { id: eventId },
    data: { deletedAt: new Date() },
  });
}
