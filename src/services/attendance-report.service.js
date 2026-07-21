// src/services/attendance-report.service.js
//
// The admin reports surface: a flattened attendance page plus the
// top-attendees leaderboard and a status summary, all under one filter set.
// Reuses the shared filter builders from the attendance query service.
import { prisma } from "../config/prisma-client.js";
import { ValidationError } from "../middleware/error-handler.js";
import {
  ATTENDANCE_LIST_INCLUDE,
  checkInTimeRange,
  parseSearchFilter,
  parseStatusFilter,
} from "./attendance-query.service.js";

/** Builds the reports where-clause from the (all optional) query filters. */
function buildReportWhere({
  search,
  userId,
  eventName,
  locationName,
  status,
  isRecurring,
  eventType,
  checkInStartDate,
  checkInEndDate,
  sessionStartDate,
  sessionEndDate,
  city,
  country,
}) {
  const whereClause = {};

  // Every free-text filter goes through the shared parser: Express turns
  // `?search[]=x` into an array, which must 400 as a bad filter instead of
  // reaching Prisma as a non-string `contains` value.
  const searchTerm = parseSearchFilter(search);
  const eventNameTerm = parseSearchFilter(eventName);
  const eventTypeTerm = parseSearchFilter(eventType);
  const locationNameTerm = parseSearchFilter(locationName);
  const cityTerm = parseSearchFilter(city);
  const countryTerm = parseSearchFilter(country);

  if (userId) {
    if (isNaN(parseInt(userId))) {
      throw new ValidationError("Valid user ID is required.");
    }
    whereClause.userId = parseInt(userId);
  }

  if (status) {
    whereClause.status = parseStatusFilter(status);
  }

  const sessionFilters = {};

  if (sessionStartDate || sessionEndDate) {
    sessionFilters.AND = [];

    if (sessionStartDate) {
      const startDate = new Date(sessionStartDate);
      sessionFilters.AND.push({
        startDate: { gte: startDate },
      });
    }

    if (sessionEndDate) {
      const endDate = new Date(sessionEndDate);
      endDate.setHours(23, 59, 59, 999);
      sessionFilters.AND.push({
        endDate: { lte: endDate },
      });
    }
  }

  const eventFilters = {};

  if (eventNameTerm) {
    eventFilters.title = { contains: eventNameTerm, mode: "insensitive" };
  }

  if (isRecurring !== undefined) {
    const recurringValue = isRecurring === "true" || isRecurring === true;
    eventFilters.isRecurring = recurringValue;
  }

  if (eventTypeTerm) {
    eventFilters.type = { contains: eventTypeTerm, mode: "insensitive" };
  }

  const locationFilters = {};

  if (locationNameTerm) {
    locationFilters.name = { contains: locationNameTerm, mode: "insensitive" };
  }

  if (cityTerm) {
    locationFilters.city = { contains: cityTerm, mode: "insensitive" };
  }

  if (countryTerm) {
    locationFilters.country = { contains: countryTerm, mode: "insensitive" };
  }

  // Combine all filters into session and event structure
  if (Object.keys(locationFilters).length > 0) {
    eventFilters.location = locationFilters;
  }

  if (Object.keys(eventFilters).length > 0) {
    sessionFilters.event = eventFilters;
  }

  if (Object.keys(sessionFilters).length > 0) {
    whereClause.session = sessionFilters;
  }

  if (searchTerm) {
    whereClause.OR = [
      { user: { firstName: { contains: searchTerm, mode: "insensitive" } } },
      { user: { lastName: { contains: searchTerm, mode: "insensitive" } } },
      { user: { email: { contains: searchTerm, mode: "insensitive" } } },
      {
        session: {
          event: { title: { contains: searchTerm, mode: "insensitive" } },
        },
      },
      {
        session: {
          event: { description: { contains: searchTerm, mode: "insensitive" } },
        },
      },
      {
        session: {
          event: { type: { contains: searchTerm, mode: "insensitive" } },
        },
      },
      {
        session: {
          event: {
            location: { name: { contains: searchTerm, mode: "insensitive" } },
          },
        },
      },
      {
        session: {
          event: {
            location: { city: { contains: searchTerm, mode: "insensitive" } },
          },
        },
      },
      {
        session: {
          event: {
            location: { country: { contains: searchTerm, mode: "insensitive" } },
          },
        },
      },
    ];
  }

  const range = checkInTimeRange(checkInStartDate, checkInEndDate);
  if (range) {
    whereClause.checkInTime = range;
  }

  return whereClause;
}

