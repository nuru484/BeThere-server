import prisma from "../../config/prisma-client.js";
import { asyncHandler, NotFoundError } from "../../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../../config/constants.js";
import { startOfDay, endOfDay, differenceInMilliseconds } from "date-fns";

export const getTodaysEvents = asyncHandler(async (req, res, _next) => {
  const userId = req.user.id;

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  // Find all sessions that are active today
  const todaysSessions = await prisma.session.findMany({
    where: {
      startDate: {
        lte: todayEnd,
      },
      endDate: {
        gte: todayStart,
      },
    },
    include: {
      event: {
        include: {
          location: true,
        },
      },
      attendances: {
        where: {
          userId: parseInt(userId),
        },
      },
    },
    orderBy: {
      startDate: "asc",
    },
  });

  if (todaysSessions.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "No events scheduled for today.",
      data: [],
    });
  }

  const formattedSessions = todaysSessions.map((session) => {
    const event = session.event;
    const [startHour, startMinute] = event.startTime.split(":").map(Number);
    const [endHour, endMinute] = event.endTime.split(":").map(Number);

    const sessionStartTime = new Date(now);
    sessionStartTime.setHours(startHour, startMinute, 0, 0);

    const sessionEndTime = new Date(now);
    sessionEndTime.setHours(endHour, endMinute, 0, 0);

    let status = "upcoming";
    let countdownMs = null;

    if (now < sessionStartTime) {
      status = "upcoming";
      countdownMs = differenceInMilliseconds(sessionStartTime, now);
    } else if (now >= sessionStartTime && now <= sessionEndTime) {
      status = "active";
      countdownMs = 0;
    } else {
      status = "ended";
      countdownMs = 0;
    }

    const hasCheckedIn = session.attendances.length > 0;

    return {
      sessionId: session.id,
      eventId: event.id,
      eventTitle: event.title,
      eventDescription: event.description,
      eventType: event.type,
      location: {
        id: event.location.id,
        name: event.location.name,
        latitude: event.location.latitude,
        longitude: event.location.longitude,
        city: event.location.city,
        country: event.location.country,
      },
      sessionStartDate: session.startDate,
      sessionEndDate: session.endDate,
      sessionTime: {
        startTime: event.startTime,
        endTime: event.endTime,
        formattedTime: `${event.startTime} – ${event.endTime}`,
      },
      status: status,
      countdownMs: countdownMs,
      hasCheckedIn: hasCheckedIn,
      attendanceStatus: hasCheckedIn ? session.attendances[0].status : null,
    };
  });

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Today's events successfully fetched.",
    data: formattedSessions,
  });
});

export const getRecentEventAttendanceSummary = asyncHandler(
  async (req, res, _next) => {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found.`);
    }

    const recentAttendance = await prisma.attendance.findFirst({
      where: {
        userId: parseInt(userId),
      },
      orderBy: {
        checkInTime: "desc",
      },
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

    if (!recentAttendance) {
      return res.status(HTTP_STATUS_CODES.OK || 200).json({
        message: "No attendance records found for this user.",
        data: null,
      });
    }

    const eventId = recentAttendance.session.event.id;

    const eventAttendances = await prisma.attendance.findMany({
      where: {
        userId: parseInt(userId),
        session: {
          eventId: eventId,
        },
      },
      include: {
        session: true,
      },
    });

    const totalSessions = eventAttendances.length;
    const presentCount = eventAttendances.filter(
      (att) => att.status === "PRESENT"
    ).length;
    const lateCount = eventAttendances.filter(
      (att) => att.status === "LATE"
    ).length;
    const absentCount = eventAttendances.filter(
      (att) => att.status === "ABSENT"
    ).length;

    const attendedCount = presentCount + lateCount;
    const attendancePercentage =
      totalSessions > 0 ? Math.round((attendedCount / totalSessions) * 100) : 0;

    res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "Attendance summary for most recent event fetched successfully.",
      data: {
        event: {
          id: recentAttendance.session.event.id,
          title: recentAttendance.session.event.title,
          description: recentAttendance.session.event.description,
          type: recentAttendance.session.event.type,
          location: recentAttendance.session.event.location,
        },
        summary: {
          totalSessions: totalSessions,
          attended: attendedCount,
          present: presentCount,
          late: lateCount,
          absent: absentCount,
          attendancePercentage: attendancePercentage,
        },
      },
    });
  }
);

export const getLastFiveEventsAttended = asyncHandler(
  async (req, res, _next) => {
    const userId = req.user.id;

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      throw new NotFoundError(`User with ID ${userId} not found.`);
    }

    const recentAttendances = await prisma.attendance.findMany({
      where: {
        userId: parseInt(userId),
      },
      orderBy: {
        checkInTime: "desc",
      },
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
      distinct: ["sessionId"],
    });

    if (recentAttendances.length === 0) {
      return res.status(HTTP_STATUS_CODES.OK || 200).json({
        message: "No attendance records found for this user.",
        data: [],
      });
    }

    const eventMap = new Map();

    for (const attendance of recentAttendances) {
      const eventId = attendance.session.event.id;

      if (!eventMap.has(eventId)) {
        eventMap.set(eventId, {
          event: attendance.session.event,
          latestAttendance: attendance,
        });
      }

      if (eventMap.size === 5) break;
    }

    const lastFiveEvents = Array.from(eventMap.values()).map((item) => ({
      eventId: item.event.id,
      eventTitle: item.event.title,
      eventDescription: item.event.description,
      eventType: item.event.type,
      location: {
        id: item.event.location.id,
        name: item.event.location.name,
        latitude: item.event.location.latitude,
        longitude: item.event.location.longitude,
        city: item.event.location.city,
        country: item.event.location.country,
      },
      latestCheckIn: {
        attendanceId: item.latestAttendance.id,
        checkInTime: item.latestAttendance.checkInTime,
        checkOutTime: item.latestAttendance.checkOutTime,
        status: item.latestAttendance.status,
        sessionId: item.latestAttendance.sessionId,
      },
      isRecurring: item.event.isRecurring,
    }));

    res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "Last 5 events attended successfully fetched.",
      data: lastFiveEvents,
    });
  }
);
