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

  if (eventName) {
    eventFilters.title = { contains: eventName, mode: "insensitive" };
  }

  if (isRecurring !== undefined) {
    const recurringValue = isRecurring === "true" || isRecurring === true;
    eventFilters.isRecurring = recurringValue;
  }

  if (eventType) {
    eventFilters.type = { contains: eventType, mode: "insensitive" };
  }

  const locationFilters = {};

  if (locationName) {
    locationFilters.name = { contains: locationName, mode: "insensitive" };
  }

  if (city) {
    locationFilters.city = { contains: city, mode: "insensitive" };
  }

  if (country) {
    locationFilters.country = { contains: country, mode: "insensitive" };
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

  if (search) {
    whereClause.OR = [
      { user: { firstName: { contains: search, mode: "insensitive" } } },
      { user: { lastName: { contains: search, mode: "insensitive" } } },
      { user: { email: { contains: search, mode: "insensitive" } } },
      {
        session: {
          event: { title: { contains: search, mode: "insensitive" } },
        },
      },
      {
        session: {
          event: { description: { contains: search, mode: "insensitive" } },
        },
      },
      {
        session: { event: { type: { contains: search, mode: "insensitive" } } },
      },
      {
        session: {
          event: {
            location: { name: { contains: search, mode: "insensitive" } },
          },
        },
      },
      {
        session: {
          event: {
            location: { city: { contains: search, mode: "insensitive" } },
          },
        },
      },
      {
        session: {
          event: {
            location: { country: { contains: search, mode: "insensitive" } },
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

  return Promise.all(
    topAttendeesQuery.map(async (attendee) => {
      // findUnique ON PURPOSE: attendance history survives soft deletion,
      // so a deleted account must still resolve for historical reports.
      const user = await prisma.user.findUnique({
        where: { id: attendee.userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          profilePicture: true,
        },
      });

      return {
        userId: attendee.userId,
        userName: `${user.firstName} ${user.lastName}`,
        email: user.email,
        profilePicture: user.profilePicture,
        attendanceCount: attendee._count.id,
      };
    })
  );
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

  const [topAttendees, presentCount, lateCount, absentCount] =
    await Promise.all([
      findTopAttendees(whereClause),
      prisma.attendance.count({
        where: { ...whereClause, status: "PRESENT" },
      }),
      prisma.attendance.count({
        where: { ...whereClause, status: "LATE" },
      }),
      prisma.attendance.count({
        where: { ...whereClause, status: "ABSENT" },
      }),
    ]);

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
