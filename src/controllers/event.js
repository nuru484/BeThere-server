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

const handleCreateEvent = asyncHandler(async (req, res, next) => {
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

  return res.status(HTTP_STATUS_CODES.CREATED || 201).json({
    message: "Event created successfully",
    data: event,
  });
});

export const createEvent = [
  validationMiddleware.create(createEventValidation),
  handleCreateEvent,
];

export const handleUpdateEvent = asyncHandler(async (req, res, next) => {
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
    include: { location: true },
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
    include: { location: true },
  });

  return res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Event updated successfully",
    data: updatedEvent,
  });
});

export const updateEvent = [
  validationMiddleware.create(updateEventValidation),
  handleUpdateEvent,
];

export const deleteEvent = asyncHandler(async (req, res, next) => {
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

export const deleteAllEvents = asyncHandler(async (req, res, next) => {
  const eventsCount = await prisma.event.count();

  if (eventsCount === 0) {
    return res.status(200).json({ message: "No events to delete." });
  }

  if (userCount === 0) {
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

export const getEventById = asyncHandler(async (req, res, next) => {
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

  res.status(200).json({ message: "Event successfully fetched.", data: event });
});

export const getAllEvents = asyncHandler(async (req, res, next) => {
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
