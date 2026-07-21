// src/services/analytics/admin-punctuality.service.js
//
// The "punctuality" story - WHEN people arrive, an axis the legacy dashboards
// never computed. Lateness is the check-in instant minus the session's
// scheduled open. Three surfaces: an on-time-vs-late trend, a lateness
// distribution histogram, and the arrival-time heatmap (day-of-week x hour,
// in venue time).
import { Prisma } from "@prisma/client";
import ENV from "../../config/env.js";
import { prisma } from "../../config/prisma-client.js";
import {
  buildBuckets,
  calculatePercentage,
  resolveAnalyticsRange,
} from "../../utils/analytics-range.js";

// Local wall-clock of a stored (UTC, tz-naive) timestamp, in the venue zone -
// the same double-AT-TIME-ZONE idiom the legacy admin series uses for its
// day bucketing. First reads the naive value as UTC, then converts to venue.
const localCheckIn = Prisma.sql`((a."checkInTime" AT TIME ZONE 'UTC') AT TIME ZONE ${ENV.EVENT_TIMEZONE})`;
const latenessMinutes = Prisma.sql`EXTRACT(EPOCH FROM (a."checkInTime" - s."startTime")) / 60.0`;

/** On-time vs late over time, with mean lateness per bucket. */
export async function getPunctualityTrend(params, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const buckets = buildBuckets(range, range.granularity);
  const { start, end } = range.current;

  const empty = buckets.map((b) => ({
    label: b.label,
    onTime: 0,
    late: 0,
    onTimeRate: 0,
    avgLateness: 0,
  }));

  if (buckets.length > 0) {
    const starts = buckets.map((b) => b.start);
    const ends = buckets.map((b) => b.end);
    const rows = await prisma.$queryRaw`
      SELECT
        p.idx::int AS idx,
        COUNT(a.id) FILTER (WHERE a.status::text = 'PRESENT')::int AS on_time,
        COUNT(a.id) FILTER (WHERE a.status::text = 'LATE')::int AS late,
        COALESCE(AVG(GREATEST(0, ${latenessMinutes})), 0)::float8 AS avg_lateness
      FROM unnest(${starts}::timestamptz[], ${ends}::timestamptz[])
           WITH ORDINALITY AS p(start_at, end_at, idx)
      LEFT JOIN "Attendance" a
        ON a."checkInTime" IS NOT NULL
       AND a."checkInTime" >= p.start_at AND a."checkInTime" <= p.end_at
       AND a."checkInTime" >= ${start} AND a."checkInTime" <= ${end}
      LEFT JOIN "Session" s ON a."sessionId" = s.id
      GROUP BY p.idx
      ORDER BY p.idx
    `;
    for (const row of rows) {
      const showed = row.on_time + row.late;
      empty[row.idx - 1] = {
        label: buckets[row.idx - 1].label,
        onTime: row.on_time,
        late: row.late,
        onTimeRate: calculatePercentage(row.on_time, showed),
        avgLateness: Math.round(row.avg_lateness * 10) / 10,
      };
    }
  }

  return {
    range: {
      preset: range.preset,
      from: range.label.from,
      to: range.label.to,
      granularity: range.granularity,
    },
    timeSeries: empty,
  };
}

// The lateness histogram bins, in minutes past the scheduled open.
const LATENESS_BINS = [
  { key: "on_time", label: "On time", lo: -Infinity, hi: 0 },
  { key: "m0_5", label: "1-5 min", lo: 0, hi: 5 },
  { key: "m5_15", label: "6-15 min", lo: 5, hi: 15 },
  { key: "m15_30", label: "16-30 min", lo: 15, hi: 30 },
  { key: "m30_60", label: "31-60 min", lo: 30, hi: 60 },
  { key: "m60p", label: "60+ min", lo: 60, hi: Infinity },
];

/** Distribution of arrival lateness across the checked-in population. */
export async function getLatenessDistribution(params, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const { start, end } = range.current;

  const rows = await prisma.$queryRaw`
    WITH lat AS (
      SELECT ${latenessMinutes} AS minutes
      FROM "Attendance" a
      JOIN "Session" s ON a."sessionId" = s.id
      WHERE a."checkInTime" IS NOT NULL
        AND a."checkInTime" >= ${start} AND a."checkInTime" <= ${end}
    )
    SELECT
      COUNT(*) FILTER (WHERE minutes <= 0)::int AS on_time,
      COUNT(*) FILTER (WHERE minutes > 0 AND minutes <= 5)::int AS m0_5,
      COUNT(*) FILTER (WHERE minutes > 5 AND minutes <= 15)::int AS m5_15,
      COUNT(*) FILTER (WHERE minutes > 15 AND minutes <= 30)::int AS m15_30,
      COUNT(*) FILTER (WHERE minutes > 30 AND minutes <= 60)::int AS m30_60,
      COUNT(*) FILTER (WHERE minutes > 60)::int AS m60p
    FROM lat
  `;

  const counts = rows[0] ?? {};
  const total = LATENESS_BINS.reduce((sum, bin) => sum + (counts[bin.key] ?? 0), 0);
  const segments = LATENESS_BINS.map((bin) => ({
    key: bin.key,
    label: bin.label,
    count: counts[bin.key] ?? 0,
    percentage: calculatePercentage(counts[bin.key] ?? 0, total),
  }));

  return {
    range: { preset: range.preset, from: range.label.from, to: range.label.to },
    total,
    segments,
  };
}

/**
 * Arrival-time heatmap: check-in counts by venue day-of-week (0=Sunday) and
 * hour-of-day. Returns only non-empty cells plus the max for color scaling.
 */
export async function getArrivalHeatmap(params, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const { start, end } = range.current;

  const rows = await prisma.$queryRaw`
    SELECT
      EXTRACT(DOW FROM ${localCheckIn})::int AS dow,
      EXTRACT(HOUR FROM ${localCheckIn})::int AS hour,
      COUNT(*)::int AS count
    FROM "Attendance" a
    WHERE a."checkInTime" IS NOT NULL
      AND a."checkInTime" >= ${start} AND a."checkInTime" <= ${end}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;

  const cells = rows.map((row) => ({ dow: row.dow, hour: row.hour, count: row.count }));
  const maxCount = cells.reduce((max, cell) => Math.max(max, cell.count), 0);
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);

  return {
    range: { preset: range.preset, from: range.label.from, to: range.label.to },
    cells,
    maxCount,
    total,
  };
}
