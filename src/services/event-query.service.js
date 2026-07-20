// src/services/event-query.service.js
//
// Event reads: single fetch and the filtered list. Both go through
// findFirst/findMany so the soft-delete scope hides deleted events.
//
// For ATTENDANT viewers both reads also attach the viewer context the client
// renders its sign-in/out buttons from: `currentSession` (today's session on
// the venue calendar, or null) and `viewerAttendance` (the caller's row for
// that session, or null). Batched here so a page of events costs ONE session
// query and ONE attendance query instead of a client-side request per card.
import { prisma } from "../config/prisma-client.js";
import { NotFoundError } from "../middleware/error-handler.js";
import { eventCalendarDay } from "../utils/time-context.js";
import { parseSearchFilter } from "./attendance-query.service.js";

/** The wire shape of viewerAttendance; autoCheckedOut is part of the
 * contract so the client can label a system sign-out as such. */
const toViewerAttendance = (row) =>
  row
    ? {
        sessionId: row.sessionId,
        status: row.status,
        checkInTime: row.checkInTime,
        checkOutTime: row.checkOutTime,
        autoCheckedOut: row.autoCheckedOut,
      }
    : null;

const toCurrentSession = (session) =>
  session
    ? { id: session.id, startDate: session.startDate, endDate: session.endDate }
    : null;

/**
 * Today's session (venue calendar day) per event id, plus the viewer's
 * attendance rows for those sessions - two queries for the whole page.
 */
async function loadViewerContext(eventIds, viewerId) {
  if (eventIds.length === 0) return new Map();

  const today = eventCalendarDay();
  const sessions = await prisma.session.findMany({
    where: {
      eventId: { in: eventIds },
      startDate: { lte: today },
      endDate: { gte: today },
    },
    orderBy: { startDate: "desc" },
  });

  // Newest-first ordering means the first session seen per event wins,
  // matching resolveActiveSession's pick.
  const sessionByEvent = new Map();
  for (const session of sessions) {
    if (!sessionByEvent.has(session.eventId)) {
      sessionByEvent.set(session.eventId, session);
    }
  }

  const sessionIds = [...sessionByEvent.values()].map((s) => s.id);
  const attendances = sessionIds.length
    ? await prisma.attendance.findMany({
        where: { userId: viewerId, sessionId: { in: sessionIds } },
      })
    : [];
  const attendanceBySession = new Map(
    attendances.map((row) => [row.sessionId, row])
  );

  const context = new Map();
  for (const eventId of eventIds) {
    const session = sessionByEvent.get(eventId) ?? null;
    context.set(eventId, {
      currentSession: toCurrentSession(session),
      viewerAttendance: toViewerAttendance(
        session ? (attendanceBySession.get(session.id) ?? null) : null
      ),
    });
  }
  return context;
}

const isAttendantViewer = (viewer) => viewer?.kind === "USER";

/**
 * Single event with its location; soft-deleted events read as absent.
 * Attendant viewers get currentSession/viewerAttendance attached; admins get
 * the bare event (they have no attendance to report).
 */
export async function getEventById(eventId, viewer) {
  const event = await prisma.event.findFirst({
    where: { id: eventId },
    include: {
      location: true,
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  if (!isAttendantViewer(viewer)) return event;

  const context = await loadViewerContext([event.id], Number(viewer.id));
  return { ...event, ...context.get(event.id) };
}

/** Paginated event list with search, type, and location filters. */
export async function listEvents({
  skip,
  limit,
  search: rawSearch,
  type: rawType,
  location: rawLocation,
  viewer,
}) {
  const whereClause = {};

  // Scalar coercion for every free-text filter: `?search[]=x` (an array)
  // must 400 as a bad filter, never reach Prisma as a non-string.
  const search = parseSearchFilter(rawSearch);
  const type = parseSearchFilter(rawType);
  const location = parseSearchFilter(rawLocation);

  // Attendants never see archived events; check-in on them is closed and
  // listing them only invites dead-end taps. Admins keep the full list for
  // management.
  if (viewer?.kind === "USER") {
    whereClause.archived = false;
  }

  if (search) {
    // One search box covers everything a user might type: title,
    // description, type, and the full location (name/city/country).
    whereClause.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { description: { contains: search, mode: "insensitive" } },
      { type: { contains: search, mode: "insensitive" } },
      { location: { name: { contains: search, mode: "insensitive" } } },
      { location: { city: { contains: search, mode: "insensitive" } } },
      { location: { country: { contains: search, mode: "insensitive" } } },
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

  const [events, total] = await Promise.all([
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

  if (!isAttendantViewer(viewer)) {
    return { events, total };
  }

  const context = await loadViewerContext(
    events.map((e) => e.id),
    Number(viewer.id)
  );
  return {
    events: events.map((event) => ({ ...event, ...context.get(event.id) })),
    total,
  };
}
