// src/controllers/attendance-reports.js
import prisma from "../config/prisma-client.js";
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { startOfDay, endOfDay, parseISO } from "date-fns";

export const getAttendanceReport = asyncHandler(async (req, res, _next) => {
  const {
    startDate,
    endDate,
    eventId,
    userId,
    status,
    eventType,
    locationId,
    groupBy = "event",
  } = req.query;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 50;
  const skip = (page - 1) * limit;

  const whereClause = {};

  if (startDate || endDate) {
    whereClause.checkInTime = {};
    if (startDate) {
      whereClause.checkInTime.gte = startOfDay(parseISO(startDate));
    }
    if (endDate) {
      whereClause.checkInTime.lte = endOfDay(parseISO(endDate));
    }
  }

  if (eventId) {
    if (isNaN(parseInt(eventId))) {
      throw new ValidationError("Valid event ID is required.");
    }
    whereClause.session = { eventId: parseInt(eventId) };
  }

  if (userId) {
    if (isNaN(parseInt(userId))) {
      throw new ValidationError("Valid user ID is required.");
    }
    whereClause.userId = parseInt(userId);
  }

  if (status) {
    const validStatuses = ["PRESENT", "LATE", "ABSENT"];
    if (!validStatuses.includes(status.toUpperCase())) {
      throw new ValidationError(
        "Invalid status. Must be one of: PRESENT, LATE, ABSENT"
      );
    }
    whereClause.status = status.toUpperCase();
  }

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

  if (locationId) {
    if (isNaN(parseInt(locationId))) {
      throw new ValidationError("Valid location ID is required.");
    }
    if (!whereClause.session) {
      whereClause.session = {};
    }
    if (whereClause.session.event) {
      whereClause.session.event.locationId = parseInt(locationId);
    } else {
      whereClause.session.event = { locationId: parseInt(locationId) };
    }
  }

  const [attendances, totalRecords] = await Promise.all([
    prisma.attendance.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: {
        checkInTime: "desc",
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            profilePicture: true,
            role: true,
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
      },
    }),
    prisma.attendance.count({ where: whereClause }),
  ]);

  const statistics = await calculateAttendanceStatistics(whereClause);

  let groupedData = null;
  if (attendances.length > 0) {
    groupedData = groupAttendanceData(attendances, groupBy);
  }

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Attendance report generated successfully.",
    data: attendances,
    statistics,
    groupedData,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
    filters: {
      startDate: startDate || null,
      endDate: endDate || null,
      eventId: eventId || null,
      userId: userId || null,
      status: status || null,
      eventType: eventType || null,
      locationId: locationId || null,
      groupBy,
    },
  });
});

/**
 * Get attendance summary statistics
 */
export const getAttendanceSummary = asyncHandler(async (req, res, _next) => {
  const { startDate, endDate, eventId, userId } = req.query;

  const whereClause = {};

  if (startDate || endDate) {
    whereClause.checkInTime = {};
    if (startDate) {
      whereClause.checkInTime.gte = startOfDay(parseISO(startDate));
    }
    if (endDate) {
      whereClause.checkInTime.lte = endOfDay(parseISO(endDate));
    }
  }

  if (eventId) {
    if (isNaN(parseInt(eventId))) {
      throw new ValidationError("Valid event ID is required.");
    }
    whereClause.session = { eventId: parseInt(eventId) };
  }

  if (userId) {
    if (isNaN(parseInt(userId))) {
      throw new ValidationError("Valid user ID is required.");
    }
    whereClause.userId = parseInt(userId);
  }

  const statistics = await calculateAttendanceStatistics(whereClause);

  const topAttendees = await prisma.attendance.groupBy({
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
    take: 10,
  });

  const topAttendeesWithDetails = await Promise.all(
    topAttendees.map(async (attendee) => {
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
        user,
        attendanceCount: attendee._count.id,
      };
    })
  );

  const topEvents = await prisma.attendance.findMany({
    where: whereClause,
    include: {
      session: {
        include: {
          event: {
            include: {
              location: true,
            },
          },
        },
      },
    },
  });

  const eventAttendanceCounts = {};
  topEvents.forEach((attendance) => {
    const eventId = attendance.session.event.id;
    if (!eventAttendanceCounts[eventId]) {
      eventAttendanceCounts[eventId] = {
        event: attendance.session.event,
        count: 0,
      };
    }
    eventAttendanceCounts[eventId].count++;
  });

  const topEventsSorted = Object.values(eventAttendanceCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Attendance summary generated successfully.",
    statistics,
    topAttendees: topAttendeesWithDetails,
    topEvents: topEventsSorted,
    filters: {
      startDate: startDate || null,
      endDate: endDate || null,
      eventId: eventId || null,
      userId: userId || null,
    },
  });
});

