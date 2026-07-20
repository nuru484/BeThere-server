// src/utils/time-context.js

/**
 * Events store their daily attendance window as "HH:MM" strings, which are
 * only meaningful in the venue's timezone - comparing them against the
 * SERVER's local clock breaks the moment the host runs in UTC while the
 * venue is not (or vice versa). All wall-clock comparisons therefore go
 * through this helper, pinned to EVENT_TIMEZONE.
 */
import ENV from "../config/env.js";

/**
 * The venue's CALENDAR DAY for `now`, as a UTC-midnight Date.
 *
 * Session rows store date-only values, and "which day is it at the venue" has
 * to be asked the same way everywhere. Deriving it from the SERVER's local
 * midnight meant a host in UTC and a venue in UTC+12 disagreed about the
 * current day for half of it, so check-in was refused all morning and then
 * opened during the previous venue evening.
 */
export function eventCalendarDay(now = new Date()) {
  // en-CA renders as YYYY-MM-DD, which is exactly the date-only key we want.
  const isoDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: ENV.EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  return new Date(`${isoDate}T00:00:00.000Z`);
}

/**
 * Normalizes an already date-only value (an event's startDate/endDate) to UTC
 * midnight WITHOUT re-interpreting it through a timezone, which would shift it
 * a day for negative offsets.
 */
export function utcDayStart(value) {
  const date = new Date(value);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

/** "HH:MM" for the current moment in the event timezone. */
export function currentTimeStringInEventTz(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ENV.EVENT_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
}

/**
 * A Date for today's "HH:MM" in the event timezone, built from `now`. Used
 * to compare check-in instants against the window edges.
 */
export function todayAtEventTime(timeString, now = new Date()) {
  const [hour, minute] = timeString.split(":").map(Number);
  // Compute the event-tz offset for `now`, then place the wall-clock time.
  const tzNow = new Date(
    now.toLocaleString("en-US", { timeZone: ENV.EVENT_TIMEZONE })
  );
  const offsetMs = now.getTime() - tzNow.getTime();
  const local = new Date(tzNow);
  local.setHours(hour, minute, 0, 0);
  return new Date(local.getTime() + offsetMs);
}
