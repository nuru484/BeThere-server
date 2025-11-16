import prisma from "../config/prisma-client.js";
import { asyncHandler, ValidationError } from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";

export const getAttendanceReports = asyncHandler(async (req, res, _next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || "";
  const userId = req.query.userId;
  const eventName = req.query.eventName;
  const locationName = req.query.locationName;
  const status = req.query.status;
  const isRecurring = req.query.isRecurring;
  const eventType = req.query.eventType;
  const checkInStartDate = req.query.checkInStartDate;
  const checkInEndDate = req.query.checkInEndDate;
  const sessionStartDate = req.query.sessionStartDate;
  const sessionEndDate = req.query.sessionEndDate;
  const city = req.query.city;
  const country = req.query.country;

  const whereClause = {};

  if (userId) {
    if (isNaN(parseInt(userId))) {
      throw new ValidationError("Valid user ID is required.");
    }
    whereClause.userId = parseInt(userId);
  }

  // Filter by attendance status
  if (status) {
    const validStatuses = ["PRESENT", "LATE", "ABSENT"];
    if (!validStatuses.includes(status.toUpperCase())) {
      throw new ValidationError(
        "Invalid status. Must be one of: PRESENT, LATE, ABSENT"
      );
    }
    whereClause.status = status.toUpperCase();
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

  // Filter by check-in date range
  if (checkInStartDate || checkInEndDate) {
    whereClause.checkInTime = {};
    if (checkInStartDate) {
      whereClause.checkInTime.gte = new Date(checkInStartDate);
    }
    if (checkInEndDate) {
      const endDateTime = new Date(checkInEndDate);
      endDateTime.setHours(23, 59, 59, 999);
      whereClause.checkInTime.lte = endDateTime;
    }
  }

  // Fetch attendance records and total count
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

  const formattedAttendances = attendances.map((attendance) => ({
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
  }));

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

  const topAttendeesWithDetails = await Promise.all(
    topAttendeesQuery.map(async (attendee) => {
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

  const summary = {
    totalAttendance: totalRecords,
    presentCount: await prisma.attendance.count({
      where: { ...whereClause, status: "PRESENT" },
    }),
    lateCount: await prisma.attendance.count({
      where: { ...whereClause, status: "LATE" },
    }),
    absentCount: await prisma.attendance.count({
      where: { ...whereClause, status: "ABSENT" },
    }),
  };

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Attendance reports successfully fetched.",
    data: formattedAttendances,
    topAttendees: topAttendeesWithDetails,
    summary,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  });
});
