import prisma from "../config/prisma-client.js";

// Controller to get total number of users
export const getTotalUsersCount = async (req, res, next) => {
  try {
    const totalUsers = await prisma.user.count();

    return res.status(200).json({
      message: "Total users fetched successfully.",
      data: { totalUsers },
    });
  } catch (error) {
    next(error);
  }
};

// Controller to get total number of events
export const getTotalEventsCount = async (req, res, next) => {
  try {
    const totalEvents = await prisma.event.count();

    return res.status(200).json({
      message: "Total events fetched successfully.",
      data: { totalEvents },
    });
  } catch (error) {
    next(error);
  }
};

// Controller to get count of upcoming events
export const getUpcomingEventsCount = async (req, res, next) => {
  try {
    const now = new Date();
    const upcomingEvents = await prisma.event.count({
      where: {
        OR: [
          {
            startDate: {
              gte: now,
            },
          },
          {
            isRecurring: true,
            endDate: {
              gte: now,
            },
          },
        ],
      },
    });

    // Check if there's only one recurring event
    const recurringEventCount = await prisma.event.count({
      where: {
        isRecurring: true,
      },
    });

    let message = "Upcoming events count fetched successfully.";
    if (upcomingEvents === 1 && recurringEventCount === 1) {
      message =
        "Only one recurring event found. Create more events for better analytics.";
    }

    return res.status(200).json({
      message,
      data: { upcomingEventsCount: upcomingEvents },
    });
  } catch (error) {
    next(error);
  }
};

// Controller to get attendance records for today for the last recurring event
export const getAttendanceRecordsToday = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Find the last recurring event
    const lastRecurringEvent = await prisma.event.findFirst({
      where: {
        isRecurring: true,
      },
      orderBy: { createdAt: "desc" },
      include: {
        sessions: true,
      },
    });

    if (!lastRecurringEvent) {
      return res.status(200).json({
        message: "No recurring events found.",
        data: { attendanceCount: 0 },
      });
    }

    // Find sessions for today for the last recurring event
    const attendanceCount = await prisma.attendance.count({
      where: {
        session: {
          eventId: lastRecurringEvent.id,
          date: {
            gte: today,
            lt: tomorrow,
          },
        },
        attended: true,
      },
    });

    return res.status(200).json({
      message: `Attendance records for today for event '${lastRecurringEvent.title}' fetched successfully.`,
      data: { attendanceCount },
    });
  } catch (error) {
    next(error);
  }
};

// Controller for recent activity feed (last 5 events and last 5 attendance logs)
export const getRecentActivityFeed = async (req, res, next) => {
  try {
    // Fetch last 5 events created
    const recentEvents = await prisma.event.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
    });

    // Fetch last 5 attendance logs with user and session details
    const recentAttendances = await prisma.attendance.findMany({
      take: 5,
      orderBy: { createdAt: "desc" },
      where: { attended: true },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
        session: {
          include: {
            event: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    });

    // Format attendance logs
    const formattedAttendances = recentAttendances.map((attendance) => ({
      message: `${attendance.user.firstName} ${
        attendance.user.lastName
      } checked into ${attendance.session.event.title} at ${new Date(
        attendance.attendanceStartTime
      ).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      timestamp: attendance.attendanceStartTime,
    }));

    return res.status(200).json({
      message: "Recent activity feed fetched successfully.",
      data: {
        recentEvents: recentEvents.map((event) => ({
          message: `Event '${event.title}' created`,
          timestamp: event.createdAt,
        })),
        recentAttendances: formattedAttendances,
      },
    });
  } catch (error) {
    next(error);
  }
};
