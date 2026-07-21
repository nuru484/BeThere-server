// src/services/analytics/admin-overview.service.js
//
// The admin dashboard's two headline surfaces:
//   - a LIVE operational snapshot ("what is happening right now"), which is
//     never date-filtered, and
//   - the hero KPI row with period-over-period trends.
//
// BeThere is an integrity system, so the headline numbers are presence,
// punctuality, and integrity - not inert row counts. Every aggregate runs in
// SQL; the venue-timezone range math is delegated to analytics-range.js.
import { prisma } from "../../config/prisma-client.js";
import {
  calculatePercentage,
  calculateTrend,
  resolveAnalyticsRange,
} from "../../utils/analytics-range.js";
import {
  addUtcDays,
  currentTimeStringInEventTz,
  eventCalendarDay,
} from "../../utils/time-context.js";

/**
 * A where-clause matching attendance whose EFFECTIVE instant falls in a
 * window: check-in time when present, else the creation instant (ABSENT rows
 * written by the finalizer carry no check-in). Mirrors the legacy dashboards.
 */
function attendanceRangeWhere(start, end, extra = {}) {
  return {
    ...extra,
    OR: [
      { checkInTime: { gte: start, lte: end } },
      { checkInTime: null, createdAt: { gte: start, lte: end } },
    ],
  };
}

/** Present/late/absent/total from a groupBy(status) result. */
function countsFromGroups(groups) {
  const get = (status) =>
    groups.find((group) => group.status === status)?._count._all ?? 0;
  const present = get("PRESENT");
  const late = get("LATE");
  const absent = get("ABSENT");
  return { present, late, absent, total: present + late + absent };
}

/**
 * Mean lateness in minutes for checked-in rows in [start, end]. Lateness is
 * check-in instant minus the session's scheduled open, floored at zero (an
 * early arrival is not "negative late"). Averaged in SQL over the join.
 */
async function avgLatenessMinutes(start, end) {
  const rows = await prisma.$queryRaw`
    SELECT COALESCE(
      AVG(GREATEST(0, EXTRACT(EPOCH FROM (a."checkInTime" - s."startTime")) / 60.0)),
      0
    )::float8 AS avg
    FROM "Attendance" a
    JOIN "Session" s ON a."sessionId" = s.id
    WHERE a."checkInTime" IS NOT NULL
      AND a."checkInTime" >= ${start}
      AND a."checkInTime" <= ${end}
  `;
  return rows[0]?.avg ?? 0;
}

/**
 * The live operational snapshot. Not date-filtered: everything is anchored to
 * the venue's "now" so the admin sees the state of the floor, not history.
 */
export async function getAdminLiveSnapshot(now = new Date()) {
  const currentDate = eventCalendarDay(now);
  const startOfTomorrow = addUtcDays(currentDate, 1);
  const currentTimeString = currentTimeStringInEventTz(now);
  const todayStart = resolveAnalyticsRange({ preset: "today" }, now).current.start;

  // Sessions whose date window covers today; the open-right-now check is on
  // the event's "HH:MM" wall-clock window, compared in venue time.
  const todaysSessions = await prisma.session.findMany({
    where: { startDate: { lt: startOfTomorrow }, endDate: { gte: currentDate } },
    select: {
      id: true,
      event: { select: { startTime: true, endTime: true } },
    },
  });

  const liveSessionIds = todaysSessions
    .filter(
      (session) =>
        currentTimeString >= session.event.startTime &&
        currentTimeString <= session.event.endTime
    )
    .map((session) => session.id);
  const todaySessionIds = todaysSessions.map((session) => session.id);

  const [statusToday, checkedInNow, openAnomalies, highOpenAnomalies, anomaliesToday] =
    await Promise.all([
      todaySessionIds.length
        ? prisma.attendance.groupBy({
            by: ["status"],
            where: { sessionId: { in: todaySessionIds }, checkInTime: { not: null } },
            _count: { _all: true },
          })
        : [],
      // Currently on the floor: checked in, not yet checked out, and the
      // session they are in is still open.
      liveSessionIds.length
        ? prisma.attendance.count({
            where: {
              sessionId: { in: liveSessionIds },
              checkInTime: { not: null },
              checkOutTime: null,
              autoCheckedOut: false,
            },
          })
        : 0,
      prisma.anomalyFlag.count({ where: { resolvedAt: null } }),
      prisma.anomalyFlag.count({ where: { resolvedAt: null, severity: "HIGH" } }),
      prisma.anomalyFlag.count({ where: { createdAt: { gte: todayStart } } }),
    ]);

  const counts = countsFromGroups(statusToday);

  return {
    asOf: now.toISOString(),
    sessionsToday: todaysSessions.length,
    sessionsLiveNow: liveSessionIds.length,
    checkedInNow,
    checkInsToday: counts.present + counts.late,
    presentToday: counts.present,
    lateToday: counts.late,
    openAnomalies,
    highSeverityOpenAnomalies: highOpenAnomalies,
    anomaliesToday,
  };
}

