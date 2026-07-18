// src/services/dashboard-user.service.js
//
// User-facing dashboard aggregations: event/session totals, the recent
// events strip, and the per-user attendance time series.
import { startOfDay, endOfDay, format } from "date-fns";
import { prisma } from "../config/prisma-client.js";
import { ValidationError } from "../middleware/error-handler.js";
import { currentTimeStringInEventTz } from "../utils/time-context.js";

/** Event and session totals, with active sessions counted for right now. */
export async function getUserDashboardTotals() {
  const now = new Date();
  const currentDate = startOfDay(now);

  const currentTimeString = currentTimeStringInEventTz(now);

  // Sessions whose date range covers today. Filtering in SQL keeps this
  // bounded (previously EVERY session row plus its event was loaded into
  // memory just to count the active ones); only the time-window check runs
  // in JS because start/end times are "HH:MM" strings on the event.
  const startOfTomorrow = new Date(currentDate);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const [
    totalRecurringEvents,
    totalNonRecurringEvents,
    totalSessions,
    todaysSessions,
  ] = await Promise.all([
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

    prisma.session.count(),

    prisma.session.findMany({
      where: {
        startDate: { lt: startOfTomorrow },
        endDate: { gte: currentDate },
      },
      select: {
        event: { select: { startTime: true, endTime: true } },
      },
    }),
  ]);

  const totalActiveSessions = todaysSessions.filter(
    (session) =>
      currentTimeString >= session.event.startTime &&
      currentTimeString <= session.event.endTime
  ).length;
  const totalInactiveSessions = totalSessions - totalActiveSessions;

  return {
    totalRecurringEvents,
    totalNonRecurringEvents,
    totalActiveSessions,
    totalInactiveSessions,
  };
}

/** The five most recently created events, trimmed for the dashboard strip. */
export async function getRecentEvents() {
  return prisma.event.findMany({
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
}

/** Validates a YYYY-MM-DD range and returns its day-precision endpoints. */
export function parseDateRange(startDate, endDate) {
  if (!startDate || !endDate) {
    throw new ValidationError("Both startDate and endDate are required.");
  }

  const start = startOfDay(new Date(startDate));
  const end = endOfDay(new Date(endDate));

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new ValidationError("Invalid date format. Use YYYY-MM-DD format.");
  }

  if (start > end) {
    throw new ValidationError("startDate cannot be after endDate.");
  }

  return { start, end };
}

/** One user's attendance in a date range, grouped by day with a summary. */
export async function getUserAttendanceData(userId, startDate, endDate) {
  const { start, end } = parseDateRange(startDate, endDate);

  const attendances = await prisma.attendance.findMany({
    where: {
      userId,
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

  return {
    summary,
    attendanceByDate: attendanceData,
  };
}
