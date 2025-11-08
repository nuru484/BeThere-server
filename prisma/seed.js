// prisma/seed.ts
import { role, AttendanceStatus } from "@prisma/client";
import prisma from "../src/config/prisma-client.js";
import * as bcrypt from "bcrypt";
import logger from "../src/utils/logger.js";
import ENV from "../src/config/env.js";
import { addDays, startOfDay, setHours, setMinutes } from "date-fns";

async function main() {
  logger.info("🌱 Starting database seeding...");

  // ============ SEED ADMIN USER ============
  const adminEmail = ENV.ADMIN_EMAIL;
  const adminPassword = ENV.ADMIN_PASSWORD;
  const adminFirstName = ENV.ADMIN_FIRSTNAME;
  const adminLastName = ENV.ADMIN_LASTNAME;
  const adminPhone = ENV.ADMIN_PHONE;

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      firstName: adminFirstName,
      lastName: adminLastName,
      password: hashedPassword,
      role: role.ADMIN,
      phone: adminPhone,
      updatedAt: new Date(),
    },
    create: {
      email: adminEmail,
      firstName: adminFirstName,
      lastName: adminLastName,
      password: hashedPassword,
      role: role.ADMIN,
      phone: adminPhone,
    },
  });

  logger.info({
    message: "✅ Admin user seeded successfully",
    admin: {
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      role: admin.role,
    },
  });

  // ============ SEED REGULAR USERS ============
  const regularPassword = await bcrypt.hash("Password123!", 10);

  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: "john.doe@example.com" },
      update: {},
      create: {
        email: "john.doe@example.com",
        firstName: "John",
        lastName: "Doe",
        password: regularPassword,
        role: role.USER,
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
        role: role.USER,
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
        role: role.USER,
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
        role: role.USER,
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
        role: role.USER,
        phone: "+233201234571",
      },
    }),
  ]);

  logger.info(`✅ ${users.length} regular users seeded successfully`);

  // ============ SEED LOCATIONS ============
  const locations = await Promise.all([
    prisma.location.create({
      data: {
        name: "Accra International Conference Centre",
        latitude: 5.556818,
        longitude: -0.196477,
        city: "Accra",
        country: "Ghana",
      },
    }),
    prisma.location.create({
      data: {
        name: "University of Ghana, Legon",
        latitude: 5.651358,
        longitude: -0.186964,
        city: "Accra",
        country: "Ghana",
      },
    }),
    prisma.location.create({
      data: {
        name: "Kumasi Cultural Centre",
        latitude: 6.687904,
        longitude: -1.624027,
        city: "Kumasi",
        country: "Ghana",
      },
    }),
    prisma.location.create({
      data: {
        name: "Cape Coast Castle",
        latitude: 5.10579,
        longitude: -1.24681,
        city: "Cape Coast",
        country: "Ghana",
      },
    }),
    prisma.location.create({
      data: {
        name: "Tamale Sports Stadium",
        latitude: 9.40045,
        longitude: -0.83918,
        city: "Tamale",
        country: "Ghana",
      },
    }),
  ]);

  logger.info(`✅ ${locations.length} locations seeded successfully`);

  // ============ SEED EVENTS ============
  const now = new Date();
  const today = startOfDay(now);

  // Past Event (completed)
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

  // Current Event (ongoing)
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

  // Recurring Event (weekly training)
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

  // Future Event
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

  // Another Recurring Event (daily standup)
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
  const sessions = [];

  // Past Event Sessions (3 days)
  for (let i = 0; i < 3; i++) {
    const sessionDate = addDays(startOfDay(pastEvent.startDate), i);
    const session = await prisma.session.create({
      data: {
        eventId: pastEvent.id,
        startDate: sessionDate,
        endDate: sessionDate,
        startTime: setMinutes(setHours(sessionDate, 8), 0),
        endTime: setMinutes(setHours(sessionDate, 18), 0),
      },
    });
    sessions.push(session);
  }

  // Current Event Sessions (8 days)
  for (let i = 0; i < 8; i++) {
    const sessionDate = addDays(startOfDay(currentEvent.startDate), i);
    const session = await prisma.session.create({
      data: {
        eventId: currentEvent.id,
        startDate: sessionDate,
        endDate: sessionDate,
        startTime: setMinutes(setHours(sessionDate, 9), 0),
        endTime: setMinutes(setHours(sessionDate, 17), 0),
      },
    });
    sessions.push(session);
  }

  // Recurring Event Sessions (weekly for past 2 weeks + current week)
  for (let i = 0; i < 3; i++) {
    const sessionDate = addDays(startOfDay(recurringEvent.startDate), i * 7);
    const session = await prisma.session.create({
      data: {
        eventId: recurringEvent.id,
        startDate: sessionDate,
        endDate: sessionDate,
        startTime: setMinutes(setHours(sessionDate, 10), 0),
        endTime: setMinutes(setHours(sessionDate, 12), 0),
      },
    });
    sessions.push(session);
  }

  // Daily Standup Sessions (past 7 days)
  for (let i = 0; i < 8; i++) {
    const sessionDate = addDays(startOfDay(dailyStandup.startDate), i);
    const session = await prisma.session.create({
      data: {
        eventId: dailyStandup.id,
        startDate: sessionDate,
        endDate: sessionDate,
        startTime: setMinutes(setHours(sessionDate, 9), 0),
        endTime: setMinutes(setHours(sessionDate, 9), 30),
      },
    });
    sessions.push(session);
  }

  logger.info(`✅ ${sessions.length} sessions seeded successfully`);

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
    const session = sessions.find((s) => s.id === sessionId);
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

  // Create attendance for past event sessions (all users attended)
  for (const session of sessions.slice(0, 3)) {
    for (const user of users) {
      const attendance = await createAttendance(
        user.id,
        session.id,
        AttendanceStatus.PRESENT,
        Math.floor(Math.random() * 30), // Random check-in within 30 minutes
        true
      );
      if (attendance) attendanceRecords.push(attendance);
    }
  }

  // Create attendance for current event sessions (varied attendance)
  for (let i = 0; i < 5; i++) {
    const session = sessions[3 + i];
    if (!session) continue;

    // User 1: Always present and on time
    attendanceRecords.push(
      await createAttendance(
        users[0].id,
        session.id,
        AttendanceStatus.PRESENT,
        10,
        i < 3
      )
    );

    // User 2: Sometimes late
    attendanceRecords.push(
      await createAttendance(
        users[1].id,
        session.id,
        i % 2 === 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
        i % 2 === 0 ? 70 : 20,
        i < 3
      )
    );

    // User 3: Mix of present and absent
    if (i % 3 !== 0) {
      attendanceRecords.push(
        await createAttendance(
          users[2].id,
          session.id,
          AttendanceStatus.PRESENT,
          15,
          i < 3
        )
      );
    }

    // User 4: Mostly present
    if (i !== 4) {
      attendanceRecords.push(
        await createAttendance(
          users[3].id,
          session.id,
          AttendanceStatus.PRESENT,
          25,
          i < 3
        )
      );
    }

    // User 5: Irregular attendance
    if (i % 2 === 0) {
      attendanceRecords.push(
        await createAttendance(
          users[4].id,
          session.id,
          i === 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT,
          i === 0 ? 80 : 30,
          i < 2
        )
      );
    }
  }

  // Create attendance for recurring event sessions
  for (const session of sessions.slice(11, 14)) {
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

  // Create attendance for daily standup (varied patterns)
  for (const session of sessions.slice(14, 21)) {
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
  logger.info(`   - Sessions: ${sessions.length}`);
  logger.info(
    `   - Attendance Records: ${attendanceRecords.filter(Boolean).length}`
  );
  logger.info("\n📝 Test User Credentials:");
  logger.info(`   Email: john.doe@example.com | Password: Password123!`);
  logger.info(`   Email: jane.smith@example.com | Password: Password123!`);
  logger.info(`   (All regular users have the same password)`);
}

main()
  .catch((e) => {
    logger.error(e, "❌ Error during database seeding");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