/**
 * The hero KPI row: presence, punctuality, and integrity headline metrics,
 * each with a period-over-period trend. `inverse: true` marks metrics where a
 * downward move is the good one (lateness, anomalies), so the UI can color the
 * arrow accordingly.
 */
export async function getAdminKpis(params, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const { current, previous } = range;

  const [
    curStatus,
    prevStatus,
    curAttendees,
    prevAttendees,
    curLateness,
    prevLateness,
    curAnomalies,
    prevAnomalies,
    openAnomalies,
    enrolled,
    totalUsers,
  ] = await Promise.all([
    prisma.attendance.groupBy({
      by: ["status"],
      where: attendanceRangeWhere(current.start, current.end),
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: attendanceRangeWhere(previous.start, previous.end),
      _count: { _all: true },
    }),
    prisma.attendance.groupBy({
      by: ["userId"],
      where: { checkInTime: { gte: current.start, lte: current.end } },
    }),
    prisma.attendance.groupBy({
      by: ["userId"],
      where: { checkInTime: { gte: previous.start, lte: previous.end } },
    }),
    avgLatenessMinutes(current.start, current.end),
    avgLatenessMinutes(previous.start, previous.end),
    prisma.anomalyFlag.count({
      where: { createdAt: { gte: current.start, lte: current.end } },
    }),
    prisma.anomalyFlag.count({
      where: { createdAt: { gte: previous.start, lte: previous.end } },
    }),
    prisma.anomalyFlag.count({ where: { resolvedAt: null } }),
    prisma.user.count({
      where: { OR: [{ faceScanEnc: { not: null } }, { faceScan: { not: null } }] },
    }),
    prisma.user.count(),
  ]);

  const cur = countsFromGroups(curStatus);
  const prev = countsFromGroups(prevStatus);
  const curShowed = cur.present + cur.late;
  const prevShowed = prev.present + prev.late;

  const attendanceRate = calculatePercentage(curShowed, cur.total);
  const prevAttendanceRate = calculatePercentage(prevShowed, prev.total);
  const punctualityRate = calculatePercentage(cur.present, curShowed);
  const prevPunctualityRate = calculatePercentage(prev.present, prevShowed);
  const avgLateness = Math.round(curLateness * 10) / 10;
  const prevAvgLateness = Math.round(prevLateness * 10) / 10;

  return {
    range: {
      preset: range.preset,
      from: range.label.from,
      to: range.label.to,
      granularity: range.granularity,
    },
    kpis: {
      attendanceRate: {
        value: attendanceRate,
        unit: "percent",
        trend: calculateTrend(attendanceRate, prevAttendanceRate),
        meta: {
          present: cur.present,
          late: cur.late,
          absent: cur.absent,
          total: cur.total,
        },
      },
      punctualityRate: {
        value: punctualityRate,
        unit: "percent",
        trend: calculateTrend(punctualityRate, prevPunctualityRate),
        meta: { present: cur.present, late: cur.late, showed: curShowed },
      },
      uniqueAttendees: {
        value: curAttendees.length,
        unit: "count",
        trend: calculateTrend(curAttendees.length, prevAttendees.length),
      },
      avgLateness: {
        value: avgLateness,
        unit: "minutes",
        inverse: true,
        trend: calculateTrend(avgLateness, prevAvgLateness),
      },
      anomalies: {
        value: curAnomalies,
        unit: "count",
        inverse: true,
        trend: calculateTrend(curAnomalies, prevAnomalies),
        meta: { open: openAnomalies },
      },
      enrollmentCoverage: {
        value: calculatePercentage(enrolled, totalUsers),
        unit: "percent",
        meta: { enrolled, totalUsers },
      },
    },
  };
}