/**
 * Get attendance rate by event
 */
export const getEventAttendanceRate = asyncHandler(async (req, res, _next) => {
  const { eventId } = req.params;
  const currentUserRole = req.user.role;

  if (currentUserRole !== "ADMIN") {
    throw new UnauthorizedError(
      "Only administrators can access attendance rates."
    );
  }

  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }

  const event = await prisma.event.findUnique({
    where: { id: parseInt(eventId) },
    include: {
      location: true,
      sessions: {
        include: {
          attendances: {
            include: {
              user: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
        orderBy: {
          startDate: "desc",
        },
      },
    },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  const totalUsers = await prisma.user.count({
    where: { role: "USER" },
  });

  // Calculate attendance statistics per session
  const sessionStats = event.sessions.map((session) => {
    const totalAttendances = session.attendances.length;
    const presentCount = session.attendances.filter(
      (a) => a.status === "PRESENT"
    ).length;
    const lateCount = session.attendances.filter(
      (a) => a.status === "LATE"
    ).length;
    const absentCount = session.attendances.filter(
      (a) => a.status === "ABSENT"
    ).length;

    return {
      sessionId: session.id,
      startDate: session.startDate,
      endDate: session.endDate,
      totalAttendances,
      presentCount,
      lateCount,
      absentCount,
      attendanceRate:
        totalUsers > 0 ? (totalAttendances / totalUsers) * 100 : 0,
      presentRate:
        totalAttendances > 0 ? (presentCount / totalAttendances) * 100 : 0,
    };
  });

  // Overall event statistics
  const totalAttendances = event.sessions.reduce(
    (sum, session) => sum + session.attendances.length,
    0
  );
  const totalPresent = event.sessions.reduce(
    (sum, session) =>
      sum + session.attendances.filter((a) => a.status === "PRESENT").length,
    0
  );
  const totalLate = event.sessions.reduce(
    (sum, session) =>
      sum + session.attendances.filter((a) => a.status === "LATE").length,
    0
  );
  const totalAbsent = event.sessions.reduce(
    (sum, session) =>
      sum + session.attendances.filter((a) => a.status === "ABSENT").length,
    0
  );

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Event attendance rate calculated successfully.",
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      type: event.type,
      location: event.location,
    },
    overallStatistics: {
      totalSessions: event.sessions.length,
      totalAttendances,
      totalPresent,
      totalLate,
      totalAbsent,
      averageAttendanceRate:
        event.sessions.length > 0
          ? sessionStats.reduce((sum, s) => sum + s.attendanceRate, 0) /
            event.sessions.length
          : 0,
      presentRate:
        totalAttendances > 0 ? (totalPresent / totalAttendances) * 100 : 0,
    },
    sessionStats,
  });
});

/**
 * Get user attendance rate
 */
export const getUserAttendanceRate = asyncHandler(async (req, res, _next) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;

  const targetUserId = parseInt(userId);

  if (
    targetUserId !== parseInt(currentUserId?.toString() || "0") &&
    currentUserRole !== "ADMIN"
  ) {
    throw new UnauthorizedError(
      "Only admins can access other users' attendance rates."
    );
  }

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profilePicture: true,
      role: true,
    },
  });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  const { startDate, endDate } = req.query;

  const whereClause = {
    userId: parseInt(userId),
  };

  if (startDate || endDate) {
    whereClause.checkInTime = {};
    if (startDate) {
      whereClause.checkInTime.gte = startOfDay(parseISO(startDate));
    }
    if (endDate) {
      whereClause.checkInTime.lte = endOfDay(parseISO(endDate));
    }
  }

  const attendances = await prisma.attendance.findMany({
    where: whereClause,
    include: {
      session: {
        include: {
          event: {
            include: {
              location: true,
            },
          },
        },
      },
    },
  });

  const statistics = {
    totalAttendances: attendances.length,
    presentCount: attendances.filter((a) => a.status === "PRESENT").length,
    lateCount: attendances.filter((a) => a.status === "LATE").length,
    absentCount: attendances.filter((a) => a.status === "ABSENT").length,
  };

  statistics.presentRate =
    statistics.totalAttendances > 0
      ? (statistics.presentCount / statistics.totalAttendances) * 100
      : 0;
  statistics.lateRate =
    statistics.totalAttendances > 0
      ? (statistics.lateCount / statistics.totalAttendances) * 100
      : 0;
  statistics.absentRate =
    statistics.totalAttendances > 0
      ? (statistics.absentCount / statistics.totalAttendances) * 100
      : 0;

  // Group by event
  const eventStats = {};
  attendances.forEach((attendance) => {
    const eventId = attendance.session.event.id;
    if (!eventStats[eventId]) {
      eventStats[eventId] = {
        event: attendance.session.event,
        attendances: [],
      };
    }
    eventStats[eventId].attendances.push(attendance);
  });

  const eventAttendanceRates = Object.values(eventStats).map((stat) => {
    const total = stat.attendances.length;
    const present = stat.attendances.filter(
      (a) => a.status === "PRESENT"
    ).length;
    const late = stat.attendances.filter((a) => a.status === "LATE").length;

    return {
      event: {
        id: stat.event.id,
        title: stat.event.title,
        type: stat.event.type,
        location: stat.event.location,
      },
      totalAttendances: total,
      presentCount: present,
      lateCount: late,
      presentRate: total > 0 ? (present / total) * 100 : 0,
    };
  });

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "User attendance rate calculated successfully.",
    user,
    overallStatistics: statistics,
    eventAttendanceRates,
    filters: {
      startDate: startDate || null,
      endDate: endDate || null,
    },
  });
});

