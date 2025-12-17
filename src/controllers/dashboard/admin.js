// src/controllers/dashboard/admin.js
import { prisma } from "../../config/prisma-client.js";
import {
  asyncHandler,
  ValidationError,
} from "../../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../../config/constants.js";
import { startOfDay, endOfDay, format } from "date-fns";

export const getAdminDashboardTotals = asyncHandler(async (req, res, _next) => {
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

  const totals = {
    totalUsers,
    totalRecurringEvents,
    totalNonRecurringEvents,
    totalEvents: totalRecurringEvents + totalNonRecurringEvents,
  };

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Admin dashboard totals fetched successfully",
    data: totals,
  });
});

export const getAllUsersAttendanceData = asyncHandler(
  async (req, res, _next) => {
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

    // Fetch all attendances within the date range
    const attendances = await prisma.attendance.findMany({
      where: {
        checkInTime: {
          gte: start,
          lte: end,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
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
    const presentCount = attendances.filter(
      (a) => a.status === "PRESENT"
    ).length;
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

    res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "All users attendance data fetched successfully",
      data: {
        summary,
        timeSeriesData, // For line chart: attendance over time
        statusPercentages, // For bar chart: percentage breakdown
        statusCounts, // For bar chart: actual counts
      },
    });
  }
);
