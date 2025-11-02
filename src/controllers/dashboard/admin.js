import prisma from "../../config/prisma-client.js";
import { asyncHandler } from "../../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../../config/constants.js";
import { startOfDay, endOfDay } from "date-fns";

export const getSystemOverview = asyncHandler(async (req, res, _next) => {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  const totalEvents = await prisma.event.count();

  const activeSessions = await prisma.session.findMany({
    where: {
      startDate: {
        lte: todayEnd,
      },
      endDate: {
        gte: todayStart,
      },
    },
    include: {
      event: true,
    },
  });

  const activeSessionsNow = activeSessions.filter((session) => {
    const event = session.event;
    const [startHour, startMinute] = event.startTime.split(":").map(Number);
    const [endHour, endMinute] = event.endTime.split(":").map(Number);

    const sessionStartTime = new Date(now);
    sessionStartTime.setHours(startHour, startMinute, 0, 0);

    const sessionEndTime = new Date(now);
    sessionEndTime.setHours(endHour, endMinute, 0, 0);

    return now >= sessionStartTime && now <= sessionEndTime;
  });

  const totalUsers = await prisma.user.count();

  const usersByRole = await prisma.user.groupBy({
    by: ["role"],
    _count: {
      role: true,
    },
  });

  const roleBreakdown = usersByRole.reduce((acc, item) => {
    acc[item.role.toLowerCase()] = item._count.role;
    return acc;
  }, {});

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "System overview fetched successfully.",
    data: {
      totalEvents: totalEvents,
      activeSessionsToday: activeSessionsNow.length,
      totalSessionsToday: activeSessions.length,
      totalUsers: totalUsers,
      userBreakdown: {
        admins: roleBreakdown.admin || 0,
        users: roleBreakdown.user || 0,
      },
    },
  });
});

export const getAttendanceLeaderboard = asyncHandler(
  async (req, res, _next) => {
    const limit = parseInt(req.query.limit) || 5;
    const eventId = req.query.eventId;

    const whereClause = {};

    if (eventId && !isNaN(parseInt(eventId))) {
      whereClause.session = {
        eventId: parseInt(eventId),
      };
    }

    // Get all attendance records grouped by user
    const attendanceStats = await prisma.attendance.groupBy({
      by: ["userId", "status"],
      where: whereClause,
      _count: {
        status: true,
      },
    });

    // Organize data by user
    const userStatsMap = new Map();

    attendanceStats.forEach((stat) => {
      if (!userStatsMap.has(stat.userId)) {
        userStatsMap.set(stat.userId, {
          userId: stat.userId,
          present: 0,
          late: 0,
          absent: 0,
          total: 0,
        });
      }

      const userStats = userStatsMap.get(stat.userId);
      const count = stat._count.status;

      if (stat.status === "PRESENT") {
        userStats.present = count;
      } else if (stat.status === "LATE") {
        userStats.late = count;
      } else if (stat.status === "ABSENT") {
        userStats.absent = count;
      }

      userStats.total += count;
    });

    const userStatsArray = Array.from(userStatsMap.values()).map((stats) => ({
      ...stats,
      attended: stats.present + stats.late,
      attendanceRate:
        stats.total > 0
          ? Math.round(((stats.present + stats.late) / stats.total) * 100)
          : 0,
      absentRate:
        stats.total > 0 ? Math.round((stats.absent / stats.total) * 100) : 0,
    }));

    const topAttendees = [...userStatsArray]
      .sort((a, b) => {
        if (b.attendanceRate === a.attendanceRate) {
          return b.attended - a.attended;
        }
        return b.attendanceRate - a.attendanceRate;
      })
      .slice(0, limit);

    const frequentAbsentees = [...userStatsArray]
      .filter((user) => user.absent > 0)
      .sort((a, b) => {
        if (b.absent === a.absent) {
          return b.absentRate - a.absentRate;
        }
        return b.absent - a.absent;
      })
      .slice(0, limit);

    const topAttendeeIds = topAttendees.map((a) => a.userId);
    const topAttendeeUsers = await prisma.user.findMany({
      where: {
        id: { in: topAttendeeIds },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profilePicture: true,
      },
    });

    const absenteeIds = frequentAbsentees.map((a) => a.userId);
    const absenteeUsers = await prisma.user.findMany({
      where: {
        id: { in: absenteeIds },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        profilePicture: true,
      },
    });

    const topAttendeesWithDetails = topAttendees.map((stat) => {
      const user = topAttendeeUsers.find((u) => u.id === stat.userId);
      return {
        user: user || null,
        stats: {
          totalSessions: stat.total,
          present: stat.present,
          late: stat.late,
          absent: stat.absent,
          attended: stat.attended,
          attendanceRate: stat.attendanceRate,
        },
      };
    });

    const frequentAbsenteesWithDetails = frequentAbsentees.map((stat) => {
      const user = absenteeUsers.find((u) => u.id === stat.userId);
      return {
        user: user || null,
        stats: {
          totalSessions: stat.total,
          present: stat.present,
          late: stat.late,
          absent: stat.absent,
          attended: stat.attended,
          attendanceRate: stat.attendanceRate,
          absentRate: stat.absentRate,
        },
      };
    });

    res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "Attendance leaderboard fetched successfully.",
      data: {
        topAttendees: topAttendeesWithDetails,
        frequentAbsentees: frequentAbsenteesWithDetails,
      },
    });
  }
);

