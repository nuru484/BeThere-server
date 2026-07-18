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

const parseEventId = (eventId) => {
  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }
  return parseInt(eventId);
};

const handleCreateEvent = asyncHandler(async (req, res, _next) => {
  const data = await eventService.createEvent(req.body);

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

  const data = await eventService.updateEvent(eventId, req.body);

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
