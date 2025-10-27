import prisma from "../config/prismaClient.js";
import * as turf from "@turf/turf";

export const createAttendance = async (req, res, next) => {
  try {
    const { userId, eventId, latitude, longitude, startTime } = req.body;

    // Validate input data
    if (!userId || !eventId || !latitude || !longitude || !startTime) {
      return res.status(400).json({
        message:
          "Missing required fields: userId, eventId, latitude, longitude, startTime.",
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res
        .status(404)
        .json({ message: `User with ID ${userId} not found.` });
    }

    // Find event and its location
    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
      include: { location: true },
    });

    if (!event) {
      return res
        .status(404)
        .json({ message: `Event with ID ${eventId} not found.` });
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
      return res.status(400).json({
        message: "User must be within 50 meters of the event location.",
      });
    }

    // For non-recurring events, check if user has any attendance for this event
    if (!event.isRecurring) {
      const existingAttendance = await prisma.attendance.findFirst({
        where: {
          userId: parseInt(userId),
          session: {
            eventId: parseInt(eventId),
          },
        },
      });

      if (existingAttendance) {
        return res.status(409).json({
          message: "User has already checked in for this event.",
        });
      }
    }

    // Check if user has already attended today for this event
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    const existingAttendanceToday = await prisma.attendance.findFirst({
      where: {
        userId: parseInt(userId),
        session: {
          eventId: parseInt(eventId),
          date: {
            gte: todayStart,
            lt: todayEnd,
          },
        },
      },
    });

    if (existingAttendanceToday) {
      return res.status(409).json({
        message: "User has already checked in today for this event.",
      });
    }

    // Create or find session for today
    const sessionDate = new Date();
    const session = await prisma.session.upsert({
      where: {
        eventId_date: {
          eventId: parseInt(eventId),
          date: sessionDate,
        },
      },
      update: {},
      create: {
        eventId: parseInt(eventId),
        date: sessionDate,
        startTime: startTime,
      },
    });

    // Create attendance record
    const attendance = await prisma.attendance.create({
      data: {
        userId: parseInt(userId),
        sessionId: session.id,
        attended: true,
      },
    });

    res
      .status(201)
      .json({ message: "Attendance marked successfully.", data: attendance });
  } catch (error) {
    next(error);
  }
};

export const updateAttendance = async (req, res, next) => {
  try {
    const { userId, eventId, latitude, longitude, attendanceEndTime } =
      req.body;

    // Validate input data
    if (!userId || !eventId || !latitude || !longitude || !attendanceEndTime) {
      return res.status(400).json({
        message:
          "Missing required fields: userId, eventId, latitude, longitude, attendanceEndTime.",
      });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res
        .status(404)
        .json({ message: `User with ID ${userId} not found.` });
    }

    // Find the event and its location
    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
      include: { location: true },
    });

    if (!event) {
      return res
        .status(404)
        .json({ message: `Event with ID ${eventId} not found.` });
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
      return res.status(400).json({
        message: "User must be within 50 meters of the event location.",
      });
    }

    const existingAttendance = await prisma.attendance.findFirst({
      where: {
        userId: parseInt(userId),
        session: {
          eventId: parseInt(eventId),
        },
      },
      include: {
        session: true,
      },
    });

    if (!existingAttendance) {
      return res.status(400).json({
        message:
          "No attendance record found. User must check in to the event first.",
      });
    }

    // Check if session has already ended
    if (existingAttendance.session.endTime) {
      return res.status(400).json({
        message:
          "Attendance already completed. User has already checked out of this session.",
      });
    }

    // Update the session with the endTime
    const updatedSession = await prisma.session.update({
      where: { id: existingAttendance.sessionId },
      data: { endTime: attendanceEndTime },
    });

    // Update attendance (if you have something else to update in future)
    const updatedAttendance = await prisma.attendance.update({
      where: {
        userId_sessionId: {
          userId: parseInt(userId),
          sessionId: existingAttendance.sessionId,
        },
      },
      data: {}, // Currently nothing to update
    });

    res.status(200).json({
      message: "Attendance end time updated successfully.",
      data: updatedAttendance,
    });
  } catch (error) {
    next(error);
  }
};

export const getUserAttendance = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!userId || isNaN(parseInt(userId))) {
      return res.status(400).json({ message: "Valid userId is required." });
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        userId: parseInt(userId),
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
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
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalRecords = await prisma.attendance.count({
      where: {
        userId: parseInt(userId),
      },
    });

    if (attendances.length === 0) {
      return res
        .status(200)
        .json({ message: "No attendance records found for this user." });
    }

    res.status(200).json({
      message: "User attendance successfully fetched.",
      data: attendances,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalRecords / parseInt(limit)),
        totalRecords,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getEventAttendance = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!eventId || isNaN(parseInt(eventId))) {
      return res.status(400).json({ message: "Valid eventId is required." });
    }

    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
    });

    if (!event) {
      return res
        .status(404)
        .json({ message: `Event with ID ${eventId} not found.` });
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        session: {
          eventId: parseInt(eventId),
        },
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
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
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalRecords = await prisma.attendance.count({
      where: {
        session: {
          eventId: parseInt(eventId),
        },
      },
    });

    if (attendances.length === 0) {
      return res
        .status(200)
        .json({ message: "No attendance records found for this event." });
    }

    res.status(200).json({
      message: "Event attendance successfully fetched.",
      data: attendances,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalRecords / parseInt(limit)),
        totalRecords,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getUserEventAttendance = async (req, res, next) => {
  try {
    const { userId, eventId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (
      !userId ||
      isNaN(parseInt(userId)) ||
      !eventId ||
      isNaN(parseInt(eventId))
    ) {
      return res
        .status(400)
        .json({ message: "Valid userId and eventId are required." });
    }

    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
    });

    if (!user) {
      return res
        .status(404)
        .json({ message: `User with ID ${userId} not found.` });
    }

    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
    });

    if (!event) {
      return res
        .status(404)
        .json({ message: `Event with ID ${eventId} not found.` });
    }

    const attendances = await prisma.attendance.findMany({
      where: {
        userId: parseInt(userId),
        session: {
          eventId: parseInt(eventId),
        },
      },
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
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
      orderBy: {
        createdAt: "desc",
      },
    });

    const totalRecords = await prisma.attendance.count({
      where: {
        userId: parseInt(userId),
        session: {
          eventId: parseInt(eventId),
        },
      },
    });

    if (attendances.length === 0) {
      return res.status(200).json({
        message: "No attendance records found for this user and event.",
      });
    }

    res.status(200).json({
      message: "User event attendance successfully fetched.",
      data: attendances,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalRecords / parseInt(limit)),
        totalRecords,
      },
    });
  } catch (error) {
    next(error);
  }
};
