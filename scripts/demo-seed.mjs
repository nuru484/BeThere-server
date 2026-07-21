// scripts/demo-seed.mjs
//
// Idempotent, time-anchored demo seed. Run it once and the site is full of
// realistic data that exercises EVERY dashboard, report, filter and live view;
// run it again weeks or months later and it refreshes the whole dataset so the
// dates are recent again (a visitor always sees "active" data). It is safe to
// re-run: it owns a fixed set of demo people/events (matched by email/title)
// and only ever clears and regenerates THAT data - your own records are left
// alone. Everything is anchored to today via the venue-timezone helpers, so
// the window slides forward every time you run it.
import bcrypt from "bcrypt";
import ENV from "../src/config/env.js";
import { prisma } from "../src/config/prisma-client.js";
import {
  addUtcDays,
  currentTimeStringInEventTz,
  eventCalendarDay,
  eventTimeOnDay,
} from "../src/utils/time-context.js";

const rand = (min, max) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const chance = (p) => Math.random() < p;

const now = new Date();
const today = eventCalendarDay(now);

const ATTENDANT_COUNT = 25;
const FIRST_NAMES = ["Ama", "Kofi", "Yaa", "Kwame", "Abena", "Kojo", "Esi", "Yaw", "Adwoa", "Fiifi", "Akosua", "Kwesi", "Efua", "Nana", "Maya", "Zara", "Ibrahim", "Fatima", "Musa", "Aisha", "Sena", "Elorm", "Dela", "Selorm", "Mawuli"];

async function findOrCreateLocation(data) {
  const existing = await prisma.location.findFirst({ where: { name: data.name } });
  return existing ?? prisma.location.create({ data });
}

async function findOrCreateEvent(data) {
  const existing = await prisma.event.findFirst({ where: { title: data.title } });
  // Update on re-run so dates/windows (especially the live event) stay current.
  return existing
    ? prisma.event.update({ where: { id: existing.id }, data })
    : prisma.event.create({ data });
}

