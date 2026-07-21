// src/utils/analytics-range.js
//
// The analytics date-range engine shared by every admin analytics slice.
//
// It turns a request's `{ preset }` OR `{ startDate, endDate }` into:
//   - a CURRENT window (venue-timezone instants),
//   - the immediately PRECEDING window of the same length (for period-over-
//     period trend arrows),
//   - the right time GRANULARITY for a trend chart, and
//   - the concrete venue-day/week/month BUCKET edges to feed a one-query
//     time series.
//
// Everything is computed on the VENUE calendar (EVENT_TIMEZONE), never the
// server's local clock, so a "day" here means the same day check-in used when
// it decided PRESENT vs LATE. All the timezone-correct primitives live in
// time-context.js; this module only does calendar arithmetic on top of them.
import { differenceInCalendarDays } from "date-fns";
import {
  BadRequestError,
  ValidationError,
} from "../middleware/error-handler.js";
import {
  addUtcDays,
  eventCalendarDay,
  eventDayKey,
  eventTimeOnDay,
  utcDayStart,
} from "./time-context.js";

// Widest range any analytics query will aggregate. Matches the legacy
// dashboard cap; beyond ~a year of charts there is no use case, only an
// unbounded scan.
export const MAX_ANALYTICS_RANGE_DAYS = 400;

// The presets the UI offers. `custom` is implied by passing startDate+endDate.
export const ANALYTICS_PRESETS = [
  "today",
  "yesterday",
  "this_week",
  "last_7_days",
  "this_month",
  "last_month",
  "last_30_days",
  "this_quarter",
  "last_quarter",
  "this_year",
  "last_year",
  "last_90_days",
];

const DEFAULT_PRESET = "this_month";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** The real instant of 00:00 venue-time on a UTC-midnight date-only day. */
function venueDayStart(day) {
  return eventTimeOnDay(day, "00:00");
}

/** The last millisecond of a UTC-midnight date-only day, in venue time. */
function venueDayEnd(day) {
  return new Date(venueDayStart(addUtcDays(day, 1)).getTime() - 1);
}

/** Whole venue days between two UTC-midnight date-only values (a - b). */
function dayDiff(a, b) {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

/** Monday of the week containing a UTC-midnight date-only day. */
function mondayOf(day) {
  const dow = new Date(day).getUTCDay(); // 0=Sun..6=Sat
  return addUtcDays(day, -((dow + 6) % 7));
}

/**
 * Resolves a preset to its CURRENT window as a [startDay, endDay] pair of
 * UTC-midnight date-only values, relative to the venue's "today".
 */
function presetDays(preset, today) {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(y, m, 1));
  const qStartMonth = Math.floor(m / 3) * 3;
  const firstOfQuarter = new Date(Date.UTC(y, qStartMonth, 1));

  switch (preset) {
    case "today":
      return [today, today];
    case "yesterday": {
      const d = addUtcDays(today, -1);
      return [d, d];
    }
    case "this_week":
      return [mondayOf(today), today];
    case "last_7_days":
      return [addUtcDays(today, -6), today];
    case "this_month":
      return [firstOfMonth, today];
    case "last_month": {
      const start = new Date(Date.UTC(y, m - 1, 1));
      return [start, addUtcDays(firstOfMonth, -1)];
    }
    case "last_30_days":
      return [addUtcDays(today, -29), today];
    case "this_quarter":
      return [firstOfQuarter, today];
    case "last_quarter": {
      const start = new Date(Date.UTC(y, qStartMonth - 3, 1));
      return [start, addUtcDays(firstOfQuarter, -1)];
    }
    case "this_year":
      return [new Date(Date.UTC(y, 0, 1)), today];
    case "last_year":
      return [new Date(Date.UTC(y - 1, 0, 1)), new Date(Date.UTC(y - 1, 11, 31))];
    case "last_90_days":
      return [addUtcDays(today, -89), today];
    default:
      throw new ValidationError(
        `Unknown preset "${preset}". Valid presets: ${ANALYTICS_PRESETS.join(", ")}.`
      );
  }
}

/** Parses a YYYY-MM-DD string to its UTC-midnight date-only day. */
function parseDayString(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError(`Invalid ${label}. Use YYYY-MM-DD format.`);
  }
  const day = utcDayStart(new Date(`${value}T00:00:00.000Z`));
  if (Number.isNaN(day.getTime())) {
    throw new ValidationError(`Invalid ${label}. Use YYYY-MM-DD format.`);
  }
  return day;
}

/**
 * The one entry point. Given raw query params and `now`, returns the resolved
 * range descriptor every analytics service starts from.
 *
 * @param {{ preset?: string, startDate?: string, endDate?: string }} params
 * @param {Date} [now]
 * @returns {{
 *   preset: string|null,
 *   granularity: "hour"|"day"|"week"|"month",
 *   days: number,
 *   current: { start: Date, end: Date, startDay: Date, endDay: Date },
 *   previous: { start: Date, end: Date, startDay: Date, endDay: Date },
 *   label: { from: string, to: string },
 *   now: Date,
 *   inProgress: boolean,
 *   elapsedFraction: number,
 * }}
 */
