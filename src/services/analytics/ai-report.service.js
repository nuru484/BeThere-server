// src/services/analytics/ai-report.service.js
//
// The admin analytics AI narrative. It gathers ONLY aggregate metrics - rates,
// counts, status/type breakdowns, integrity totals - and never any per-person
// data (no names, no emails, no attendee rows). That PII firewall is enforced
// here by construction: this file only ever calls the aggregate slices, never
// the top-attendees leaderboard. The AI client is injectable for testing.
import ENV from "../../config/env.js";
import * as geminiClient from "../../lib/gemini.js";
import { resolveAnalyticsRange } from "../../utils/analytics-range.js";
import { getAdminKpis } from "./admin-overview.service.js";
import { getPresenceBreakdown } from "./admin-presence.service.js";
import { getIntegritySummary } from "./admin-integrity.service.js";

const BASE_SYSTEM = `You are an analytics assistant for BeThere, a verified-live-presence attendance system where each check-in is proven by a venue code plus a server-side face-liveness check.

Write a concise executive summary of the period's attendance and integrity for an administrator. Rules:
- Base every statement ONLY on the numbers provided below. Never invent figures.
- You have AGGREGATE data only - never name or refer to individual people.
- Output plain text: a single headline line, then 3-5 short bullet points (each starting with "- "), then 2-3 brief, actionable recommendations (each starting with "- ").
- Cover presence (attendance/punctuality), and integrity (anomalies, the integrity score) where notable.`;

/** Trims a KPI object down to the value + trend the model needs. */
function slimKpis(kpis) {
  const out = {};
  for (const [key, metric] of Object.entries(kpis)) {
    out[key] = { value: metric.value, unit: metric.unit, trend: metric.trend };
  }
  return out;
}

/**
 * Builds the aggregate, non-PII snapshot the model sees. Kept separate so tests
 * can assert exactly what data leaves the building.
 */
export async function gatherAdminSnapshot(params, now = new Date()) {
  const [kpis, integrity, statusBreakdown, eventTypeBreakdown] = await Promise.all([
    getAdminKpis(params, now),
    getIntegritySummary(params, now),
    getPresenceBreakdown(params, "status", now),
    getPresenceBreakdown(params, "eventType", now),
  ]);

  const range = resolveAnalyticsRange(params, now);

  return {
    period: { from: range.label.from, to: range.label.to },
    kpis: slimKpis(kpis.kpis),
    integrity: {
      score: integrity.integrityScore.score,
      grade: integrity.integrityScore.grade,
      ...integrity.summary,
    },
    statusBreakdown: statusBreakdown.segments,
    eventTypeBreakdown: eventTypeBreakdown.segments,
    anomaliesByType: integrity.byType,
    anomaliesBySeverity: integrity.bySeverity,
  };
}

/**
 * Generates the AI summary. Returns { configured: false } (a friendly empty
 * state, not an error) when no provider key is set. The `ai` client is
 * injectable so tests can drive it without a real API call.
 */
export async function generateAdminAiSummary(params, now = new Date(), ai = geminiClient) {
  if (!ai.isConfigured()) {
    return { configured: false };
  }

  const snapshot = await gatherAdminSnapshot(params, now);
  const prompt = `${BASE_SYSTEM}\n\nAggregate data (JSON):\n${JSON.stringify(snapshot, null, 2)}`;

  const summary = await ai.generateText(prompt);

  return {
    configured: true,
    summary,
    model: ENV.GEMINI_MODEL,
    generatedAt: now.toISOString(),
    stats: snapshot,
  };
}
