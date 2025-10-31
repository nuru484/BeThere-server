import { login, signup } from "./auth.js";
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
  createUserIdentification,
  deleteUser,
  updateUser,
  getAllUserIdentifications,
  updateUserRole,
} from "./users.js";
import { refreshToken } from "./refreshJwtToken.js";

import {
  getTotalUsersCount,
  getTotalEventsCount,
  getUpcomingEventsCount,
  getAttendanceRecordsToday,
  getRecentActivityFeed,
} from "./adminDashboard.js";

import { addFaceScan, getFaceScan, deleteFaceScan } from "./facescan.js";

export {
  signup,
  login,
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
  createUserIdentification,
  deleteUser,
  updateUser,
  getAllUserIdentifications,
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