async function main() {
  console.log("Seeding demo data (idempotent, anchored to today)...");
  const password = await bcrypt.hash("Password123!", 10);

  // --- principals -----------------------------------------------------------
  // Known form-login admin + the app's one-click demo-login accounts.
  await prisma.admin.upsert({
    where: { email: "admin@demo.local" },
    update: { password },
    create: { firstName: "Demo", lastName: "Admin", email: "admin@demo.local", password, twoFactorEnabled: false },
  });
  await prisma.admin.upsert({
    where: { email: ENV.DEMO_ADMIN_EMAIL },
    update: { password },
    create: { firstName: "Demo", lastName: "Admin", email: ENV.DEMO_ADMIN_EMAIL, password },
  });
  const demoAttendant = await prisma.user.upsert({
    where: { email: ENV.DEMO_ATTENDANT_EMAIL },
    update: { password, faceScanEnc: "demo-encrypted-template", faceLastUsedAt: addUtcDays(today, -1) },
    create: {
      firstName: "Demo",
      lastName: "Attendant",
      email: ENV.DEMO_ATTENDANT_EMAIL,
      password,
      faceScanEnc: "demo-encrypted-template",
      biometricConsentAt: addUtcDays(today, -60),
      biometricConsentVersion: "2026-07-v1",
      phoneVerified: true,
    },
  });

  // Attendants (deterministic identities so re-runs update rather than pile up;
  // ~80% enrolled to give enrollment-coverage something to show).
  const users = [];
  for (let i = 0; i < ATTENDANT_COUNT; i += 1) {
    const enrolled = i % 5 !== 0;
    users.push(
      await prisma.user.upsert({
        where: { email: `attendant${i}@demo.local` },
        update: {
          faceScanEnc: enrolled ? "demo-encrypted-template" : null,
          faceLastUsedAt: enrolled ? addUtcDays(today, -(i % 10)) : null,
        },
        create: {
          firstName: FIRST_NAMES[i],
          lastName: `A${i}`,
          email: `attendant${i}@demo.local`,
          password,
          faceScanEnc: enrolled ? "demo-encrypted-template" : null,
          biometricConsentAt: enrolled ? addUtcDays(today, -(30 + i)) : null,
          biometricConsentVersion: enrolled ? "2026-07-v1" : null,
          faceLastUsedAt: enrolled ? addUtcDays(today, -(i % 10)) : null,
          phoneVerified: i % 3 !== 0,
        },
      })
    );
  }
  users.push(demoAttendant);

  // --- locations (varied cities/countries so location filters have range) ---
  const locations = [];
  for (const data of [
    { name: "Main Auditorium", city: "Accra", country: "Ghana" },
    { name: "Innovation Lab", city: "Accra", country: "Ghana" },
    { name: "Training Room B", city: "Kumasi", country: "Ghana" },
    { name: "Riverside Hall", city: "Takoradi", country: "Ghana" },
  ]) {
    locations.push(await findOrCreateLocation(data));
  }

  // A window around "now" for the live event, so one session is always open at
  // run time (drives the live strip and the attendant check-in CTA). Falls back
  // to all-day if the window would wrap past midnight.
  let liveStart = currentTimeStringInEventTz(new Date(now.getTime() - 40 * 60_000));
  let liveEnd = currentTimeStringInEventTz(new Date(now.getTime() + 160 * 60_000));
  if (liveStart >= liveEnd) {
    liveStart = "00:00";
    liveEnd = "23:59";
  }

  // --- events (recurring + one-off + a live-now + an upcoming) --------------
  // offsets are DAYS FROM TODAY: negative = past, 0 = today, positive = future.
  const eventConfigs = [
    { title: "Morning Standup", isRecurring: true, startTime: "09:00", endTime: "11:00", type: "MEETING", loc: 1, cadence: 1, span: 45, future: 10 },
    { title: "Weekly Sync", isRecurring: true, startTime: "14:00", endTime: "16:00", type: "MEETING", loc: 0, cadence: 7, span: 49, future: 14 },
    { title: "Evening Class", isRecurring: true, startTime: "18:00", endTime: "20:00", type: "CLASS", loc: 2, cadence: 2, span: 40, future: 10 },
    { title: "Security Training", isRecurring: false, startTime: "10:00", endTime: "12:00", type: "TRAINING", loc: 2, offset: -12 },
    { title: "Community Meetup", isRecurring: false, startTime: "15:00", endTime: "17:00", type: "EVENT", loc: 3, offset: -3 },
    { title: "Team Huddle", isRecurring: false, startTime: liveStart, endTime: liveEnd, type: "MEETING", loc: 1, offset: 0, live: true },
    { title: "Annual Gala", isRecurring: false, startTime: "18:00", endTime: "22:00", type: "EVENT", loc: 0, offset: 5 },
  ];

  const events = [];
  const eventByTitle = new Map();
  for (const cfg of eventConfigs) {
    const location = locations[cfg.loc];
    const firstOff = cfg.isRecurring ? -cfg.span : cfg.offset;
    const lastOff = cfg.isRecurring ? cfg.future : cfg.offset;
    const event = await findOrCreateEvent({
      title: cfg.title,
      description: `${cfg.title} at ${location.name}`,
      startDate: addUtcDays(today, firstOff),
      endDate: addUtcDays(today, lastOff),
      isRecurring: cfg.isRecurring,
      recurrenceInterval: cfg.cadence ?? 1,
      durationDays: 1,
      startTime: cfg.startTime,
      endTime: cfg.endTime,
      locationId: location.id,
      type: cfg.type,
    });
    events.push(event);
    eventByTitle.set(cfg.title, { event, cfg });
  }

  // Retire demo events that earlier versions of this seed created but the
  // current config no longer manages, so a re-run never leaves stale data.
  const RETIRED_TITLES = ["All-Day Conference"];
  const retired = await prisma.event.findMany({
    where: { title: { in: RETIRED_TITLES } },
    select: { id: true },
  });
  if (retired.length) {
    const retiredIds = retired.map((event) => event.id);
    await prisma.anomalyFlag.deleteMany({ where: { eventId: { in: retiredIds } } });
    await prisma.attendanceEvidence.deleteMany({ where: { eventId: { in: retiredIds } } });
    await prisma.session.deleteMany({ where: { eventId: { in: retiredIds } } });
    await prisma.event.deleteMany({ where: { id: { in: retiredIds } } });
  }

  // --- clear this seed's OWN transactional data, then regenerate fresh -------
  // Scoped to the demo events by id, so real events/attendance are untouched.
  // Deleting sessions cascades to their attendance rows.
  const demoEventIds = events.map((event) => event.id);
  await prisma.anomalyFlag.deleteMany({ where: { eventId: { in: demoEventIds } } });
  await prisma.attendanceEvidence.deleteMany({ where: { eventId: { in: demoEventIds } } });
  await prisma.session.deleteMany({ where: { eventId: { in: demoEventIds } } });

  // --- sessions -------------------------------------------------------------
  const sessions = [];
  for (const { event, cfg } of eventByTitle.values()) {
    const offsets = [];
    if (cfg.isRecurring) {
      for (let off = -cfg.span; off <= cfg.future; off += cfg.cadence) offsets.push(off);
    } else {
      offsets.push(cfg.offset);
    }
    for (const off of offsets) {
      const day = addUtcDays(today, off);
      const startInstant = eventTimeOnDay(day, cfg.startTime);
      const endInstant = eventTimeOnDay(day, cfg.endTime);
      const session = await prisma.session.create({
        data: {
          eventId: event.id,
          startDate: day,
          endDate: day,
          startTime: startInstant,
          endTime: endInstant,
          finalizedAt: off < 0 ? addUtcDays(day, 1) : null,
        },
      });
      sessions.push({
        id: session.id,
        eventId: event.id,
        startInstant,
        isToday: off === 0,
        isFuture: off > 0,
        isLive: Boolean(cfg.live) && off === 0,
      });
    }
  }

  // --- attendance -----------------------------------------------------------
  const rows = [];
  for (const session of sessions) {
    if (session.isFuture) continue; // upcoming sessions have no attendance yet

    if (session.isLive) {
      // People currently on the floor. The demo attendant is deliberately left
      // out so their personal dashboard shows the "check in" CTA.
      for (const user of users) {
        if (user.id === demoAttendant.id) continue;
        if (!chance(0.55)) continue;
        const checkIn = new Date(now.getTime() - rand(2, 38) * 60_000);
        const lateMin = (checkIn.getTime() - session.startInstant.getTime()) / 60_000;
        const stillIn = chance(0.5);
        rows.push({
          userId: user.id,
          sessionId: session.id,
          status: lateMin <= 60 ? "PRESENT" : "LATE",
          checkInTime: checkIn,
          checkOutTime: stillIn ? null : new Date(Math.min(now.getTime(), checkIn.getTime() + rand(15, 55) * 60_000)),
          autoCheckedOut: false,
          createdAt: checkIn,
        });
      }
      continue;
    }

    const turnout = rand(0.55, 0.9);
    for (const user of users) {
      if (!chance(turnout)) {
        // Absent rows exist only for finalized (past) sessions.
        if (!session.isToday && chance(0.5)) {
          rows.push({
            userId: user.id,
            sessionId: session.id,
            status: "ABSENT",
            checkInTime: null,
            createdAt: addUtcDays(new Date(session.startInstant), 1),
          });
        }
        continue;
      }
      const lateMinutes = chance(0.72) ? rand(0, 45) : rand(46, 150);
      const checkIn = new Date(session.startInstant.getTime() + lateMinutes * 60_000);
      rows.push({
        userId: user.id,
        sessionId: session.id,
        status: lateMinutes <= 60 ? "PRESENT" : "LATE",
        checkInTime: checkIn,
        checkOutTime: new Date(checkIn.getTime() + rand(45, 180) * 60_000),
        autoCheckedOut: !session.isToday && chance(0.2),
        createdAt: checkIn,
      });
    }
  }
  for (let i = 0; i < rows.length; i += 500) {
    await prisma.attendance.createMany({ data: rows.slice(i, i + 500) });
  }

  // --- anomalies + evidence -------------------------------------------------
  const TYPES = ["LIVENESS_FAILED", "LIVENESS_FAILED", "REPLAY_SUSPECTED", "DUPLICATE_DESCRIPTOR", "RAPID_ATTEMPTS"];
  const SEVERITIES = ["LOW", "MEDIUM", "MEDIUM", "HIGH"];

  const makeAnomaly = async ({ createdAt, type, severity, resolved, withEvidence }) => {
    const user = pick(users);
    const eventId = pick(demoEventIds);
    await prisma.anomalyFlag.create({
      data: {
        userId: user.id,
        eventId,
        type,
        severity,
        detail: { note: "demo anomaly" },
        resolvedAt: resolved ? new Date(createdAt.getTime() + rand(1, 48) * 3_600_000) : null,
        createdAt,
      },
    });
    if (withEvidence) {
      await prisma.attendanceEvidence.create({
        data: {
          userId: user.id,
          eventId,
          frameUrls: [],
          livenessScore: Number(rand(0.05, 0.6).toFixed(3)),
          matchDistance: Number(rand(0.35, 0.95).toFixed(3)),
          reason: "demo evidence",
          expiresAt: addUtcDays(today, 30),
          createdAt,
        },
      });
    }
  };

  // A spread over the window (mix of types, severities, resolved/open).
  for (let i = 0; i < 48; i += 1) {
    const createdAt = new Date(addUtcDays(today, -randInt(0, 44)).getTime() + rand(7, 21) * 3_600_000);
    if (createdAt > now) continue;
    await makeAnomaly({
      createdAt,
      type: pick(TYPES),
      severity: pick(SEVERITIES),
      resolved: chance(0.6),
      withEvidence: chance(0.65),
    });
  }
  // A few HIGH, unresolved, from earlier today - so the live strip's open /
  // high-severity / today counters are always non-zero.
  for (let i = 0; i < 3; i += 1) {
    await makeAnomaly({
      createdAt: new Date(now.getTime() - rand(1, 6) * 3_600_000),
      type: "LIVENESS_FAILED",
      severity: "HIGH",
      resolved: false,
      withEvidence: true,
    });
  }

  console.log("Done:", {
    demoEvents: demoEventIds.length,
    demoSessions: sessions.length,
    liveSessions: sessions.filter((s) => s.isLive).length,
    upcomingSessions: sessions.filter((s) => s.isFuture).length,
    attendanceRows: rows.length,
    totals: {
      users: await prisma.user.count(),
      events: await prisma.event.count(),
      attendance: await prisma.attendance.count(),
      anomalies: await prisma.anomalyFlag.count(),
      evidence: await prisma.attendanceEvidence.count(),
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
