import { Router } from "express";
const router = Router();

import {
  getTotalUsersCount,
  getTotalEventsCount,
  getUpcomingEventsCount,
  getAttendanceRecordsToday,
  getRecentActivityFeed,
} from "../controllers/index.js";

router.get("/users", getTotalUsersCount);
router.get("/events/total", getTotalEventsCount);
router.get("/events/upcoming", getUpcomingEventsCount);
router.get("/attendance/today", getAttendanceRecordsToday);
router.get("/activity/recent", getRecentActivityFeed);

export default router;
