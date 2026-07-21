// src/utils/analytics-buckets.js
//
// Timezone-correct time-series bucketing in ONE SQL round-trip.
//
// The bucket edges are computed in JS (analytics-range.js -> buildBuckets),
// on the VENUE calendar, then handed to Postgres as two parallel arrays. A
// single `unnest(...) WITH ORDINALITY` joins every row against its bucket, so
// a year-long "by month" trend is one grouped scan instead of streaming every
// row into Node and bucketing there. Table/column identifiers are code-owned
// (Prisma.raw); only the date bounds and caller filters are parameterized.
import { Prisma } from "@prisma/client";
import { prisma } from "../config/prisma-client.js";

/**
 * Generic per-bucket row count for any table with a single timestamp column.
 *
 * @param {object} args
 * @param {Prisma.Sql} args.table       code-owned table identifier, e.g. Prisma.raw('"AnomalyFlag"')
 * @param {Prisma.Sql} args.dateColumn  code-owned column identifier, e.g. Prisma.raw('"createdAt"')
 * @param {Array<{start: Date, end: Date, label: string}>} args.buckets
 * @param {{ start: Date, end: Date }} args.window  overall clamp window
 * @param {Prisma.Sql} [args.where]     extra filter fragment on alias `t`
 * @returns {Promise<Array<{ label: string, count: number }>>} aligned to buckets
 */
export async function countByBuckets({ table, dateColumn, buckets, window, where }) {
  if (buckets.length === 0) return [];
  const starts = buckets.map((b) => b.start);
  const ends = buckets.map((b) => b.end);
  const filter = where ? Prisma.sql`AND ${where}` : Prisma.empty;

  const rows = await prisma.$queryRaw`
    SELECT p.idx::int AS idx, COUNT(t.id)::int AS count
    FROM unnest(${starts}::timestamptz[], ${ends}::timestamptz[])
         WITH ORDINALITY AS p(start_at, end_at, idx)
    LEFT JOIN ${table} t
      ON t.${dateColumn} >= p.start_at AND t.${dateColumn} <= p.end_at
     AND t.${dateColumn} >= ${window.start} AND t.${dateColumn} <= ${window.end}
     ${filter}
    GROUP BY p.idx
    ORDER BY p.idx
  `;

  const out = buckets.map((b) => ({ label: b.label, count: 0 }));
  for (const r of rows) out[r.idx - 1].count = r.count;
  return out;
}

/**
 * Per-bucket attendance breakdown (total / present / late / absent /
 * uniqueUsers). The bucketing instant is COALESCE(checkInTime, createdAt) -
 * ABSENT rows carry no check-in, so they land on the finalized session's day,
 * exactly as the legacy admin series did.
 *
 * @param {object} args
 * @param {Array<{start: Date, end: Date, label: string}>} args.buckets
 * @param {{ start: Date, end: Date }} args.window
 * @param {Prisma.Sql} [args.extraWhere] extra filter fragment on alias `a`
 * @returns {Promise<Array<{ label: string, total: number, present: number,
 *   late: number, absent: number, uniqueUsers: number }>>}
 */
export async function bucketedAttendance({ buckets, window, extraWhere }) {
  const empty = buckets.map((b) => ({
    label: b.label,
    total: 0,
    present: 0,
    late: 0,
    absent: 0,
    uniqueUsers: 0,
  }));
  if (buckets.length === 0) return empty;

  const starts = buckets.map((b) => b.start);
  const ends = buckets.map((b) => b.end);
  const filter = extraWhere ? Prisma.sql`AND ${extraWhere}` : Prisma.empty;
  const inst = Prisma.sql`COALESCE(a."checkInTime", a."createdAt")`;

  const rows = await prisma.$queryRaw`
    SELECT
      p.idx::int AS idx,
      COUNT(a.id)::int AS total,
      COUNT(a.id) FILTER (WHERE a.status::text = 'PRESENT')::int AS present,
      COUNT(a.id) FILTER (WHERE a.status::text = 'LATE')::int AS late,
      COUNT(a.id) FILTER (WHERE a.status::text = 'ABSENT')::int AS absent,
      COUNT(DISTINCT a."userId")::int AS "uniqueUsers"
    FROM unnest(${starts}::timestamptz[], ${ends}::timestamptz[])
         WITH ORDINALITY AS p(start_at, end_at, idx)
    LEFT JOIN "Attendance" a
      ON ${inst} >= p.start_at AND ${inst} <= p.end_at
     AND ${inst} >= ${window.start} AND ${inst} <= ${window.end}
     ${filter}
    GROUP BY p.idx
    ORDER BY p.idx
  `;

  for (const r of rows) {
    empty[r.idx - 1] = {
      label: buckets[r.idx - 1].label,
      total: r.total,
      present: r.present,
      late: r.late,
      absent: r.absent,
      uniqueUsers: r.uniqueUsers,
    };
  }
  return empty;
}
