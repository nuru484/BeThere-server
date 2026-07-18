// src/services/dashboard-admin.service.js
//
// Admin dashboard aggregations: platform totals and the all-users
// attendance time series with status breakdowns.
import { format } from "date-fns";
import { prisma } from "../config/prisma-client.js";
import { parseDateRange } from "./dashboard-user.service.js";

/** User and event totals for the admin landing cards. */
export async function getAdminDashboardTotals() {
  const [totalUsers, totalRecurringEvents, totalNonRecurringEvents] =
    await Promise.all([
      prisma.user.count(),

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
    ]);

  return {
    totalUsers,
    totalRecurringEvents,
    totalNonRecurringEvents,
    totalEvents: totalRecurringEvents + totalNonRecurringEvents,
  };
}

/** Everyone's attendance in a date range, shaped for the admin charts. */
export async function getAllUsersAttendanceData(startDate, endDate) {
  const { start, end } = parseDateRange(startDate, endDate);

  // Narrow select: the aggregation below only reads userId/status/
  // checkInTime and the event's isRecurring flag. Pulling full user and
  // event records for every attendance row multiplied the payload roughly
  // tenfold and made a wide date range a memory hazard.
  const attendances = await prisma.attendance.findMany({
    where: {
      checkInTime: {
        gte: start,
        lte: end,
      },
    },
    select: {
      userId: true,
      status: true,
      checkInTime: true,
      session: {
        select: {
          event: {
            select: {
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

  // Group attendance by date for line chart
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
        uniqueUsers: new Set(),
      };
    }

    attendanceByDate[date].total++;
    attendanceByDate[date].uniqueUsers.add(attendance.userId);

    // Count by status
    if (attendance.status === "PRESENT") {
      attendanceByDate[date].present++;
    } else if (attendance.status === "LATE") {
      attendanceByDate[date].late++;
    } else if (attendance.status === "ABSENT") {
      attendanceByDate[date].absent++;
    }
  });

  // Convert to array and format for line chart
  const timeSeriesData = Object.values(attendanceByDate)
    .map((day) => ({
      date: day.date,
      total: day.total,
      present: day.present,
      late: day.late,
      absent: day.absent,
      uniqueUsers: day.uniqueUsers.size,
    }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  // Calculate overall statistics for bar chart (percentages)
  const totalAttendances = attendances.length;
  const presentCount = attendances.filter((a) => a.status === "PRESENT").length;
  const lateCount = attendances.filter((a) => a.status === "LATE").length;
  const absentCount = attendances.filter((a) => a.status === "ABSENT").length;

  const statusPercentages = {
    present:
      totalAttendances > 0
        ? ((presentCount / totalAttendances) * 100).toFixed(2)
        : "0.00",
    late:
      totalAttendances > 0
        ? ((lateCount / totalAttendances) * 100).toFixed(2)
        : "0.00",
    absent:
      totalAttendances > 0
        ? ((absentCount / totalAttendances) * 100).toFixed(2)
        : "0.00",
  };

  const statusCounts = {
    present: presentCount,
    late: lateCount,
    absent: absentCount,
    total: totalAttendances,
  };

  // Calculate additional insights
  const uniqueUsersAttended = new Set(attendances.map((a) => a.userId)).size;
  const recurringEventAttendances = attendances.filter(
    (a) => a.session.event.isRecurring
  ).length;
  const nonRecurringEventAttendances = attendances.filter(
    (a) => !a.session.event.isRecurring
  ).length;

  // Summary statistics
  const summary = {
    dateRange: {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
    },
    totalAttendances,
    uniqueUsersAttended,
    statusCounts,
    statusPercentages,
    eventTypeBreakdown: {
      recurring: recurringEventAttendances,
      nonRecurring: nonRecurringEventAttendances,
    },
  };

  return {
    summary,
    timeSeriesData, // For line chart: attendance over time
    statusPercentages, // For bar chart: percentage breakdown
    statusCounts, // For bar chart: actual counts
  };
}
