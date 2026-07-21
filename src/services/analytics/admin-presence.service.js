// src/services/analytics/admin-presence.service.js
//
// The "presence" story: the attendance time series (present/late/absent over
// time, with an attendance-rate line and a previous-period overlay) and the
// categorical breakdowns (by status, event type, event, and venue).
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma-client.js";
import { bucketedAttendance } from "../../utils/analytics-buckets.js";
import {
  buildBuckets,
  calculatePercentage,
  resolveAnalyticsRange,
} from "../../utils/analytics-range.js";

/** SQL fragment for the effective instant a row is bucketed by. */
const EFFECTIVE_INSTANT = Prisma.sql`COALESCE(a."checkInTime", a."createdAt")`;

/**
 * The attendance time series for the current window, plus a same-length
 * previous-period total overlay when the bucketing lines up.
 */
export async function getPresenceTrend(params, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const buckets = buildBuckets(range, range.granularity);

  const series = await bucketedAttendance({
    buckets,
    window: { start: range.current.start, end: range.current.end },
  });

  // Previous-period overlay: same granularity over the preceding window. Only
  // attached when the bucket counts match, so points align position-for-
  // position (they can differ when a window straddles month boundaries).
  const prevRange = {
    current: {
      start: range.previous.start,
      end: range.previous.end,
      startDay: range.previous.startDay,
      endDay: range.previous.endDay,
    },
  };
  const prevBuckets = buildBuckets(prevRange, range.granularity);
  let previousTotals = null;
  if (prevBuckets.length === buckets.length) {
    const prevSeries = await bucketedAttendance({
      buckets: prevBuckets,
      window: { start: range.previous.start, end: range.previous.end },
    });
    previousTotals = prevSeries.map((point) => point.total);
  }

  const timeSeries = series.map((point, index) => ({
    label: point.label,
    present: point.present,
    late: point.late,
    absent: point.absent,
    total: point.total,
    uniqueUsers: point.uniqueUsers,
    attendanceRate: calculatePercentage(point.present + point.late, point.total),
    previousTotal: previousTotals ? previousTotals[index] : null,
  }));

  const totals = timeSeries.reduce(
    (acc, point) => ({
      present: acc.present + point.present,
      late: acc.late + point.late,
      absent: acc.absent + point.absent,
      total: acc.total + point.total,
    }),
    { present: 0, late: 0, absent: 0, total: 0 }
  );

  return {
    range: {
      preset: range.preset,
      from: range.label.from,
      to: range.label.to,
      granularity: range.granularity,
    },
    timeSeries,
    summary: {
      ...totals,
      attendanceRate: calculatePercentage(totals.present + totals.late, totals.total),
      punctualityRate: calculatePercentage(totals.present, totals.present + totals.late),
      peakLabel:
        timeSeries.reduce(
          (best, point) => (point.total > (best?.total ?? -1) ? point : best),
          null
        )?.label ?? null,
    },
  };
}

/** Zero-filled status breakdown (PRESENT/LATE/ABSENT) for a donut. */
async function statusBreakdown(start, end) {
  const groups = await prisma.attendance.groupBy({
    by: ["status"],
    where: {
      OR: [
        { checkInTime: { gte: start, lte: end } },
        { checkInTime: null, createdAt: { gte: start, lte: end } },
      ],
    },
    _count: { _all: true },
  });
  const get = (status) =>
    groups.find((group) => group.status === status)?._count._all ?? 0;
  const present = get("PRESENT");
  const late = get("LATE");
  const absent = get("ABSENT");
  const total = present + late + absent;
  return [
    { key: "PRESENT", label: "Present", count: present, percentage: calculatePercentage(present, total) },
    { key: "LATE", label: "Late", count: late, percentage: calculatePercentage(late, total) },
    { key: "ABSENT", label: "Absent", count: absent, percentage: calculatePercentage(absent, total) },
  ];
}

/** Recurring vs one-off attendance split. */
async function eventTypeBreakdown(start, end) {
  const rangeWhere = {
    OR: [
      { checkInTime: { gte: start, lte: end } },
      { checkInTime: null, createdAt: { gte: start, lte: end } },
    ],
  };
  const [recurring, nonRecurring] = await Promise.all([
    prisma.attendance.count({
      where: { ...rangeWhere, session: { event: { isRecurring: true } } },
    }),
    prisma.attendance.count({
      where: { ...rangeWhere, session: { event: { isRecurring: false } } },
    }),
  ]);
  const total = recurring + nonRecurring;
  return [
    { key: "recurring", label: "Recurring", count: recurring, percentage: calculatePercentage(recurring, total) },
    { key: "nonRecurring", label: "One-off", count: nonRecurring, percentage: calculatePercentage(nonRecurring, total) },
  ];
}

/**
 * Top-N breakdown that groups attendance up its relation chain (event or
 * venue), which Prisma groupBy cannot express - so it is one raw grouped scan.
 */
async function relationBreakdown(start, end, dimension) {
  const keyExpr =
    dimension === "location"
      ? { select: Prisma.sql`l.id AS key, l.name AS label`, join: Prisma.sql`JOIN "Location" l ON e."locationId" = l.id`, group: Prisma.sql`l.id, l.name` }
      : { select: Prisma.sql`e.id AS key, e.title AS label`, join: Prisma.empty, group: Prisma.sql`e.id, e.title` };

  const rows = await prisma.$queryRaw`
    SELECT
      ${keyExpr.select},
      COUNT(a.id)::int AS total,
      COUNT(a.id) FILTER (WHERE a.status::text = 'PRESENT')::int AS present,
      COUNT(a.id) FILTER (WHERE a.status::text = 'LATE')::int AS late,
      COUNT(a.id) FILTER (WHERE a.status::text = 'ABSENT')::int AS absent
    FROM "Attendance" a
    JOIN "Session" s ON a."sessionId" = s.id
    JOIN "Event" e ON s."eventId" = e.id
    ${keyExpr.join}
    WHERE ${EFFECTIVE_INSTANT} >= ${start} AND ${EFFECTIVE_INSTANT} <= ${end}
    GROUP BY ${keyExpr.group}
    ORDER BY total DESC
    LIMIT 10
  `;

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0);
  return rows.map((row) => ({
    key: row.key,
    label: row.label,
    count: row.total,
    present: row.present,
    late: row.late,
    absent: row.absent,
    attendanceRate: calculatePercentage(row.present + row.late, row.total),
    percentage: calculatePercentage(row.total, grandTotal),
  }));
}

/**
 * A single breakdown by the requested dimension. `by` is one of:
 * status | eventType | event | location.
 */
export async function getPresenceBreakdown(params, by, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const { start, end } = range.current;

  let segments;
  switch (by) {
    case "status":
      segments = await statusBreakdown(start, end);
      break;
    case "eventType":
      segments = await eventTypeBreakdown(start, end);
      break;
    case "event":
      segments = await relationBreakdown(start, end, "event");
      break;
    case "location":
      segments = await relationBreakdown(start, end, "location");
      break;
    default:
      segments = await statusBreakdown(start, end);
      by = "status";
  }

  return {
    by,
    range: { preset: range.preset, from: range.label.from, to: range.label.to },
    segments,
  };
}
