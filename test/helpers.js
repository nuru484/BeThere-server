// test/helpers.js
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import ENV from "../src/config/env.js";
import { prisma } from "../src/config/prisma-client.js";
import { issueSession } from "../src/services/auth.service.js";

/** A stable fake face-api descriptor (128 floats). */
export const DESCRIPTOR = Array.from({ length: 128 }, (_, i) =>
  Number(Math.sin(i).toFixed(6))
);

/** A descriptor far outside the 0.6 match threshold of DESCRIPTOR. */
export const WRONG_DESCRIPTOR = DESCRIPTOR.map((n) => n + 1);

export async function createUser({
  email = "user@test.local",
  password = "Password123!",
  role = "USER",
  faceScan = null,
  phone = null,
} = {}) {
  const hashed = await bcrypt.hash(password, 10);
  return prisma.user.create({
    data: {
      firstName: "Test",
      lastName: "User",
      email,
      password: hashed,
      role,
      faceScan,
      phone,
    },
  });
}

export function accessTokenFor(user) {
  return jwt.sign(
    { id: user.id, role: user.role, tv: user.tokenVersion ?? 0 },
    ENV.ACCESS_TOKEN_SECRET,
    { expiresIn: "30m" }
  );
}

/** A REAL session (registered refresh jti), as login would issue. */
export function sessionFor(user) {
  return issueSession(user);
}

/**
 * Event + location + a session covering today, with an all-day check-in
 * window so time-of-day never flakes a test.
 */
export async function createEventWithActiveSession({
  latitude = 6.6885,
  longitude = -1.6244,
} = {}) {
  const location = await prisma.location.create({
    data: { name: "Test Hall", latitude, longitude },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 0, 0);

  const event = await prisma.event.create({
    data: {
      title: "Test Event",
      startDate: today,
      isRecurring: false,
      startTime: "00:00",
      endTime: "23:59",
      locationId: location.id,
      type: "MEETING",
    },
  });

  const session = await prisma.session.create({
    data: {
      eventId: event.id,
      startDate: today,
      endDate: today,
      startTime: today,
      endTime: endOfToday,
    },
  });

  return { location, event, session };
}