/** Flattens an attendance row (with session/event/location) for the report. */
function formatReportRow(attendance) {
  return {
    attendanceId: attendance.id,
    userName: `${attendance.user.firstName} ${attendance.user.lastName}`,
    userEmail: attendance.user.email,
    userId: attendance.user.id,
    eventTitle: attendance.session.event.title,
    eventId: attendance.session.event.id,
    eventType: attendance.session.event.type,
    isRecurring: attendance.session.event.isRecurring,
    sessionId: attendance.session.id,
    sessionStartDate: attendance.session.startDate,
    sessionEndDate: attendance.session.endDate,
    location: {
      id: attendance.session.event.location.id,
      name: attendance.session.event.location.name,
      city: attendance.session.event.location.city,
      country: attendance.session.event.location.country,
    },
    checkInTime: attendance.checkInTime,
    checkOutTime: attendance.checkOutTime,
    status: attendance.status,
    createdAt: attendance.createdAt,
  };
}

/** The five most frequent attendees under the current filter set. */
async function findTopAttendees(whereClause) {
  const topAttendeesQuery = await prisma.attendance.groupBy({
    by: ["userId"],
    where: whereClause,
    _count: {
      id: true,
    },
    orderBy: {
      _count: {
        id: "desc",
      },
    },
    take: 5,
  });

  // One IN query + Map join instead of a findUnique per attendee (N+1).
  // The empty deletedAt filter names the column explicitly, which opts out
  // of the soft-delete scope (see soft-delete-extension.js) without adding a
  // constraint: attendance history survives soft deletion, so a deleted
  // account must still resolve for historical reports.
  const users = await prisma.user.findMany({
    where: {
      id: { in: topAttendeesQuery.map((attendee) => attendee.userId) },
      deletedAt: {},
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
    },
  });
  const userById = new Map(users.map((user) => [user.id, user]));

  return topAttendeesQuery.map((attendee) => {
    const user = userById.get(attendee.userId);
    return {
      userId: attendee.userId,
      userName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      profilePicture: user.profilePicture,
      attendanceCount: attendee._count.id,
    };
  });
}

/** The full report payload: page rows, leaderboard, summary, and total. */
export async function getAttendanceReports({ skip, limit, ...filters }) {
  const whereClause = buildReportWhere(filters);

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

  // One groupBy instead of a count round-trip per status.
  const [topAttendees, statusGroups] = await Promise.all([
    findTopAttendees(whereClause),
    prisma.attendance.groupBy({
      by: ["status"],
      where: whereClause,
      _count: { _all: true },
    }),
  ]);

  const statusCount = (status) =>
    statusGroups.find((group) => group.status === status)?._count._all ?? 0;
  const presentCount = statusCount("PRESENT");
  const lateCount = statusCount("LATE");
  const absentCount = statusCount("ABSENT");

  return {
    items: attendances.map(formatReportRow),
    total,
    topAttendees,
    summary: {
      totalAttendance: total,
      presentCount,
      lateCount,
      absentCount,
    },
  };
}

// The most rows a single export will materialize. Reports are bounded
// summaries, not bulk dumps; beyond this the caller should narrow the filters.
export const EXPORT_ROW_CAP = 10000;

/**
 * The same filtered report, but ALL matching rows (up to the cap) with no
 * pagination - the shape the xlsx export consumes. Returns `truncated` so the
 * export can tell the user when the cap clipped the result.
 */
export async function getAttendanceReportForExport(filters) {
  const whereClause = buildReportWhere(filters);

  const [attendances, total, statusGroups, topAttendees] = await Promise.all([
    prisma.attendance.findMany({
      where: whereClause,
      take: EXPORT_ROW_CAP,
      orderBy: { checkInTime: { sort: "desc", nulls: "last" } },
      include: ATTENDANCE_LIST_INCLUDE,
    }),
    prisma.attendance.count({ where: whereClause }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: whereClause,
      _count: { _all: true },
    }),
    findTopAttendees(whereClause),
  ]);

  const statusCount = (status) =>
    statusGroups.find((group) => group.status === status)?._count._all ?? 0;

  return {
    rows: attendances.map(formatReportRow),
    total,
    truncated: total > EXPORT_ROW_CAP,
    topAttendees,
    summary: {
      totalAttendance: total,
      presentCount: statusCount("PRESENT"),
      lateCount: statusCount("LATE"),
      absentCount: statusCount("ABSENT"),
    },
  };
}
