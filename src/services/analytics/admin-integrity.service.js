// src/services/analytics/admin-integrity.service.js
//
// The "integrity" story - BeThere's differentiator. Attendance elsewhere is
// self-reported; here every check-in is a verified liveness + venue-code
// handshake, and failed or suspicious attempts leave AnomalyFlag + evidence
// trails. This surface turns those detective signals into analytics: anomaly
// volume by type/severity over time, resolution rate + MTTR, liveness-quality
// distributions, and a single composite Presence Integrity Score.
import { prisma } from "../../config/prisma-client.js";
import {
  buildBuckets,
  calculatePercentage,
  resolveAnalyticsRange,
} from "../../utils/analytics-range.js";

const ANOMALY_TYPES = [
  { key: "DUPLICATE_DESCRIPTOR", label: "Duplicate descriptor" },
  { key: "LIVENESS_FAILED", label: "Liveness failed" },
  { key: "REPLAY_SUSPECTED", label: "Replay suspected" },
  { key: "RAPID_ATTEMPTS", label: "Rapid attempts" },
];
const ANOMALY_SEVERITIES = [
  { key: "LOW", label: "Low" },
  { key: "MEDIUM", label: "Medium" },
  { key: "HIGH", label: "High" },
];

/** Anomaly volume over time, split by type (for a stacked area/bar). */
export async function getAnomalyTrend(params, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const buckets = buildBuckets(range, range.granularity);
  const { start, end } = range.current;

  const empty = buckets.map((b) => ({
    label: b.label,
    total: 0,
    duplicateDescriptor: 0,
    livenessFailed: 0,
    replaySuspected: 0,
    rapidAttempts: 0,
  }));

  if (buckets.length > 0) {
    const starts = buckets.map((b) => b.start);
    const ends = buckets.map((b) => b.end);
    const rows = await prisma.$queryRaw`
      SELECT
        p.idx::int AS idx,
        COUNT(t.id)::int AS total,
        COUNT(t.id) FILTER (WHERE t.type::text = 'DUPLICATE_DESCRIPTOR')::int AS duplicate_descriptor,
        COUNT(t.id) FILTER (WHERE t.type::text = 'LIVENESS_FAILED')::int AS liveness_failed,
        COUNT(t.id) FILTER (WHERE t.type::text = 'REPLAY_SUSPECTED')::int AS replay_suspected,
        COUNT(t.id) FILTER (WHERE t.type::text = 'RAPID_ATTEMPTS')::int AS rapid_attempts
      FROM unnest(${starts}::timestamptz[], ${ends}::timestamptz[])
           WITH ORDINALITY AS p(start_at, end_at, idx)
      LEFT JOIN "AnomalyFlag" t
        ON t."createdAt" >= p.start_at AND t."createdAt" <= p.end_at
       AND t."createdAt" >= ${start} AND t."createdAt" <= ${end}
      GROUP BY p.idx
      ORDER BY p.idx
    `;
    for (const row of rows) {
      empty[row.idx - 1] = {
        label: buckets[row.idx - 1].label,
        total: row.total,
        duplicateDescriptor: row.duplicate_descriptor,
        livenessFailed: row.liveness_failed,
        replaySuspected: row.replay_suspected,
        rapidAttempts: row.rapid_attempts,
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

/** Anomaly breakdown by type or severity, with resolved counts. */
export async function getAnomalyBreakdown(params, by, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const { start, end } = range.current;
  const dimension = by === "severity" ? "severity" : "type";
  const catalog = dimension === "severity" ? ANOMALY_SEVERITIES : ANOMALY_TYPES;

  const [all, resolved] = await Promise.all([
    prisma.anomalyFlag.groupBy({
      by: [dimension],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    prisma.anomalyFlag.groupBy({
      by: [dimension],
      where: { createdAt: { gte: start, lte: end }, resolvedAt: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const countFor = (groups, key) =>
    groups.find((group) => group[dimension] === key)?._count._all ?? 0;
  const total = all.reduce((sum, group) => sum + group._count._all, 0);

  const segments = catalog.map((entry) => {
    const count = countFor(all, entry.key);
    return {
      key: entry.key,
      label: entry.label,
      count,
      resolved: countFor(resolved, entry.key),
      percentage: calculatePercentage(count, total),
    };
  });

  return {
    by: dimension,
    range: { preset: range.preset, from: range.label.from, to: range.label.to },
    total,
    segments,
  };
}

/** Liveness-quality histograms (score + match distance) for flagged attempts. */
export async function getLivenessQuality(params, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const { start, end } = range.current;

  const rows = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "livenessScore" IS NOT NULL)::int AS score_n,
      COUNT(*) FILTER (WHERE "livenessScore" >= 0 AND "livenessScore" < 0.2)::int AS s0,
      COUNT(*) FILTER (WHERE "livenessScore" >= 0.2 AND "livenessScore" < 0.4)::int AS s1,
      COUNT(*) FILTER (WHERE "livenessScore" >= 0.4 AND "livenessScore" < 0.6)::int AS s2,
      COUNT(*) FILTER (WHERE "livenessScore" >= 0.6 AND "livenessScore" < 0.8)::int AS s3,
      COUNT(*) FILTER (WHERE "livenessScore" >= 0.8)::int AS s4,
      COUNT(*) FILTER (WHERE "matchDistance" IS NOT NULL)::int AS dist_n,
      COUNT(*) FILTER (WHERE "matchDistance" < 0.3)::int AS d0,
      COUNT(*) FILTER (WHERE "matchDistance" >= 0.3 AND "matchDistance" < 0.45)::int AS d1,
      COUNT(*) FILTER (WHERE "matchDistance" >= 0.45 AND "matchDistance" < 0.6)::int AS d2,
      COUNT(*) FILTER (WHERE "matchDistance" >= 0.6 AND "matchDistance" < 0.8)::int AS d3,
      COUNT(*) FILTER (WHERE "matchDistance" >= 0.8)::int AS d4,
      COALESCE(AVG("livenessScore"), 0)::float8 AS avg_score,
      COALESCE(AVG("matchDistance"), 0)::float8 AS avg_distance
    FROM "AttendanceEvidence"
    WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
  `;

  const r = rows[0] ?? {};
  return {
    range: { preset: range.preset, from: range.label.from, to: range.label.to },
    livenessScore: {
      count: r.score_n ?? 0,
      average: Math.round((r.avg_score ?? 0) * 100) / 100,
      bins: [
        { label: "0.0-0.2", count: r.s0 ?? 0 },
        { label: "0.2-0.4", count: r.s1 ?? 0 },
        { label: "0.4-0.6", count: r.s2 ?? 0 },
        { label: "0.6-0.8", count: r.s3 ?? 0 },
        { label: "0.8-1.0", count: r.s4 ?? 0 },
      ],
    },
    matchDistance: {
      count: r.dist_n ?? 0,
      average: Math.round((r.avg_distance ?? 0) * 100) / 100,
      // 0.6 is the enrolled-vs-captured match threshold; lower is a closer match.
      threshold: 0.6,
      bins: [
        { label: "0.0-0.3", count: r.d0 ?? 0 },
        { label: "0.3-0.45", count: r.d1 ?? 0 },
        { label: "0.45-0.6", count: r.d2 ?? 0 },
        { label: "0.6-0.8", count: r.d3 ?? 0 },
        { label: "0.8+", count: r.d4 ?? 0 },
      ],
    },
  };
}

/** Grade band for a 0-100 integrity score. */
function gradeFor(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

/**
 * The integrity summary and the composite Presence Integrity Score.
 *
 * The score is a transparent weighted blend of three 0-100 components, so the
 * UI can show exactly how it was reached:
 *   - cleanliness  (55%): share of verified attempts that raised no anomaly
 *   - resolution   (15%): share of anomalies that have been reviewed/resolved
 *   - liveness     (30%): mean liveness score of retained evidence
 * A component with no data (e.g. no retained evidence) is dropped and the
 * remaining weights are renormalized, so the score is never diluted by a
 * dimension the deployment has nothing to say about yet.
 */
export async function getIntegritySummary(params, now = new Date()) {
  const range = resolveAnalyticsRange(params, now);
  const { start, end } = range.current;

  const [
    byType,
    bySeverity,
    totalAnomalies,
    resolvedAnomalies,
    openAnomalies,
    successGroups,
    mttrRows,
    evidenceRows,
  ] = await Promise.all([
    prisma.anomalyFlag.groupBy({
      by: ["type"],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    prisma.anomalyFlag.groupBy({
      by: ["severity"],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    prisma.anomalyFlag.count({ where: { createdAt: { gte: start, lte: end } } }),
    prisma.anomalyFlag.count({
      where: { createdAt: { gte: start, lte: end }, resolvedAt: { not: null } },
    }),
    prisma.anomalyFlag.count({ where: { resolvedAt: null } }),
    prisma.attendance.groupBy({
      by: ["status"],
      where: { checkInTime: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    prisma.$queryRaw`
      SELECT COALESCE(
        AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600.0), 0
      )::float8 AS mttr_hours
      FROM "AnomalyFlag"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
        AND "resolvedAt" IS NOT NULL
    `,
    prisma.$queryRaw`
      SELECT
        COUNT(*) FILTER (WHERE "livenessScore" IS NOT NULL)::int AS n,
        COALESCE(AVG("livenessScore"), 0)::float8 AS avg_score
      FROM "AttendanceEvidence"
      WHERE "createdAt" >= ${start} AND "createdAt" <= ${end}
    `,
  ]);

  const successfulCheckins = successGroups
    .filter((group) => group.status === "PRESENT" || group.status === "LATE")
    .reduce((sum, group) => sum + group._count._all, 0);
  const attempts = successfulCheckins + totalAnomalies;

  const resolutionRate = calculatePercentage(resolvedAnomalies, totalAnomalies);
  const mttrHours = Math.round((mttrRows[0]?.mttr_hours ?? 0) * 10) / 10;
  const evidence = evidenceRows[0] ?? { n: 0, avg_score: 0 };

  // --- composite score ---
  const cleanliness = attempts > 0 ? (1 - totalAnomalies / attempts) * 100 : 100;
  const resolution = totalAnomalies === 0 ? 100 : resolutionRate;
  const liveness = evidence.n > 0 ? evidence.avg_score * 100 : null;

  const components = [
    { key: "cleanliness", label: "Clean check-ins", value: Math.round(cleanliness * 10) / 10, weight: 0.55 },
    { key: "resolution", label: "Anomaly resolution", value: Math.round(resolution * 10) / 10, weight: 0.15 },
  ];
  if (liveness !== null) {
    components.push({
      key: "liveness",
      label: "Liveness quality",
      value: Math.round(liveness * 10) / 10,
      weight: 0.3,
    });
  }
  const weightSum = components.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round(
    components.reduce((sum, c) => sum + c.value * c.weight, 0) / weightSum
  );

  const groupCount = (groups, dim, catalog) =>
    catalog.map((entry) => ({
      key: entry.key,
      label: entry.label,
      count: groups.find((group) => group[dim] === entry.key)?._count._all ?? 0,
    }));

  return {
    range: { preset: range.preset, from: range.label.from, to: range.label.to },
    integrityScore: { score, grade: gradeFor(score), components },
    summary: {
      totalAnomalies,
      openAnomalies,
      resolvedAnomalies,
      resolutionRate,
      mttrHours,
      successfulCheckins,
      attempts,
      anomalyRate: calculatePercentage(totalAnomalies, attempts),
      avgLivenessScore: Math.round((evidence.avg_score ?? 0) * 100) / 100,
      evidenceCount: evidence.n ?? 0,
    },
    byType: groupCount(byType, "type", ANOMALY_TYPES),
    bySeverity: groupCount(bySeverity, "severity", ANOMALY_SEVERITIES),
  };
}
