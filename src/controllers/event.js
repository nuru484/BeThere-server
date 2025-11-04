import prisma from "../config/prisma-client.js";
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  createEventValidation,
  updateEventValidation,
} from "../validation/event.js";
import { sessionQueue } from "../jobs/session-queue.js";
import { startOfDay, addDays } from "date-fns";
import logger from "../utils/logger.js";

const handleCreateEvent = asyncHandler(async (req, res, _next) => {
  const {
    location,
    startDate,
    endDate,
    startTime,
    endTime,
    isRecurring,
    durationDays,
    ...eventDetails
  } = req.body;

  if (!isRecurring && !endDate) {
    return res.status(400).json({
      message: "endDate is required for non-recurring events",
    });
  }

  let calculatedDuration = durationDays;

  if (!isRecurring && startDate && endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    calculatedDuration = diffDays;
  }

  const eventData = {
    ...eventDetails,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
    startTime,
    endTime,
    isRecurring: isRecurring || false,
    durationDays: calculatedDuration || 1,
    location: {
      create: {
        name: location.name,
        latitude: parseFloat(location.latitude),
        longitude: parseFloat(location.longitude),
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

  // ============ SCHEDULE FIRST SESSION ============
  try {
    const eventStartDate = startOfDay(new Date(startDate));
    const now = new Date();
    const delay = eventStartDate.getTime() - now.getTime();

    if (delay > 0) {
      // Event starts in the future - schedule for that date
      await sessionQueue.add("createSession", { eventId: event.id }, { delay });
      logger.info(
        `📅 Scheduled first session for event ${
          event.id
        } on ${eventStartDate.toISOString()}`
      );
    } else {
      await sessionQueue.add("createSession", { eventId: event.id });
      logger.info(`📅 Queued immediate session creation for event ${event.id}`);
    }
  } catch (error) {
    logger.info(error, `❌ Failed to schedule session for event ${event.id}:`);
  }

  res.status(HTTP_STATUS_CODES.CREATED || 201).json({
    message: "Event created successfully",
    data: event,
  });
});

export const createEvent = [
  validationMiddleware.create(createEventValidation),
  handleCreateEvent,
];

export const handleUpdateEvent = asyncHandler(async (req, res, _next) => {
  const { eventId } = req.params;
  const {
    location,
    startDate,
    endDate,
    startTime,
    endTime,
    isRecurring,
    durationDays,
    ...eventUpdateData
  } = req.body;

  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }

  const existingEvent = await prisma.event.findUnique({
    where: { id: parseInt(eventId) },
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

  if (!existingEvent.isRecurring && hasEventPassed && !isRecurring) {
    throw new ValidationError(
      "Cannot update a non-recurring event that has already passed. Set isRecurring to true to convert it to a recurring event."
    );
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
    const start = new Date(newStartDate);
    const end = new Date(newEndDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    calculatedDuration = diffDays;
  }

  const updateData = {
    ...eventUpdateData,
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
        latitude: parseFloat(location.latitude),
        longitude: parseFloat(location.longitude),
        city: location.city || null,
        country: location.country || null,
      },
    };
  }

  const updatedEvent = await prisma.event.update({
    where: { id: parseInt(eventId) },
    data: updateData,
    include: {
      location: true,
      sessions: {
        orderBy: { startDate: "desc" },
        take: 1,
      },
    },
  });

  // ============ HANDLE SESSION SCHEDULING AFTER UPDATE ============
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
      const now = new Date();

      // Check if there's already a session for the new start date
      const sessionExists = await prisma.session.findUnique({
        where: {
          eventId_startDate: {
            eventId: updatedEvent.id,
            startDate: eventStartDate,
          },
        },
      });

      if (!sessionExists) {
        const delay = eventStartDate.getTime() - now.getTime();

        if (delay > 0) {
          await sessionQueue.add(
            "createSession",
            { eventId: updatedEvent.id },
            { delay }
          );
          logger.info(
            `📅 Rescheduled session for updated event ${updatedEvent.id}`
          );
        } else {
          await sessionQueue.add("createSession", { eventId: updatedEvent.id });
          logger.info(
            `📅 Queued immediate session creation for updated event ${updatedEvent.id}`
          );
        }
      } else {
        logger.info(
          `ℹ️ Session already exists for event ${
            updatedEvent.id
          } on ${eventStartDate.toISOString()}`
        );
      }
    }

    // If converted to recurring, schedule next occurrence
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
        const delay = nextSessionDate.getTime() - new Date().getTime();

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

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Event updated successfully",
    data: updatedEvent,
  });
});

export const updateEvent = [
  validationMiddleware.create(updateEventValidation),
  handleUpdateEvent,
];

export const deleteEvent = asyncHandler(async (req, res, _next) => {
  const { eventId } = req.params;

  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }

  const event = await prisma.event.findUnique({
    where: { id: parseInt(eventId) },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  await prisma.event.delete({
    where: { id: parseInt(eventId) },
  });

  res.status(200).json({ message: "Event deleted successfully." });
});

export const deleteAllEvents = asyncHandler(async (req, res, _next) => {
  const eventsCount = await prisma.event.count();

  if (eventsCount === 0) {
    return res.status(200).json({ message: "No events to delete." });
  }

  if (eventsCount === 0) {
    return res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "No events to delete.",
      data: {
        deletedCount: 0,
      },
    });
  }

  await prisma.event.deleteMany({});

  res.status(200).json({ message: "All events deleted successfully." });
});

export const getEventById = asyncHandler(async (req, res, _next) => {
  const { eventId } = req.params;

  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }

  const event = await prisma.event.findUnique({
    where: { id: parseInt(eventId) },
    include: {
      location: true,
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  console.log("Event Requested: ", event);
  res.status(200).json({ message: "Event successfully fetched.", data: event });
});

export const getAllEvents = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || "";
  const type = req.query.type;
  const location = req.query.location;

  const whereClause = {};

  if (search) {
    whereClause.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { type: { contains: search, mode: "insensitive" } },
      { location: { city: { contains: search, mode: "insensitive" } } },
    ];
  }

  if (type) {
    whereClause.type = type;
  }

  if (location) {
    whereClause.location = {
      OR: [
        { name: { contains: location, mode: "insensitive" } },
        { city: { contains: location, mode: "insensitive" } },
        { country: { contains: location, mode: "insensitive" } },
      ],
    };
  }

  const [events, totalRecords] = await Promise.all([
    prisma.event.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        location: true,
      },
    }),
    prisma.event.count({ where: whereClause }),
  ]);

  if (events.length === 0) {
    return res.status(200).json({
      message: "There are no events at the moment.",
      data: [],
      pagination: {
        totalRecords: 0,
        page,
        limit,
        totalPages: 0,
      },
    });
  }

  res.status(200).json({
    message: "Events successfully fetched.",
    data: events,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  });
});
