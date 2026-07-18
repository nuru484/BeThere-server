// app.js
//
// The Express app, separated from the server bootstrap (server.js) so the
// test suite can drive it through supertest without opening a port or
// starting the BullMQ workers.
import express from "express";
import ENV from "./src/config/env.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import routes from "./src/routes/index.js";
import {
  UnauthorizedError,
  errorHandler,
  NotFoundError,
} from "./src/middleware/error-handler.js";
import { prisma } from "./src/config/prisma-client.js";
import { v2 as cloudinary } from "cloudinary";

const app = express();

const allowedOrigins = new Set(
  ENV.CORS_ACCESS ? ENV.CORS_ACCESS.split(",") : []
);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      callback(new UnauthorizedError("Not allowed by CORS"));
    }
  },
};

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
// Exactly one proxy hop (the platform's load balancer). `true` would trust
// any X-Forwarded-For chain, letting clients spoof the IP the rate limiter
// keys on.
app.set("trust proxy", 1);
if (ENV.NODE_ENV !== "test") {
  app.use(morgan(":method :url :status :response-time ms"));
}

// Liveness: process is up. Kept before the API router so platform pollers
// never touch business middleware.
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// Deep check: database reachable.
app.get("/health/db", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", db: "up" });
  } catch {
    res.status(503).json({ status: "error", db: "down" });
  }
});

app.use("/api/v1", routes);

app.get("/", (req, res, _next) => {
  res.status(200).json({
    success: true,
    message: "API is working",
  });
});

// Unknown route
app.use((req, res, next) => {
  const error = new NotFoundError(`Route ${req.originalUrl} not found`);
  next(error);
});

app.use(errorHandler);

cloudinary.config({
  cloud_name: ENV.CLOUDINARY_CLOUD_NAME,
  api_key: ENV.CLOUDINARY_API_KEY,
  api_secret: ENV.CLOUDINARY_API_SECRET,
});

export default app;
