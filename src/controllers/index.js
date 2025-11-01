export * from "./auth.js";
export * from "./users.js";
export * from "./facescan.js";

import {
  createAttendance,
  updateAttendance,
  getUserAttendance,
  getEventAttendance,
  getUserEventAttendance,
} from "./attendance.js";

import {
  createEvent,
  updateEvent,
  deleteEvent,
  deleteAllEvents,
  getEventById,
  getAllEvents,
} from "./event.js";

import { refreshToken } from "./refresh-jwt-token.js";

import {
  getTotalUsersCount,
  getTotalEventsCount,
  getUpcomingEventsCount,
  getAttendanceRecordsToday,
  getRecentActivityFeed,
} from "./dashboard.js";

export {
  createEvent,
  updateEvent,
  deleteEvent,
  deleteAllEvents,
  getEventById,
  getAllEvents,
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
