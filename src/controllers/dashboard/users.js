// src/controllers/dashboard/users.js
import { prisma } from "../../config/prisma-client.js";
import {
  asyncHandler,
  ValidationError,
} from "../../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../../config/constants.js";
import { startOfDay, endOfDay, format } from "date-fns";

export const getUserDashboardTotals = asyncHandler(async (req, res, _next) => {
  const now = new Date();
  const currentDate = startOfDay(now);

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTimeString = `${currentHour
    .toString()
    .padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

  const [totalRecurringEvents, totalNonRecurringEvents, allSessions] =
    await Promise.all([
      prisma.event.count({
        where: {
          isRecurring: true,
        },
      }),

      prisma.event.count({
        where: {
          isRecurring: false,
        },
      }),

      prisma.session.findMany({
        include: {
          event: true,
        },
      }),
    ]);

  let totalActiveSessions = 0;
  let totalInactiveSessions = 0;

  allSessions.forEach((session) => {
    const sessionStartDate = startOfDay(new Date(session.startDate));
    const sessionEndDate = startOfDay(new Date(session.endDate));

    const isWithinDateRange =
      currentDate >= sessionStartDate && currentDate <= sessionEndDate;

    const eventStartTime = session.event.startTime;
    const eventEndTime = session.event.endTime;
    const isWithinTimeWindow =
      currentTimeString >= eventStartTime && currentTimeString <= eventEndTime;

    if (isWithinDateRange && isWithinTimeWindow) {
      totalActiveSessions++;
    } else {
      totalInactiveSessions++;
    }
  });

  const totals = {
    totalRecurringEvents,
    totalNonRecurringEvents,
    totalActiveSessions,
    totalInactiveSessions,
  };

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Dashboard totals fetched successfully",
    data: totals,
  });
});

export const getRecentEvents = asyncHandler(async (req, res, _next) => {
  const recentEvents = await prisma.event.findMany({
    take: 5,
    orderBy: {
      createdAt: "desc",
    },
    select: {
      title: true,
      description: true,
      startTime: true,
      endTime: true,
      location: {
        select: {
          name: true,
          city: true,
        },
      },
    },
  });

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Recent events fetched successfully",
    data: recentEvents,
  });
});

export const getUserAttendanceData = asyncHandler(async (req, res, _next) => {
  const userId = req.user.id;
  const { startDate, endDate } = req.query;

  // Validate date parameters
  if (!startDate || !endDate) {
    throw new ValidationError("Both startDate and endDate are required.");
  }

  const start = startOfDay(new Date(startDate));
  const end = endOfDay(new Date(endDate));

  // Validate date range
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ValidationError("Invalid date format. Use YYYY-MM-DD format.");
  }

  if (start > end) {
    throw new ValidationError("startDate cannot be after endDate.");
  }

  // Fetch user's attendance within the date range
  const attendances = await prisma.attendance.findMany({
    where: {
      userId: parseInt(userId),
      checkInTime: {
        gte: start,
        lte: end,
      },
    },
    include: {
      session: {
        include: {
          event: {
            select: {
              title: true,
              isRecurring: true,
            },
          },
        },
      },
    },
    orderBy: {
      checkInTime: "asc",
    },
  });

  const attendanceByDate = {};

  attendances.forEach((attendance) => {
    const date = format(new Date(attendance.checkInTime), "yyyy-MM-dd");

    if (!attendanceByDate[date]) {
      attendanceByDate[date] = {
        date,
        total: 0,
        present: 0,
        late: 0,
        absent: 0,
        recurringEvents: 0,
        nonRecurringEvents: 0,
        events: [],
      };
    }

    attendanceByDate[date].total++;

    // Count by status
    if (attendance.status === "PRESENT") {
      attendanceByDate[date].present++;
    } else if (attendance.status === "LATE") {
      attendanceByDate[date].late++;
    } else if (attendance.status === "ABSENT") {
      attendanceByDate[date].absent++;
    }

    // Count by event type
    if (attendance.session.event.isRecurring) {
      attendanceByDate[date].recurringEvents++;
    } else {
      attendanceByDate[date].nonRecurringEvents++;
    }

    // Track unique events
    if (
      !attendanceByDate[date].events.includes(attendance.session.event.title)
    ) {
      attendanceByDate[date].events.push(attendance.session.event.title);
    }
  });

  // Convert to array and sort by date
  const attendanceData = Object.values(attendanceByDate).sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );

  // Calculate summary statistics
  const summary = {
    totalAttendances: attendances.length,
    dateRange: {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
    },
    statusBreakdown: {
      present: attendances.filter((a) => a.status === "PRESENT").length,
      late: attendances.filter((a) => a.status === "LATE").length,
      absent: attendances.filter((a) => a.status === "ABSENT").length,
    },
    eventTypeBreakdown: {
      recurring: attendances.filter((a) => a.session.event.isRecurring).length,
      nonRecurring: attendances.filter((a) => !a.session.event.isRecurring)
        .length,
    },
  };

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "User attendance data fetched successfully",
    data: {
      summary,
      attendanceByDate: attendanceData,
    },
  });
});
