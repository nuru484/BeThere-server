import { Router } from "express";
const routes = Router();

import authRoutes from "./auth.js";
import eventRoutes from "./event.js";
import attendanceRoutes from "./attendance.js";
import refreshTokenRoute from "./refresh-token.js";
import usersRoutes from "./users.js";
import faceScanRoutes from "./facescan.js";
import dashboardRoutes from "./dashboard/index.js";

routes.use("/auth", authRoutes);
routes.use("/events", eventRoutes);
routes.use("/attendance", attendanceRoutes);
routes.use("/refreshToken", refreshTokenRoute);
routes.use("/users", usersRoutes);
routes.use("/facescan", faceScanRoutes);
routes.use("/dashboard", dashboardRoutes);

export default routes;
