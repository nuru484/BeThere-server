export * from "./auth.js";
export * from "./users.js";
export * from "./facescan.js";
export * from "./event.js";

import {
  createAttendance,
  updateAttendance,
  getUserAttendance,
  getEventAttendance,
  getUserEventAttendance,
} from "./attendance.js";

import { refreshToken } from "./refresh-jwt-token.js";

import {
  getTotalUsersCount,
  getTotalEventsCount,
  getUpcomingEventsCount,
  getAttendanceRecordsToday,
  getRecentActivityFeed,
} from "./dashboard.js";

export {
  createAttendance,
  updateAttendance,
  getUserEventAttendance,
  getUserAttendance,
  getEventAttendance,
  refreshToken,
  getTotalUsersCount,
  getTotalEventsCount,
  getUpcomingEventsCount,
  getAttendanceRecordsToday,
  getRecentActivityFeed,
};
