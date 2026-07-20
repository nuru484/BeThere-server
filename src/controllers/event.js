// src/controllers/event.js
//
// Thin HTTP adapters over the event services: parse/validate input, call a
// service, shape the { message, data, meta? } envelope.
import {
  asyncHandler,
  ValidationError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  createEventValidation,
  updateEventValidation,
} from "../validation/event.js";
import { parsePagination, paginationMeta } from "../utils/pagination.js";
import * as eventService from "../services/event.service.js";
import * as eventQueryService from "../services/event-query.service.js";
import {
  ensureVenueSecret,
  upcomingCodes,
} from "../services/venue-code.service.js";
import { VENUE_CODE } from "../config/constants.js";
import { NotFoundError } from "../middleware/error-handler.js";

const parseEventId = (eventId) => {
  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }
  return parseInt(eventId);
};

// Admin venue display: a batch of upcoming rotating codes the display renders
// as a QR and cycles through locally (so it never polls the server every 30s).
// The venue secret itself is never returned.
export const getVenueCodes = asyncHandler(async (req, res, _next) => {
  const eventId = parseEventId(req.params.eventId);
  const secret = await ensureVenueSecret(eventId);
  if (!secret) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Venue codes issued.",
    data: {
      eventId,
      periodMs: VENUE_CODE.PERIOD_MS,
      codes: upcomingCodes(secret),
    },
  });
});

const handleCreateEvent = asyncHandler(async (req, res, _next) => {
  const data = await eventService.createEvent(req.body, req.file);

  res.status(HTTP_STATUS_CODES.CREATED).json({
    message: "Event created successfully",
    data,
  });
});

export const createEvent = [
  validationMiddleware.create(createEventValidation),
  handleCreateEvent,
];

const handleUpdateEvent = asyncHandler(async (req, res, _next) => {
  const eventId = parseEventId(req.params.eventId);

  const data = await eventService.updateEvent(eventId, req.body, req.file);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Event updated successfully",
    data,
  });
});

export const updateEvent = [
  validationMiddleware.create(updateEventValidation),
  handleUpdateEvent,
];

export const deleteEvent = asyncHandler(async (req, res, _next) => {
  const eventId = parseEventId(req.params.eventId);

  await eventService.deleteEvent(eventId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Event deleted successfully.",
  });
});

export const getEventById = asyncHandler(async (req, res, _next) => {
  const eventId = parseEventId(req.params.eventId);

  const data = await eventQueryService.getEventById(eventId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Event successfully fetched.",
    data,
  });
});

export const getAllEvents = asyncHandler(async (req, res, _next) => {
  const { page, limit, skip } = parsePagination(req.query);

  const { events, total } = await eventQueryService.listEvents({
    skip,
    limit,
    search: req.query.search || "",
    type: req.query.type,
    location: req.query.location,
  });

  if (events.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK).json({
      message: "There are no events at the moment.",
      data: [],
      meta: paginationMeta(0, page, limit),
    });
  }

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Events successfully fetched.",
    data: events,
    meta: paginationMeta(total, page, limit),
  });
});
