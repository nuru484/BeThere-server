// src/services/attendance.service.js
//
// Check-in and check-out. Both share the same spine - load the actor's
// account, load the event with its venue, geofence, resolve the active
// session, enforce the daily time window (in the VENUE timezone via
// todayAtEventTime) - so the shared steps live in helpers here.
import * as turf from "@turf/turf";
import { startOfDay } from "date-fns";
import { prisma } from "../config/prisma-client.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../middleware/error-handler.js";
import { faceMatches } from "../utils/face-match.js";
import { todayAtEventTime } from "../utils/time-context.js";

const GEOFENCE_RADIUS_METERS = 50;

/** Both mutations answer with the session (+event) and a minimal user. */
const ATTENDANCE_INCLUDE = {
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
};

/** The actor's account; soft-deleted accounts read as absent. */
async function findUserOrThrow(userId) {
  const user = await prisma.user.findFirst({ where: { id: userId } });

  if (!user) {
    throw new NotFoundError(`User with ID ${userId} not found.`);
  }

  return user;
}

/** The event with its venue; soft-deleted events read as absent. */
async function findEventWithLocation(eventId) {
  const event = await prisma.event.findFirst({
    where: { id: eventId },
    include: { location: true },
  });

  if (!event) {
    throw new NotFoundError(`Event with ID ${eventId} not found.`);
  }

  return event;
}

/** Rejects coordinates farther than 50 meters from the event's venue. */
export function assertWithinGeofence(event, latitude, longitude) {
  const userLocation = turf.point([longitude, latitude]);
  const eventLocation = turf.point([
    event.location.longitude,
    event.location.latitude,
  ]);

  const isInside =
    turf.distance(userLocation, eventLocation, { units: "meters" }) <=
    GEOFENCE_RADIUS_METERS;

  if (!isInside) {
    throw new BadRequestError(
      "User must be within 50 meters of the event location."
    );
  }
}

/** The session whose date range covers `now`, or null when none is active. */
export async function resolveActiveSession(eventId, now) {
  const currentDate = startOfDay(now);

  return prisma.session.findFirst({
    where: {
      eventId,
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
}

/**
 * Check-in: verifies the face server-side against the enrolled descriptor,
 * geofences, resolves the active session, enforces the check-in window,
 * and records PRESENT or LATE (later than an hour after opening).
 */
export async function checkIn(userId, eventId, { latitude, longitude, faceDescriptor }) {
  const user = await findUserOrThrow(userId);

  // Face verification happens HERE, against the enrolled descriptor - the
  // browser only captures; it never receives the stored descriptor and its
  // local "match" is UX, not the security check.
  if (!user.faceScan) {
    throw new BadRequestError(
      "No enrolled face found for your account. Please contact an admin to enroll your face scan."
    );
  }

  if (!faceMatches(user.faceScan, faceDescriptor)) {
    throw new UnauthorizedError("Face verification failed. Please try again.");
  }

  const event = await findEventWithLocation(eventId);

  assertWithinGeofence(event, latitude, longitude);

  const now = new Date();
  const currentDate = startOfDay(now);

  const currentSession = await resolveActiveSession(eventId, now);

  if (!currentSession) {
    throw new BadRequestError(
      "No active session for this event at the moment. Please wait for the next session to check in."
    );
  }

  // Check if session has ended for today
  if (currentDate > new Date(currentSession.endDate)) {
    throw new BadRequestError(
      "The current session has ended. Please wait for the next session to check in."
    );
  }

  // Check if current time is within the session's daily time window,
  // evaluated in the VENUE timezone (event times are "HH:MM" wall-clock
  // strings; the server's own timezone must not change the outcome).
  const sessionStartTime = todayAtEventTime(event.startTime, now);
  const sessionEndTime = todayAtEventTime(event.endTime, now);

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

  // findUnique on the compound key: Attendance is not soft-deletable.
  const existingAttendance = await prisma.attendance.findUnique({
    where: {
      userId_sessionId: {
        userId,
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

  return prisma.attendance.create({
    data: {
      userId,
      sessionId: currentSession.id,
      checkInTime: now,
      status,
    },
    include: ATTENDANCE_INCLUDE,
  });
}

/**
 * Check-out: geofences only when coordinates arrived, requires an existing
 * check-in for the active session, and enforces the check-out deadline.
 */
export async function checkOut(userId, eventId, { latitude, longitude }) {
  await findUserOrThrow(userId);

  const event = await findEventWithLocation(eventId);

  // Lat/long are OPTIONAL on checkout - only geofence when both arrived
  // (turf.point on undefined coordinates throws a 500 otherwise).
  if (latitude !== undefined && longitude !== undefined) {
    assertWithinGeofence(event, latitude, longitude);
  }

  const now = new Date();

  const currentSession = await resolveActiveSession(eventId, now);

  if (!currentSession) {
    throw new NotFoundError(
      "No active session found for this event at the moment."
    );
  }

  const existingAttendance = await prisma.attendance.findUnique({
    where: {
      userId_sessionId: {
        userId,
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

  if (existingAttendance.checkOutTime) {
    throw new ConflictError("You have already checked out of this session.");
  }

  // Validate checkout is within the event's time window (venue timezone).
  const sessionEndTime = todayAtEventTime(event.endTime, now);

  if (now > sessionEndTime) {
    throw new BadRequestError(
      `Check-out window has closed. The check-out deadline was ${event.endTime}.`
    );
  }

  // Ensure checkout time is after check-in time
  if (now <= existingAttendance.checkInTime) {
    throw new BadRequestError("Check-out time must be after check-in time.");
  }

  return prisma.attendance.update({
    where: {
      userId_sessionId: {
        userId,
        sessionId: currentSession.id,
      },
    },
    data: {
      checkOutTime: now,
    },
    include: ATTENDANCE_INCLUDE,
  });
}