export const getRecentEvents = asyncHandler(async (req, res, _next) => {
  const limit = parseInt(req.query.limit) || 5;

  const recentEvents = await prisma.event.findMany({
    take: limit,
    orderBy: {
      createdAt: "desc",
    },
    include: {
      location: true,
      _count: {
        select: {
          sessions: true,
        },
      },
    },
  });

  const eventsWithStats = await Promise.all(
    recentEvents.map(async (event) => {
      const attendances = await prisma.attendance.groupBy({
        by: ["status"],
        where: {
          session: {
            eventId: event.id,
          },
        },
        _count: {
          status: true,
        },
      });

      const uniqueAttendees = await prisma.attendance.findMany({
        where: {
          session: {
            eventId: event.id,
          },
        },
        distinct: ["userId"],
        select: {
          userId: true,
        },
      });

      const stats = {
        present: 0,
        late: 0,
        absent: 0,
        total: 0,
      };

      attendances.forEach((att) => {
        const count = att._count.status;
        stats.total += count;

        if (att.status === "PRESENT") {
          stats.present = count;
        } else if (att.status === "LATE") {
          stats.late = count;
        } else if (att.status === "ABSENT") {
          stats.absent = count;
        }
      });

      const attendanceRate =
        stats.total > 0
          ? Math.round(((stats.present + stats.late) / stats.total) * 100)
          : 0;

      return {
        id: event.id,
        title: event.title,
        description: event.description,
        type: event.type,
        startDate: event.startDate,
        endDate: event.endDate,
        isRecurring: event.isRecurring,
        recurrenceInterval: event.recurrenceInterval,
        durationDays: event.durationDays,
        startTime: event.startTime,
        endTime: event.endTime,
        location: {
          id: event.location.id,
          name: event.location.name,
          latitude: event.location.latitude,
          longitude: event.location.longitude,
          city: event.location.city,
          country: event.location.country,
        },
        sessionCount: event._count.sessions,
        uniqueAttendees: uniqueAttendees.length,
        attendanceStats: {
          present: stats.present,
          late: stats.late,
          absent: stats.absent,
          total: stats.total,
          attendanceRate: attendanceRate,
        },
        createdAt: event.createdAt,
        updatedAt: event.updatedAt,
      };
    })
  );

  if (eventsWithStats.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "No events found.",
      data: [],
    });
  }

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Recent events fetched successfully.",
    data: eventsWithStats,
  });
});
