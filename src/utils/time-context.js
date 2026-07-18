// src/utils/time-context.js

/**
 * Events store their daily attendance window as "HH:MM" strings, which are
 * only meaningful in the venue's timezone - comparing them against the
 * SERVER's local clock breaks the moment the host runs in UTC while the
 * venue is not (or vice versa). All wall-clock comparisons therefore go
 * through this helper, pinned to EVENT_TIMEZONE.
 */
import ENV from "../config/env.js";

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