export function resolveAnalyticsRange(params = {}, now = new Date()) {
  const today = eventCalendarDay(now);

  let startDay;
  let endDay;
  let preset = null;

  const hasCustom = params.startDate || params.endDate;
  if (hasCustom) {
    if (!params.startDate || !params.endDate) {
      throw new ValidationError(
        "Both startDate and endDate are required for a custom range."
      );
    }
    startDay = parseDayString(params.startDate, "startDate");
    endDay = parseDayString(params.endDate, "endDate");
    if (startDay > endDay) {
      throw new ValidationError("startDate cannot be after endDate.");
    }
  } else {
    preset = (params.preset || DEFAULT_PRESET).toLowerCase();
    [startDay, endDay] = presetDays(preset, today);
  }

  const days = dayDiff(endDay, startDay) + 1;
  if (differenceInCalendarDays(endDay, startDay) > MAX_ANALYTICS_RANGE_DAYS) {
    throw new BadRequestError(
      `Date range too large. Maximum is ${MAX_ANALYTICS_RANGE_DAYS} days.`
    );
  }

  // The immediately preceding window of identical length.
  const prevEndDay = addUtcDays(startDay, -1);
  const prevStartDay = addUtcDays(startDay, -days);

  const current = {
    startDay,
    endDay,
    start: venueDayStart(startDay),
    end: venueDayEnd(endDay),
  };
  const previous = {
    startDay: prevStartDay,
    endDay: prevEndDay,
    start: venueDayStart(prevStartDay),
    end: venueDayEnd(prevEndDay),
  };

  // How far into the current window "now" sits (for run-rate forecasts). Only
  // meaningful while the window is genuinely in progress.
  const span = current.end.getTime() - current.start.getTime() || 1;
  const elapsed = now.getTime() - current.start.getTime();
  const inProgress = now >= current.start && now <= current.end;
  const elapsedFraction = inProgress
    ? Math.min(1, Math.max(0, elapsed / span))
    : now > current.end
      ? 1
      : 0;

  return {
    preset,
    granularity: determineGranularity(days),
    days,
    current,
    previous,
    label: { from: eventDayKey(current.start), to: eventDayKey(current.end) },
    now,
    inProgress,
    elapsedFraction,
  };
}

/** Picks a chart granularity from a window's day count. */
export function determineGranularity(days) {
  if (days <= 1) return "hour";
  if (days <= 31) return "day";
  if (days <= 92) return "week";
  return "month";
}

/**
 * The concrete bucket edges for a resolved window, as venue-timezone instants.
 * Each bucket is `{ start, end, label }`; `label` is the chart's x-axis key.
 * Feed these straight into the bucketing helpers in analytics-buckets.js.
 *
 * @param {{ current: { start: Date, end: Date, startDay: Date, endDay: Date } }} range
 * @param {"hour"|"day"|"week"|"month"} granularity
 */
export function buildBuckets(range, granularity) {
  const { start, end, startDay, endDay } = range.current;

  if (granularity === "hour") {
    // 24 fixed hourly slots across the single day. DST edge days (23/25h) are
    // rare enough that fixed 1h steps clamped to the day end are acceptable.
    const buckets = [];
    for (let h = 0; h < 24; h++) {
      const bStart = new Date(start.getTime() + h * 60 * 60 * 1000);
      if (bStart > end) break;
      const bEnd = new Date(
        Math.min(bStart.getTime() + 60 * 60 * 1000 - 1, end.getTime())
      );
      buckets.push({ start: bStart, end: bEnd, label: `${String(h).padStart(2, "0")}:00` });
    }
    return buckets;
  }

  if (granularity === "day") {
    const buckets = [];
    for (let d = new Date(startDay); d <= endDay; d = addUtcDays(d, 1)) {
      buckets.push({
        start: venueDayStart(d),
        end: venueDayEnd(d),
        label: eventDayKey(venueDayStart(d)),
      });
    }
    return buckets;
  }

  if (granularity === "week") {
    const buckets = [];
    let weekStart = mondayOf(startDay);
    while (weekStart <= endDay) {
      const weekEndDay = addUtcDays(weekStart, 6);
      const bStart = new Date(Math.max(venueDayStart(weekStart).getTime(), start.getTime()));
      const bEnd = new Date(Math.min(venueDayEnd(weekEndDay).getTime(), end.getTime()));
      buckets.push({
        start: bStart,
        end: bEnd,
        label: eventDayKey(venueDayStart(weekStart)),
      });
      weekStart = addUtcDays(weekStart, 7);
    }
    return buckets;
  }

  // month
  const buckets = [];
  let y = startDay.getUTCFullYear();
  let m = startDay.getUTCMonth();
  const endY = endDay.getUTCFullYear();
  const endM = endDay.getUTCMonth();
  while (y < endY || (y === endY && m <= endM)) {
    const monthStartDay = new Date(Date.UTC(y, m, 1));
    const monthEndDay = new Date(Date.UTC(y, m + 1, 0)); // last day of month
    const bStart = new Date(Math.max(venueDayStart(monthStartDay).getTime(), start.getTime()));
    const bEnd = new Date(Math.min(venueDayEnd(monthEndDay).getTime(), end.getTime()));
    buckets.push({
      start: bStart,
      end: bEnd,
      label: `${y}-${String(m + 1).padStart(2, "0")}`,
    });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return buckets;
}

/**
 * Period-over-period trend. Returns a direction and an absolute percentage
 * change, guarding the divide-by-zero cases the UI arrow renders.
 *
 * @param {number} current
 * @param {number} previous
 * @returns {{ direction: "upward"|"downward"|"neutral", percentage: number }}
 */
export function calculateTrend(current, previous) {
  if (previous === 0) {
    if (current === 0) return { direction: "neutral", percentage: 0 };
    return { direction: "upward", percentage: 100 };
  }
  const change = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(change) * 100) / 100;
  if (rounded === 0) return { direction: "neutral", percentage: 0 };
  return { direction: change > 0 ? "upward" : "downward", percentage: rounded };
}

/** A value as a 2-decimal percentage of a total, divide-by-zero safe. */
export function calculatePercentage(value, total) {
  if (!total || total <= 0) return 0;
  return Math.round((value / total) * 10000) / 100;
}