// Helper function to calculate attendance statistics
async function calculateAttendanceStatistics(whereClause) {
  const [total, present, late, absent] = await Promise.all([
    prisma.attendance.count({ where: whereClause }),
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
    total,
    present,
    late,
    absent,
    presentPercentage: total > 0 ? ((present / total) * 100).toFixed(2) : 0,
    latePercentage: total > 0 ? ((late / total) * 100).toFixed(2) : 0,
    absentPercentage: total > 0 ? ((absent / total) * 100).toFixed(2) : 0,
  };
}

function groupAttendanceData(attendances, groupBy) {
  const grouped = {};

  attendances.forEach((attendance) => {
    let key;

    switch (groupBy) {
      case "event":
        key = attendance.session.event.title;
        break;
      case "user":
        key = `${attendance.user.firstName} ${attendance.user.lastName}`;
        break;
      case "date":
        key = attendance.checkInTime.toISOString().split("T")[0];
        break;
      case "status":
        key = attendance.status;
        break;
      default:
        key = attendance.session.event.title;
    }

    if (!grouped[key]) {
      grouped[key] = {
        key,
        count: 0,
        attendances: [],
        present: 0,
        late: 0,
        absent: 0,
      };
    }

    grouped[key].count++;
    grouped[key].attendances.push(attendance);
    grouped[key][attendance.status.toLowerCase()]++;
  });

  return Object.values(grouped).sort((a, b) => b.count - a.count);
}
