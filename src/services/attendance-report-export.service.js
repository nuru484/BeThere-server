// src/services/attendance-report-export.service.js
//
// Builds the .xlsx export for the attendance report: a Summary sheet, the full
// filtered Records sheet, and a Top-attendees sheet. Reuses the report's own
// filtered query so the export always matches what the on-screen report shows.
import ENV from "../config/env.js";
import { buildWorkbookBuffer } from "../utils/xlsx-export.js";
import { getAttendanceReportForExport } from "./attendance-report.service.js";

// Instants are rendered in the venue timezone so an exported time matches the
// wall clock attendance was recorded against.
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: ENV.EVENT_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
// Session dates are date-only (UTC midnight); format them in UTC so they don't
// shift a day across the venue offset.
const dateFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  year: "numeric",
  month: "short",
  day: "2-digit",
});

const fmtInstant = (value) => (value ? dateTimeFmt.format(new Date(value)) : "");
const fmtDate = (value) => (value ? dateFmt.format(new Date(value)) : "");

// CSV/XLSX formula-injection guard. Attendee names and emails are
// user-controlled; a value beginning with a formula trigger (= + - @ tab CR)
// is executed as a formula by Excel/Sheets/LibreOffice when the file is
// opened. Prefixing a single quote forces the cell to be treated as text.
const safeCell = (value) =>
  typeof value === "string" && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;

export async function buildAttendanceReportXlsx(filters) {
  const { rows, total, truncated, summary, topAttendees } =
    await getAttendanceReportForExport(filters);

  const summarySheet = {
    name: "Summary",
    columns: [
      { header: "Metric", key: "metric", width: 26 },
      { header: "Value", key: "value", width: 40 },
    ],
    rows: [
      { metric: "Total attendance", value: summary.totalAttendance },
      { metric: "Present", value: summary.presentCount },
      { metric: "Late", value: summary.lateCount },
      { metric: "Absent", value: summary.absentCount },
      { metric: "Rows exported", value: rows.length },
      ...(truncated
        ? [{ metric: "Note", value: `Capped at ${rows.length} of ${total} rows - narrow the filters` }]
        : []),
      { metric: "Generated", value: new Date().toISOString() },
    ],
  };

  const recordsSheet = {
    name: "Records",
    columns: [
      { header: "Attendee", key: "attendee", width: 24 },
      { header: "Email", key: "email", width: 28 },
      { header: "Event", key: "event", width: 24 },
      { header: "Type", key: "type", width: 14 },
      { header: "Recurring", key: "recurring", width: 11 },
      { header: "Location", key: "location", width: 20 },
      { header: "City", key: "city", width: 14 },
      { header: "Country", key: "country", width: 14 },
      { header: "Session date", key: "sessionDate", width: 16 },
      { header: "Check-in", key: "checkIn", width: 20 },
      { header: "Check-out", key: "checkOut", width: 20 },
      { header: "Status", key: "status", width: 10 },
    ],
    rows: rows.map((row) => ({
      attendee: safeCell(row.userName),
      email: safeCell(row.userEmail),
      event: safeCell(row.eventTitle),
      type: safeCell(row.eventType),
      recurring: row.isRecurring ? "Yes" : "No",
      location: safeCell(row.location?.name ?? ""),
      city: safeCell(row.location?.city ?? ""),
      country: safeCell(row.location?.country ?? ""),
      sessionDate: fmtDate(row.sessionStartDate),
      checkIn: fmtInstant(row.checkInTime),
      checkOut: fmtInstant(row.checkOutTime),
      status: row.status,
    })),
  };

  const topSheet = {
    name: "Top attendees",
    columns: [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Name", key: "name", width: 24 },
      { header: "Email", key: "email", width: 28 },
      { header: "Attendances", key: "count", width: 14 },
    ],
    rows: topAttendees.map((attendee, index) => ({
      rank: index + 1,
      name: safeCell(attendee.userName),
      email: safeCell(attendee.email),
      count: attendee.attendanceCount,
    })),
  };

  const buffer = await buildWorkbookBuffer([summarySheet, recordsSheet, topSheet]);
  const filename = `attendance-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return { buffer, filename, total, truncated };
}
