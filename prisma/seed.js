// prisma/seed.js
import crypto from "node:crypto";
import { AttendanceStatus } from "@prisma/client";
import { prisma } from "../src/config/prisma-client.js";
import * as bcrypt from "bcrypt";
import logger from "../src/utils/logger.js";
import ENV from "../src/config/env.js";
import { addDays } from "date-fns";
import {
  addUtcDays,
  eventCalendarDay,
  utcDayAtTime,
  utcDayStart,
} from "../src/utils/time-context.js";

async function main() {
  // Explicit opt-in: without ADMIN_SEED_ENABLED=true the seed is a no-op, so
  // a deploy pipeline can never silently plant demo credentials in
  // production.
  if (!ENV.ADMIN_SEED_ENABLED) {
    logger.info("🌱 Seed skipped (ADMIN_SEED_ENABLED is not true).");
    return;
  }

  logger.info("🌱 Starting database seeding...");

  const existingUsers = await prisma.user.count();
  const existingLocations = await prisma.location.count();

  // Dedicated demo principals for the one-click demo login (never the real
  // admin). Seeded ONLY when demo login is enabled, and ensured idempotently
  // BEFORE the already-seeded early-return so re-running on an existing
  // database still guarantees they exist. demo-login resolves them by
  // DEMO_ADMIN_EMAIL / DEMO_ATTENDANT_EMAIL.
  //
  // The demo admin gets a RANDOM password that is regenerated (and rotated on
  // update) every seed run, so it is never a known credential. The demo-login
  // endpoint signs the account in by email lookup with no password check, so
  // the demo still works; the normal /auth/login path cannot be used to reach
  // this account because nobody knows the password. This closes the
  // known-credentials admin backdoor a hardcoded password would create.
  if (ENV.DEMO_LOGIN_ENABLED) {
    const demoPassword = await bcrypt.hash(
      crypto.randomBytes(24).toString("hex"),
      10,
    );
    await prisma.admin.upsert({
      where: { email: ENV.DEMO_ADMIN_EMAIL },
      update: { password: demoPassword },
      create: {
        email: ENV.DEMO_ADMIN_EMAIL,
        firstName: "Demo",
        lastName: "Admin",
        password: demoPassword,
      },
    });
    await prisma.user.upsert({
      where: { email: ENV.DEMO_ATTENDANT_EMAIL },
      update: {},
      create: {
        email: ENV.DEMO_ATTENDANT_EMAIL,
        firstName: "Demo",
        lastName: "Attendant",
      },
    });
    logger.info("Demo admin + attendant ensured for one-click demo login");
  }

  if (existingUsers > 1 && existingLocations > 0) {
    logger.info("✅ Database already seeded. Skipping seed operation.");
    logger.info("💡 To re-seed, clear the database first.");
    return;
  }

  // ============ SEED ADMIN USER ============
  const adminEmail = ENV.ADMIN_EMAIL;
  const adminPassword = ENV.ADMIN_PASSWORD;
  const adminFirstName = ENV.ADMIN_FIRSTNAME;
  const adminLastName = ENV.ADMIN_LASTNAME;
  const adminPhone = ENV.ADMIN_PHONE;

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.admin.upsert({
    where: { email: adminEmail },
    update: {
      firstName: adminFirstName,
      lastName: adminLastName,
      password: hashedPassword,
      phone: adminPhone,
      updatedAt: new Date(),
    },
    create: {
      email: adminEmail,
      firstName: adminFirstName,
      lastName: adminLastName,
      password: hashedPassword,
      phone: adminPhone,
    },
  });

  logger.info({
    message: "Admin user seeded successfully",
    admin: { id: admin.id, email: admin.email },
  });

  // ============ SEED SAMPLE DATA (separate opt-in) ============
  // Sample attendants/events are demo furniture, NOT part of first-boot
  // setup. Gating them behind their own flag means creating the real admin
  // in production can never also plant example accounts - and even when
  // seeded, the sample users get random passwords (they are logged into via
  // data inspection or password reset, never a published credential).
  if (!ENV.SEED_SAMPLE_DATA) {
    logger.info(
      "Sample data skipped (SEED_SAMPLE_DATA is not true). Seeding complete."
    );
    return;
  }

  // ============ SEED REGULAR USERS ============
  const regularPassword = await bcrypt.hash(
    crypto.randomBytes(24).toString("hex"),
    10
  );

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "john.doe@example.com" },
      update: {},
      create: {
        email: "john.doe@example.com",
        firstName: "John",
        lastName: "Doe",
        password: regularPassword,
        phone: "+233201234567",
      },
    }),
    prisma.user.upsert({
      where: { email: "jane.smith@example.com" },
      update: {},
      create: {
        email: "jane.smith@example.com",
        firstName: "Jane",
        lastName: "Smith",
        password: regularPassword,
        phone: "+233201234568",
      },
    }),
    prisma.user.upsert({
      where: { email: "michael.brown@example.com" },
      update: {},
      create: {
        email: "michael.brown@example.com",
        firstName: "Michael",
        lastName: "Brown",
        password: regularPassword,
        phone: "+233201234569",
      },
    }),
    prisma.user.upsert({
      where: { email: "sarah.johnson@example.com" },
      update: {},
      create: {
        email: "sarah.johnson@example.com",
        firstName: "Sarah",
        lastName: "Johnson",
        password: regularPassword,
        phone: "+233201234570",
      },
    }),
    prisma.user.upsert({
      where: { email: "david.wilson@example.com" },
      update: {},
      create: {
        email: "david.wilson@example.com",
        firstName: "David",
        lastName: "Wilson",
        password: regularPassword,
        phone: "+233201234571",
      },
    }),
  ]);

  logger.info(`✅ ${users.length} regular users seeded successfully`);

  // ============ SEED LOCATIONS ============
  const locationData = [
    {
      name: "Accra International Conference Centre",
      city: "Accra",
      country: "Ghana",
    },
    {
      name: "University of Ghana, Legon",
      city: "Accra",
      country: "Ghana",
    },
    {
      name: "Kumasi Cultural Centre",
      city: "Kumasi",
      country: "Ghana",
    },
    {
      name: "Cape Coast Castle",
      city: "Cape Coast",
      country: "Ghana",
    },
    {
      name: "Tamale Sports Stadium",
      city: "Tamale",
      country: "Ghana",
    },
  ];

  // Check if locations already exist
  const existingLocationNames = await prisma.location.findMany({
    where: {
      name: {
        in: locationData.map((l) => l.name),
      },
    },
    select: { name: true, id: true },
  });

  const existingLocationMap = new Map(
    existingLocationNames.map((l) => [l.name, l])
  );

  const locations = [];
  for (const locData of locationData) {
    if (existingLocationMap.has(locData.name)) {
      locations.push(existingLocationMap.get(locData.name));
    } else {
      const newLocation = await prisma.location.create({
        data: locData,
      });
      locations.push(newLocation);
    }
  }

  logger.info(`✅ ${locations.length} locations seeded successfully`);

  // ============ SEED EVENTS ============
  const today = eventCalendarDay();

  // Check if events already exist
  const existingEventsCount = await prisma.event.count();

  if (existingEventsCount > 0) {
    logger.info(
      "✅ Events already seeded. Skipping event, session, and attendance seeding."
    );
    logger.info("\n🎉 Database seeding completed successfully!");
    return;
  }

  // Past Event (completed) - ONE-TIME EVENT
  const pastEvent = await prisma.event.create({
    data: {
      title: "Annual Tech Conference 2024",
      description:
        "A comprehensive technology conference featuring industry leaders and innovators.",
      startDate: addDays(today, -30),
      endDate: addDays(today, -28),
      isRecurring: false,
      recurrenceInterval: 1,
      durationDays: 3,
      startTime: "08:00",
      endTime: "18:00",
      locationId: locations[0].id,
      type: "Conference",
    },
  });

  // Current Event (ongoing) - ONE-TIME EVENT
  const currentEvent = await prisma.event.create({
    data: {
      title: "Web Development Workshop",
      description:
        "Hands-on workshop covering modern web development practices and frameworks.",
      startDate: addDays(today, -2),
      endDate: addDays(today, 5),
      isRecurring: false,
      recurrenceInterval: 1,
      durationDays: 8,
      startTime: "09:00",
      endTime: "17:00",
      locationId: locations[1].id,
      type: "Workshop",
    },
  });

  // Recurring Event (weekly training) - RECURRING EVENT
  const recurringEvent = await prisma.event.create({
    data: {
      title: "Weekly Team Meeting",
      description: "Regular team sync-up and project updates.",
      startDate: addDays(today, -14),
      endDate: addDays(today, 90),
      isRecurring: true,
      recurrenceInterval: 7,
      durationDays: 1,
      startTime: "10:00",
      endTime: "12:00",
      locationId: locations[2].id,
      type: "Meeting",
    },
  });

  // Future Event - ONE-TIME EVENT
  const futureEvent = await prisma.event.create({
    data: {
      title: "Product Launch Event",
      description:
        "Exciting product launch with live demonstrations and Q&A sessions.",
      startDate: addDays(today, 15),
      endDate: addDays(today, 15),
      isRecurring: false,
      recurrenceInterval: 1,
      durationDays: 1,
      startTime: "14:00",
      endTime: "20:00",
      locationId: locations[3].id,
      type: "Launch",
    },
  });

  // Another Recurring Event (daily standup) - RECURRING EVENT
  const dailyStandup = await prisma.event.create({
    data: {
      title: "Daily Standup",
      description: "Quick daily check-in with the team.",
      startDate: addDays(today, -7),
      endDate: addDays(today, 30),
      isRecurring: true,
      recurrenceInterval: 1, // Every day
      durationDays: 1,
      startTime: "09:00",
      endTime: "09:30",
      locationId: locations[4].id,
      type: "Standup",
    },
  });

  const events = [
    pastEvent,
    currentEvent,
    recurringEvent,
    futureEvent,
    dailyStandup,
  ];
  logger.info(`✅ ${events.length} events seeded successfully`);

  // ============ SEED SESSIONS ============
  // Same convention the session worker writes: date-only UTC-midnight
  // startDate (the venue calendar day) and UTC-placed HH:MM times, batched
  // with createMany.
  const sessionsByEvent = new Map();

  const seedSessions = async (event, firstDay, count, stepDays, startTime, endTime) => {
    const rows = Array.from({ length: count }, (_, i) => {
      const day = addUtcDays(utcDayStart(firstDay), i * stepDays);
      return {
        eventId: event.id,
        startDate: day,
        endDate: day,
        startTime: utcDayAtTime(day, startTime),
        endTime: utcDayAtTime(day, endTime),
      };
    });
    await prisma.session.createMany({ data: rows, skipDuplicates: true });
    const sessions = await prisma.session.findMany({
      where: { eventId: event.id },
      orderBy: { startDate: "asc" },
    });
    sessionsByEvent.set(event.id, sessions);
    return sessions;
  };

  const pastEventSessions = await seedSessions(
    pastEvent, pastEvent.startDate, 3, 1, "08:00", "18:00"
  );
  const currentEventSessions = await seedSessions(
    currentEvent, currentEvent.startDate, 8, 1, "09:00", "17:00"
  );
  const recurringEventSessions = await seedSessions(
    recurringEvent, recurringEvent.startDate, 3, 7, "10:00", "12:00"
  );
  const dailyStandupSessions = await seedSessions(
    dailyStandup, dailyStandup.startDate, 8, 1, "09:00", "09:30"
  );

  const totalSessions =
    pastEventSessions.length +
    currentEventSessions.length +
    recurringEventSessions.length +
    dailyStandupSessions.length;

  logger.info(`✅ ${totalSessions} sessions seeded successfully`);

  // ============ SEED ATTENDANCE RECORDS ============
  const attendanceRecords = [];

  // Helper function to create attendance
  const createAttendance = async (
    userId,
    sessionId,
    status,
    checkInDelay = 0,
    hasCheckOut = true
  ) => {
    const allSessions = [
      ...pastEventSessions,
      ...currentEventSessions,
      ...recurringEventSessions,
      ...dailyStandupSessions,
    ];
    const session = allSessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const checkInTime = new Date(session.startTime);
    checkInTime.setMinutes(checkInTime.getMinutes() + checkInDelay);

    const checkOutTime = hasCheckOut ? new Date(session.endTime) : null;

    return prisma.attendance.create({
      data: {
        userId,
        sessionId,
        status,
        checkInTime,
        checkOutTime,
      },
    });
  };

  // ============ ONE-TIME EVENT: Past Event (only ONE attendance per user) ============
  // Each user can only attend the FIRST session of this one-time event
  const pastFirstSession = pastEventSessions[0];
  for (const user of users) {
    const attendance = await createAttendance(
      user.id,
      pastFirstSession.id,
      AttendanceStatus.PRESENT,
      Math.floor(Math.random() * 30),
      true
    );
    if (attendance) attendanceRecords.push(attendance);
  }

  // ============ ONE-TIME EVENT: Current Event (only ONE attendance per user) ============
  // Each user can only attend the FIRST session of this one-time ongoing event
  const currentFirstSession = currentEventSessions[0];

  // User 1: Present
  attendanceRecords.push(
    await createAttendance(
      users[0].id,
      currentFirstSession.id,
      AttendanceStatus.PRESENT,
      10,
      true
    )
  );

  // User 2: Late
  attendanceRecords.push(
    await createAttendance(
      users[1].id,
      currentFirstSession.id,
      AttendanceStatus.LATE,
      70,
      true
    )
  );

  // User 3: Present
  attendanceRecords.push(
    await createAttendance(
      users[2].id,
      currentFirstSession.id,
      AttendanceStatus.PRESENT,
      15,
      false // Still attending
    )
  );

  // User 4: Present
  attendanceRecords.push(
    await createAttendance(
      users[3].id,
      currentFirstSession.id,
      AttendanceStatus.PRESENT,
      25,
      false
    )
  );

  // User 5: Not attending this event

  // ============ RECURRING EVENT: Weekly Team Meeting (MULTIPLE attendance per user) ============
  for (const session of recurringEventSessions) {
    // Each user can attend each session
    for (let i = 0; i < 3; i++) {
      const attendance = await createAttendance(
        users[i].id,
        session.id,
        AttendanceStatus.PRESENT,
        Math.floor(Math.random() * 20),
        true
      );
      if (attendance) attendanceRecords.push(attendance);
    }
  }

  // ============ RECURRING EVENT: Daily Standup (MULTIPLE attendance per user) ============
  for (const session of dailyStandupSessions) {
    for (const user of users) {
      if (Math.random() > 0.2) {
        // 80% attendance rate
        const isLate = Math.random() > 0.8;
        const attendance = await createAttendance(
          user.id,
          session.id,
          isLate ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
          isLate
            ? Math.floor(Math.random() * 15) + 5
            : Math.floor(Math.random() * 5),
          true
        );
        if (attendance) attendanceRecords.push(attendance);
      }
    }
  }

  logger.info(
    `✅ ${
      attendanceRecords.filter(Boolean).length
    } attendance records seeded successfully`
  );

  // ============ SUMMARY ============
  logger.info("\n🎉 Database seeding completed successfully!");
  logger.info("📊 Seeding Summary:");
  logger.info(
    `   - Users: ${users.length + 1} (${users.length} regular + 1 admin)`
  );
  logger.info(`   - Locations: ${locations.length}`);
  logger.info(`   - Events: ${events.length}`);
  logger.info(
    `     • One-time events: 3 (Past Conference, Current Workshop, Future Launch)`
  );
  logger.info(`     • Recurring events: 2 (Weekly Meeting, Daily Standup)`);
  logger.info(`   - Sessions: ${totalSessions}`);
  logger.info(
    `   - Attendance Records: ${attendanceRecords.filter(Boolean).length}`
  );
  logger.info("\n🔍 Attendance Pattern:");
  logger.info(`   - One-time events: Each user has max 1 attendance record`);
  logger.info(
    `   - Recurring events: Users can have multiple attendance records`
  );
  logger.info("\n📝 Sample users (john.doe@example.com, ...) have RANDOM passwords;");
  logger.info("   sign them in via OTP login or a password reset.");
}

main()
  .catch((e) => {
    logger.error(e, "❌ Error during database seeding");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
