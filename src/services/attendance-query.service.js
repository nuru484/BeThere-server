// src/services/attendance-query.service.js
//
// The three attendance list surfaces (per user, per event, per user+event)
// plus the shared filter builders they and the reports service reuse.
import { prisma } from "../config/prisma-client.js";
import {
  NotFoundError,
  ValidationError,
} from "../middleware/error-handler.js";
import { assertSelfOrAdmin } from "../utils/authorization.js";

/** Every attendance list row carries a minimal user and the full session chain. */
export const ATTENDANCE_LIST_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
    },
  },
  session: {
    include: {
      event: {
        include: {
          location: true,
        },
      },
    },
  },
};

/** Validates and normalizes a status filter (PRESENT/LATE/ABSENT). */
export function parseStatusFilter(status) {
  const validStatuses = ["PRESENT", "LATE", "ABSENT"];
  if (!validStatuses.includes(status.toUpperCase())) {
    throw new ValidationError(
      "Invalid status. Must be one of: PRESENT, LATE, ABSENT"
    );
  }
  return status.toUpperCase();
}

/** Check-in time range filter; the end date is inclusive (end of that day). */
export function checkInTimeRange(startDate, endDate) {
  if (!startDate && !endDate) return undefined;

  const range = {};
  if (startDate) {
    range.gte = new Date(startDate);
  }
  if (endDate) {
    const endDateTime = new Date(endDate);
    endDateTime.setHours(23, 59, 59, 999);
    range.lte = endDateTime;
  }
  return range;
}

function parseSessionIdFilter(sessionId) {
  if (isNaN(parseInt(sessionId))) {
    throw new ValidationError("Valid session ID is required.");
  }
  return parseInt(sessionId);
}

/**
 * The filter core shared by every attendance list: user, event (via the
 * session), status, session, and check-in date range. Callers layer their
 * endpoint-specific search clauses on top.
 */
export function buildAttendanceWhere({
  userId,
  eventId,
  status,
  sessionId,
  startDate,
  endDate,
}) {
  const whereClause = {};

  if (userId !== undefined) {
    whereClause.userId = userId;
  }

  if (eventId !== undefined) {
    whereClause.session = { eventId };
  }

  if (status) {
    whereClause.status = parseStatusFilter(status);
  }

  if (sessionId) {
    whereClause.sessionId = parseSessionIdFilter(sessionId);
  }

  const range = checkInTimeRange(startDate, endDate);
  if (range) {
    whereClause.checkInTime = range;
  }

  return whereClause;
}

async function findAttendancePage(whereClause, { skip, limit }) {
  const [attendances, total] = await Promise.all([
    prisma.attendance.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: {
        checkInTime: "desc",
      },
      include: ATTENDANCE_LIST_INCLUDE,
    }),
    prisma.attendance.count({ where: whereClause }),
  ]);

  return { attendances, total };
}

/** A user's attendance across events; owner-or-admin. */
export async function listUserAttendance(
  actor,
  userId,
  { skip, limit, search, status, eventType, startDate, endDate }
) {
  assertSelfOrAdmin(
    actor,
    userId,
    "Only admins can access other users' attendance."
  );

  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  const whereClause = buildAttendanceWhere({
    userId,
    status,
    startDate,
    endDate,
  });

  // Search across event title, description, type, and location
  if (search) {
    whereClause.session = {
      event: {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { type: { contains: search, mode: "insensitive" } },
          {
            location: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
                { country: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        ],
      },
    };
  }

  // Filter by event type
  if (eventType) {
    if (!whereClause.session) {
      whereClause.session = {};
    }
    if (whereClause.session.event) {
      whereClause.session.event.type = eventType;
    } else {
      whereClause.session.event = { type: eventType };
    }
  }

  return findAttendancePage(whereClause, { skip, limit });
}

/** An event's attendance across users; admin route. */
export async function listEventAttendance(
  eventId,
  { skip, limit, search, status, sessionId, startDate, endDate }
) {
  // findFirst: a soft-deleted event reads as absent.
  const event = await prisma.event.findFirst({ where: { id: eventId } });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  const whereClause = buildAttendanceWhere({
    eventId,
    status,
    sessionId,
    startDate,
    endDate,
  });

  // Search across user details
  if (search) {
    whereClause.user = {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    };
  }

  return findAttendancePage(whereClause, { skip, limit });
}

/** One user's attendance within one event; owner-or-admin. */
export async function listUserEventAttendance(
  actor,
  userId,
  eventId,
  { skip, limit, status, sessionId, startDate, endDate }
) {
  assertSelfOrAdmin(
    actor,
    userId,
    "Only admins can access other users' attendance."
  );

  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  const event = await prisma.event.findFirst({ where: { id: eventId } });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  const whereClause = buildAttendanceWhere({
    userId,
    eventId,
    status,
    sessionId,
    startDate,
    endDate,
  });

  return findAttendancePage(whereClause, { skip, limit });
}
