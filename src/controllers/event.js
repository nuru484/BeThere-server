import prisma from "../config/prismaClient.js";

export const createEvent = async (req, res, next) => {
  try {
    const {
      location,
      startDate,
      endDate,
      startTime,
      endTime,
      ...eventDetails
    } = req.body;

    // Validate location details
    if (
      !location ||
      !location.name ||
      !location.latitude ||
      !location.longitude
    ) {
      return res.status(400).json({
        message: "Location details (name, latitude, longitude) are required.",
      });
    }

    // Validate startTime and endTime format (HH:mm)
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (
      !startTime ||
      !endTime ||
      !timeRegex.test(startTime) ||
      !timeRegex.test(endTime)
    ) {
      return res.status(400).json({
        message: "Start time and end time must be in HH:mm format.",
      });
    }

    // Create the new event with a new location
    const event = await prisma.event.create({
      data: {
        ...eventDetails,
        startDate: startDate ? new Date(startDate) : null, // Ensure Date object for Prisma
        endDate: endDate ? new Date(endDate) : null,
        startTime, // String in HH:mm format
        endTime, // String in HH:mm format
        location: {
          create: {
            name: location.name,
            latitude: parseFloat(location.latitude),
            longitude: parseFloat(location.longitude),
            city: location.city,
            country: location.country,
          },
        },
      },
    });

    res
      .status(201)
      .json({ message: "Event created successfully", data: event });
  } catch (error) {
    next(error);
  }
};

export const updateEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;
    const {
      location,
      startDate,
      endDate,
      startTime,
      endTime,
      ...eventUpdateData
    } = req.body;

    // Find the event by ID with its current location
    const existingEvent = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
      include: { location: true },
    });

    if (!existingEvent) {
      return res
        .status(404)
        .json({ message: `Event with ID ${eventId} not found.` });
    }

    // Validate time format (HH:mm) if provided
    const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (
      (startTime && !timeRegex.test(startTime)) ||
      (endTime && !timeRegex.test(endTime))
    ) {
      return res.status(400).json({
        message: "Start time and end time must be in HH:mm format.",
      });
    }

    // Prepare update data - exclude fields that shouldn't be updated
    const { id, createdAt, updatedAt, locationId, ...allowedUpdateData } =
      eventUpdateData;

    const updateData = {
      ...allowedUpdateData,
      ...(startDate && { startDate: new Date(startDate) }),
      ...(endDate && { endDate: new Date(endDate) }),
      ...(startTime && { startTime }),
      ...(endTime && { endTime }),
    };

    // Handle location update if provided
    if (location) {
      if (!location.name || !location.latitude || !location.longitude) {
        return res.status(400).json({
          message: "Location details (name, latitude, longitude) are required.",
        });
      }

      // Option 1: Update the existing location in place
      updateData.location = {
        update: {
          name: location.name,
          latitude: parseFloat(location.latitude),
          longitude: parseFloat(location.longitude),
          city: location.city,
          country: location.country,
        },
      };
    }

    // Update the event
    const updatedEvent = await prisma.event.update({
      where: { id: parseInt(eventId) },
      data: updateData,
      include: { location: true }, // Include location in response
    });

    res
      .status(200)
      .json({ message: "Event updated successfully.", data: updatedEvent });
  } catch (error) {
    next(error);
  }
};

export const deleteEvent = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Find the event by ID
    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
    });

    if (!event) {
      return res
        .status(404)
        .json({ message: `Event with ID ${eventId} not found.` });
    }

    // Delete the event
    await prisma.event.delete({
      where: { id: parseInt(eventId) },
    });

    res.status(200).json({ message: "Event deleted successfully." });
  } catch (error) {
    next(error);
  }
};

export const deleteAllEvents = async (req, res, next) => {
  try {
    // Fetch all events with their locations
    const events = await prisma.event.findMany({
      include: { location: true },
    });

    if (events.length === 0) {
      return res.status(200).json({ message: "No events to delete." });
    }

    // Delete all events (cascades to sessions)
    await prisma.event.deleteMany({});

    res.status(200).json({ message: "All events deleted successfully." });
  } catch (error) {
    next(error);
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const { eventId } = req.params;

    // Find the event by ID with related data
    const event = await prisma.event.findUnique({
      where: { id: parseInt(eventId) },
      include: {
        location: true,
      },
    });

    if (!event) {
      return res
        .status(404)
        .json({ message: `Event with ID ${eventId} not found.` });
    }

    res
      .status(200)
      .json({ message: "Event successfully fetched.", data: event });
  } catch (error) {
    next(error);
  }
};

export const getAllEvents = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Retrieve paginated events with related data
    const events = await prisma.event.findMany({
      skip: (parseInt(page) - 1) * parseInt(limit),
      take: parseInt(limit),
      include: {
        location: true,
      },
    });

    const totalRecords = await prisma.event.count();

    if (events.length === 0) {
      return res
        .status(200)
        .json({ message: "There are no events at the moment." });
    }

    res.status(200).json({
      message: "Events successfully fetched.",
      data: events,
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
