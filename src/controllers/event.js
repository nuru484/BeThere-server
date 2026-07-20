// src/controllers/event.js
//
// Thin HTTP adapters over the event services: parse/validate input, call a
// service, shape the { message, data, meta? } envelope.
import { asyncHandler } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  createEventValidation,
  updateEventValidation,
} from "../validation/event.js";
import { parsePagination } from "../utils/pagination.js";
import { parseId } from "../utils/parse-id.js";
import { sendPage } from "./shared.js";
import * as eventService from "../services/event.service.js";
import * as eventQueryService from "../services/event-query.service.js";
import {
  ensureVenueSecret,
  upcomingCodes,
} from "../services/venue-code.service.js";
import { VENUE_CODE } from "../config/constants.js";
import { NotFoundError } from "../middleware/error-handler.js";

// Admin venue display: a batch of upcoming rotating codes the display renders
// as a QR and cycles through locally (so it never polls the server every 30s).
// The venue secret itself is never returned.
export const getVenueCodes = asyncHandler(async (req, res, _next) => {
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");
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
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");

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
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");

  await eventService.deleteEvent(eventId);

  res.status(HTTP_STATUS_CODES.OK).json({
    message: "Event deleted successfully.",
  });
});

export const getEventById = asyncHandler(async (req, res, _next) => {
  const eventId = parseId(req.params.eventId, "Valid event ID is required.");

  const data = await eventQueryService.getEventById(eventId, req.user);

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
    search: req.query.search,
    type: req.query.type,
    location: req.query.location,
    viewer: req.user,
  });

  sendPage(res, {
    message: "Events successfully fetched.",
    emptyMessage: "There are no events at the moment.",
    rows: events,
    total,
    page,
    limit,
  });
});
