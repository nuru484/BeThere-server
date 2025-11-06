import prisma from "../config/prisma-client.js";
import * as turf from "@turf/turf";
import {
  asyncHandler,
  NotFoundError,
  ValidationError,
  BadRequestError,
  ConflictError,
  UnauthorizedError,
} from "../middleware/error-handler.js";
import { HTTP_STATUS_CODES } from "../config/constants.js";
import { validationMiddleware } from "../validation/validation-error-handler.js";
import {
  createAttendanceValidation,
  updateAttendanceValidation,
} from "../validation/attendance-validation.js";
import { startOfDay } from "date-fns";

const handleCreateAttendance = asyncHandler(async (req, res, _next) => {
  const userId = req.user.id;
  const { eventId } = req.params;
  const { latitude, longitude } = req.body;

  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  const event = await prisma.event.findUnique({
    where: { id: parseInt(eventId) },
    include: { location: true },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  // Validate user location within 50 meters of event location
  const userLocation = turf.point([longitude, latitude]);
  const eventLocation = turf.point([
    event.location.longitude,
    event.location.latitude,
  ]);

  const maxDistance = 50; // Radius in meters

  const isInside =
    turf.distance(userLocation, eventLocation, { units: "meters" }) <=
    maxDistance;

  if (!isInside) {
    throw new BadRequestError(
      "User must be within 50 meters of the event location."
    );
  }

  const now = new Date();
  const currentDate = startOfDay(now);

  // Find the current active session for this event
  const currentSession = await prisma.session.findFirst({
    where: {
      eventId: parseInt(eventId),
      startDate: {
        lte: currentDate, // Session has started
      },
      endDate: {
        gte: currentDate, // Session hasn't ended yet
      },
    },
    orderBy: {
      startDate: "desc",
    },
  });

  if (!currentSession) {
    return res.status(400).json({
      message:
        "No active session for this event at the moment. Please wait for the next session to check in.",
    });
  }

  // Check if session has ended for today
  if (currentDate > new Date(currentSession.endDate)) {
    throw new BadRequestError(
      "The current session has ended. Please wait for the next session to check in."
    );
  }

  // Check if current time is within the session's daily time window
  const [startHour, startMinute] = event.startTime.split(":").map(Number);
  const [endHour, endMinute] = event.endTime.split(":").map(Number);

  const sessionStartTime = new Date(now);
  sessionStartTime.setHours(startHour, startMinute, 0, 0);

  const sessionEndTime = new Date(now);
  sessionEndTime.setHours(endHour, endMinute, 0, 0);

  if (now < sessionStartTime) {
    throw new BadRequestError(
      `Check-in is not yet open. Please check in after ${event.startTime}.`
    );
  }

  if (now > sessionEndTime) {
    throw new BadRequestError(
      `Check-in is closed for today. The check-in window was ${event.startTime} - ${event.endTime}.`
    );
  }

  // Check if user already has attendance for this session
  const existingAttendance = await prisma.attendance.findUnique({
    where: {
      userId_sessionId: {
        userId: parseInt(userId),
        sessionId: currentSession.id,
      },
    },
  });

  if (existingAttendance) {
    throw new ConflictError("You have already checked in for this session.");
  }

  // Determine attendance status based on check-in time
  const oneHourAfterStart = new Date(sessionStartTime);
  oneHourAfterStart.setHours(oneHourAfterStart.getHours() + 1);

  const status = now <= oneHourAfterStart ? "PRESENT" : "LATE";

  // Create attendance record
  const attendance = await prisma.attendance.create({
    data: {
      userId: parseInt(userId),
      sessionId: currentSession.id,
      checkInTime: now,
      status: status,
    },
    include: {
      session: {
        include: {
          event: true,
        },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  res.status(HTTP_STATUS_CODES.CREATED || 201).json({
    message: `Attendance marked successfully as ${status}.`,
    data: attendance,
  });
});

export const createAttendance = [
  validationMiddleware.create(createAttendanceValidation),
  handleCreateAttendance,
];

const handleUpdateAttendance = asyncHandler(async (req, res, _next) => {
  const userId = req.user.id;
  const { eventId } = req.params;
  const { latitude, longitude } = req.body;

  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  const event = await prisma.event.findUnique({
    where: { id: parseInt(eventId) },
    include: { location: true },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  // Validate user location within 50 meters of event location
  const userLocation = turf.point([longitude, latitude]);
  const eventLocation = turf.point([
    event.location.longitude,
    event.location.latitude,
  ]);

  const maxDistance = 50;
  const isInside =
    turf.distance(userLocation, eventLocation, { units: "meters" }) <=
    maxDistance;

  if (!isInside) {
    throw new BadRequestError(
      "User must be within 50 meters of the event location."
    );
  }

  const now = new Date();
  const currentDate = startOfDay(now);

  // Find the current active session for this event
  const currentSession = await prisma.session.findFirst({
    where: {
      eventId: parseInt(eventId),
      startDate: {
        lte: currentDate,
      },
      endDate: {
        gte: currentDate,
      },
    },
    orderBy: {
      startDate: "desc",
    },
  });

  if (!currentSession) {
    throw new NotFoundError(
      "No active session found for this event at the moment."
    );
  }

  // Find existing attendance for this session
  const existingAttendance = await prisma.attendance.findUnique({
    where: {
      userId_sessionId: {
        userId: parseInt(userId),
        sessionId: currentSession.id,
      },
    },
    include: {
      session: {
        include: {
          event: true,
        },
      },
    },
  });

  if (!existingAttendance) {
    throw new NotFoundError(
      "No attendance record found. You must check in to the event first."
    );
  }

  // Check if user has already checked out
  if (existingAttendance.checkOutTime) {
    throw new ConflictError("You have already checked out of this session.");
  }

  // Validate checkout is within the event's time window
  const [endHour, endMinute] = event.endTime.split(":").map(Number);
  const sessionEndTime = new Date(now);
  sessionEndTime.setHours(endHour, endMinute, 0, 0);

  if (now > sessionEndTime) {
    throw new BadRequestError(
      `Check-out window has closed. The check-out deadline was ${event.endTime}.`
    );
  }

  // Ensure checkout time is after check-in time
  if (now <= existingAttendance.checkInTime) {
    throw new BadRequestError("Check-out time must be after check-in time.");
  }

  // Update attendance with checkout time
  const updatedAttendance = await prisma.attendance.update({
    where: {
      userId_sessionId: {
        userId: parseInt(userId),
        sessionId: currentSession.id,
      },
    },
    data: {
      checkOutTime: now,
    },
    include: {
      session: {
        include: {
          event: true,
        },
      },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Successfully checked out of the session.",
    data: updatedAttendance,
  });
});

export const updateAttendance = [
  validationMiddleware.create(updateAttendanceValidation),
  handleUpdateAttendance,
];

export const getUserAttendance = asyncHandler(async (req, res, _next) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || "";
  const status = req.query.status;
  const eventType = req.query.eventType;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }

  const targetUserId = parseInt(userId);

  if (
    targetUserId !== parseInt(currentUserId?.toString() || "0") &&
    currentUserRole !== "ADMIN"
  ) {
    throw new UnauthorizedError(
      "Only admins can access other users' attendance."
    );
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required");
  }

  const whereClause = {
    userId: parseInt(userId),
  };

  // Search across event title, description, type, and location
  if (search) {
    whereClause.session = {
      event: {
        OR: [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
          { type: { contains: search, mode: "insensitive" } },
          {
            location: {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
                { country: { contains: search, mode: "insensitive" } },
              ],
            },
          },
        ],
      },
    };
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

  // Filter by event type
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

  // Filter by date range (check-in time)
  if (startDate || endDate) {
    whereClause.checkInTime = {};
    if (startDate) {
      whereClause.checkInTime.gte = new Date(startDate);
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      whereClause.checkInTime.lte = endDateTime;
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

  if (attendances.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "No attendance records found for this user.",
      data: [],
      pagination: {
        totalRecords: 0,
        page,
        limit,
        totalPages: 0,
      },
    });
  }

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "User attendance successfully fetched.",
    data: attendances,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  });
});

export const getEventAttendance = asyncHandler(async (req, res, _next) => {
  const { eventId } = req.params;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const search = req.query.search || "";
  const status = req.query.status;
  const sessionId = req.query.sessionId;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }

  // Verify event exists
  const event = await prisma.event.findUnique({
    where: { id: parseInt(eventId) },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  const whereClause = {};

  whereClause.session = { eventId: parseInt(eventId) };

  // Search across user details
  if (search) {
    whereClause.user = {
      OR: [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    };
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

  // Filter by specific session
  if (sessionId) {
    if (!isNaN(parseInt(sessionId))) {
      whereClause.sessionId = parseInt(sessionId);
    } else {
      throw new ValidationError("Valid session ID is required.");
    }
  }

  // Filter by date range (check-in time)
  if (startDate || endDate) {
    whereClause.checkInTime = {};
    if (startDate) {
      whereClause.checkInTime.gte = new Date(startDate);
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      whereClause.checkInTime.lte = endDateTime;
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

  if (attendances.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "No attendance records found for this event.",
      data: [],
      pagination: {
        totalRecords: 0,
        page,
        limit,
        totalPages: 0,
      },
    });
  }

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "Event attendance successfully fetched.",
    data: attendances,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  });
});

export const getUserEventAttendance = asyncHandler(async (req, res, _next) => {
  const { userId, eventId } = req.params;
  const currentUserId = req.user.id;
  const currentUserRole = req.user.role;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const status = req.query.status;
  const sessionId = req.query.sessionId;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;

  if (!userId || isNaN(parseInt(userId))) {
    throw new ValidationError("Valid user ID is required.");
  }

  if (!eventId || isNaN(parseInt(eventId))) {
    throw new ValidationError("Valid event ID is required.");
  }

  const targetUserId = parseInt(userId);

  if (
    targetUserId !== parseInt(currentUserId?.toString() || "0") &&
    currentUserRole !== "ADMIN"
  ) {
    throw new UnauthorizedError(
      "Only admins can access other users' attendance."
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: parseInt(userId) },
  });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  const event = await prisma.event.findUnique({
    where: { id: parseInt(eventId) },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  const whereClause = {
    userId: parseInt(userId),
    session: {
      eventId: parseInt(eventId),
    },
  };

  if (status) {
    const validStatuses = ["PRESENT", "LATE", "ABSENT"];
    if (!validStatuses.includes(status.toUpperCase())) {
      throw new ValidationError(
        "Invalid status. Must be one of: PRESENT, LATE, ABSENT"
      );
    }
    whereClause.status = status.toUpperCase();
  }

  if (sessionId) {
    if (!isNaN(parseInt(sessionId))) {
      whereClause.sessionId = parseInt(sessionId);
    } else {
      throw new ValidationError("Valid session ID is required.");
    }
  }

  if (startDate || endDate) {
    whereClause.checkInTime = {};
    if (startDate) {
      whereClause.checkInTime.gte = new Date(startDate);
    }
    if (endDate) {
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      whereClause.checkInTime.lte = endDateTime;
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

  if (attendances.length === 0) {
    return res.status(HTTP_STATUS_CODES.OK || 200).json({
      message: "No attendance records found for this user and event.",
      data: [],
      pagination: {
        totalRecords: 0,
        page,
        limit,
        totalPages: 0,
      },
    });
  }

  res.status(HTTP_STATUS_CODES.OK || 200).json({
    message: "User event attendance successfully fetched.",
    data: attendances,
    pagination: {
      totalRecords,
      page,
      limit,
      totalPages: Math.ceil(totalRecords / limit),
    },
  });
});
