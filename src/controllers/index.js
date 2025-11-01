export * from "./auth.js";
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
import {
  getAllUsers,
  deleteUser,
  updateUser,
  updateUserRole,
} from "./users.js";
import { refreshToken } from "./refresh-jwt-token.js";

import {
  getTotalUsersCount,
  getTotalEventsCount,
  getUpcomingEventsCount,
  getAttendanceRecordsToday,
  getRecentActivityFeed,
} from "./dashboard.js";

import { addFaceScan, getFaceScan, deleteFaceScan } from "./facescan.js";

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
  getAllUsers,
  deleteUser,
  updateUser,
  updateUserRole,
  refreshToken,
  getTotalUsersCount,
  getTotalEventsCount,
  getUpcomingEventsCount,
  getAttendanceRecordsToday,
  getRecentActivityFeed,
  addFaceScan,
  getFaceScan,
  deleteFaceScan,
};
