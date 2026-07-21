// scripts/demo-seed.mjs
//
// Populates a demo database with rich, realistic attendance/anomaly/evidence
// data so the admin analytics dashboard has something to render. Run against
// an ISOLATED database (bethere_demo) - never the dev DB.
import bcrypt from "bcrypt";
import ENV from "../src/config/env.js";
import { prisma } from "../src/config/prisma-client.js";
import {
  addUtcDays,
  eventCalendarDay,
  eventTimeOnDay,
} from "../src/utils/time-context.js";

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (p) => Math.random() < p;

const today = eventCalendarDay(new Date());
const now = new Date();

async function main() {
  console.log("Seeding demo data...");

  // --- admin (known credentials for the visual login) ---
  const password = await bcrypt.hash("Password123!", 10);
  await prisma.admin.upsert({
    where: { email: "admin@demo.local" },
    update: { password },
    create: {
      firstName: "Demo",
      lastName: "Admin",
      email: "admin@demo.local",
      password,
      twoFactorEnabled: false,
    },
  });

  // Ensure the app's one-click demo-login accounts exist too, so the demo
  // login button works after a rich seed (mirrors prisma/seed.js). Upserts so
  // the rich seed can safely follow the standard seed.
  await prisma.admin.upsert({
    where: { email: ENV.DEMO_ADMIN_EMAIL },
    update: { password },
    create: { firstName: "Demo", lastName: "Admin", email: ENV.DEMO_ADMIN_EMAIL, password },
  });
  const demoAttendant = await prisma.user.upsert({
    where: { email: ENV.DEMO_ATTENDANT_EMAIL },
    update: { password, faceScanEnc: "demo-encrypted-template" },
    create: {
      firstName: "Demo",
      lastName: "Attendant",
      email: ENV.DEMO_ATTENDANT_EMAIL,
      password,
      faceScanEnc: "demo-encrypted-template",
      biometricConsentAt: addUtcDays(today, -60),
      biometricConsentVersion: "2026-07-v1",
    },
  });

  // --- locations ---
  const locData = [
    { name: "Main Auditorium", city: "Accra", country: "Ghana" },
    { name: "Innovation Lab", city: "Accra", country: "Ghana" },
    { name: "Training Room B", city: "Kumasi", country: "Ghana" },
    { name: "Riverside Hall", city: "Takoradi", country: "Ghana" },
  ];
  const locations = [];
  for (const data of locData) locations.push(await prisma.location.create({ data }));

  // --- attendants (25; ~80% enrolled) ---
  const users = [];
  const first = ["Ama", "Kofi", "Yaa", "Kwame", "Abena", "Kojo", "Esi", "Yaw", "Adwoa", "Fiifi", "Akosua", "Kwesi", "Efua", "Nana", "Maya", "Zara", "Ibrahim", "Fatima", "Musa", "Aisha", "Sena", "Elorm", "Dela", "Selorm", "Mawuli"];
  for (let i = 0; i < 25; i += 1) {
    const enrolled = chance(0.8);
    users.push(
      await prisma.user.create({
        data: {
          firstName: first[i],
          lastName: `A${i}`,
          email: `attendant${i}@demo.local`,
          password,
          faceScanEnc: enrolled ? "demo-encrypted-template" : null,
          biometricConsentAt: enrolled ? addUtcDays(today, -randInt(30, 90)) : null,
          biometricConsentVersion: enrolled ? "2026-07-v1" : null,
          faceLastUsedAt: enrolled ? addUtcDays(today, -randInt(0, 10)) : null,
          phoneVerified: chance(0.7),
        },
      })
    );
  }
  // Include the demo-login attendant so its personal dashboard is rich too.
  users.push(demoAttendant);

  // --- events + sessions ---
  const eventConfigs = [
    { title: "Morning Standup", isRecurring: true, startTime: "09:00", endTime: "11:00", type: "MEETING", loc: 1, cadence: 1, span: 40 },
    { title: "Weekly Sync", isRecurring: true, startTime: "14:00", endTime: "16:00", type: "MEETING", loc: 0, cadence: 7, span: 42 },
    { title: "Evening Class", isRecurring: true, startTime: "18:00", endTime: "20:00", type: "CLASS", loc: 2, cadence: 2, span: 40 },
    { title: "Security Training", isRecurring: false, startTime: "10:00", endTime: "12:00", type: "TRAINING", loc: 2, single: 15 },
    { title: "All-Day Conference", isRecurring: false, startTime: "00:00", endTime: "23:59", type: "EVENT", loc: 3, single: 0 },
  ];

  const sessions = []; // { id, day, startInstant, eventId, isRecurring, isToday, window }
  for (const cfg of eventConfigs) {
    const location = locations[cfg.loc];
    const event = await prisma.event.create({
      data: {
        title: cfg.title,
        description: `${cfg.title} at ${location.name}`,
        startDate: addUtcDays(today, -(cfg.span ?? cfg.single ?? 0)),
        endDate: today,
        isRecurring: cfg.isRecurring,
        recurrenceInterval: cfg.cadence ?? 1,
        durationDays: 1,
        startTime: cfg.startTime,
        endTime: cfg.endTime,
        locationId: location.id,
        type: cfg.type,
      },
    });

    const days = [];
    if (cfg.isRecurring) {
      for (let d = cfg.span; d >= 0; d -= cfg.cadence) days.push(d);
    } else {
      days.push(cfg.single);
    }

    for (const d of days) {
      const day = addUtcDays(today, -d);
      const startInstant = eventTimeOnDay(day, cfg.startTime);
      const endInstant = eventTimeOnDay(day, cfg.endTime === "23:59" ? "23:59" : cfg.endTime);
      const session = await prisma.session.create({
        data: {
          eventId: event.id,
          startDate: day,
          endDate: day,
          startTime: startInstant,
          endTime: endInstant,
          finalizedAt: d === 0 ? null : addUtcDays(day, 1),
        },
      });
      sessions.push({
        id: session.id,
        eventId: event.id,
        startInstant,
        isToday: d === 0,
        allDay: cfg.startTime === "00:00",
      });
    }
  }

  // --- attendance ---
  const attendanceRows = [];
  for (const session of sessions) {
    // 55-90% of attendants turn up to each session.
    const turnout = rand(0.55, 0.9);
    for (const user of users) {
      if (!chance(turnout)) {
        // absent row (finalized past sessions only)
        if (!session.isToday && chance(0.5)) {
          attendanceRows.push({
            userId: user.id,
            sessionId: session.id,
            status: "ABSENT",
            checkInTime: null,
            createdAt: addUtcDays(new Date(session.startInstant), 1),
          });
        }
        continue;
      }
      // minutes after the scheduled open
      const lateMinutes = chance(0.72) ? rand(0, 45) : rand(46, 150);
      const checkIn = new Date(session.startInstant.getTime() + lateMinutes * 60_000);
      const status = lateMinutes <= 60 ? "PRESENT" : "LATE";
      const stillIn = session.isToday && session.allDay && chance(0.5);
      attendanceRows.push({
        userId: user.id,
        sessionId: session.id,
        status,
        checkInTime: checkIn,
        checkOutTime: stillIn ? null : new Date(checkIn.getTime() + rand(45, 180) * 60_000),
        autoCheckedOut: !session.isToday && chance(0.2),
        createdAt: checkIn,
      });
    }
  }
  // de-dupe on [userId, sessionId] just in case, then bulk insert
  const seen = new Set();
  const deduped = attendanceRows.filter((row) => {
    const key = `${row.userId}-${row.sessionId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (let i = 0; i < deduped.length; i += 500) {
    await prisma.attendance.createMany({ data: deduped.slice(i, i + 500) });
  }

  // --- anomalies + evidence ---
  const TYPES = ["LIVENESS_FAILED", "LIVENESS_FAILED", "REPLAY_SUSPECTED", "DUPLICATE_DESCRIPTOR", "RAPID_ATTEMPTS"];
  const SEV = ["LOW", "MEDIUM", "MEDIUM", "HIGH"];
  for (let i = 0; i < 45; i += 1) {
    const daysAgo = randInt(0, 39);
    const createdAt = new Date(addUtcDays(today, -daysAgo).getTime() + rand(8, 20) * 3_600_000);
    if (createdAt > now) continue;
    const resolved = chance(0.6);
    const user = pick(users);
    const session = pick(sessions);
    const flag = await prisma.anomalyFlag.create({
      data: {
        userId: user.id,
        eventId: session.eventId,
        type: pick(TYPES),
        severity: pick(SEV),
        detail: { note: "demo anomaly" },
        resolvedAt: resolved ? new Date(createdAt.getTime() + rand(1, 48) * 3_600_000) : null,
        createdAt,
      },
    });
    if (chance(0.65)) {
      await prisma.attendanceEvidence.create({
        data: {
          userId: user.id,
          eventId: session.eventId,
          frameUrls: [],
          livenessScore: Number(rand(0.05, 0.55).toFixed(3)),
          matchDistance: Number(rand(0.4, 0.95).toFixed(3)),
          reason: "demo evidence",
          expiresAt: addUtcDays(today, 30),
          createdAt,
          attendanceId: flag.id, // arbitrary demo link
        },
      });
    }
  }

  const counts = {
    admins: await prisma.admin.count(),
    users: await prisma.user.count(),
    events: await prisma.event.count(),
    sessions: await prisma.session.count(),
    attendance: await prisma.attendance.count(),
    anomalies: await prisma.anomalyFlag.count(),
    evidence: await prisma.attendanceEvidence.count(),
  };
  console.log("Done:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
