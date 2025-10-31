import express from "express";
import ENV from "./src/config/env.js";
import cookieParser from "cookie-parser";
import cors from "cors";
import morgan from "morgan";
import routes from "./src/routes/index.js";
import {
  UnauthorizedError,
  errorHandler,
} from "./src/middleware/error-handler.js";
import logger from "./src/utils/logger.js";

const app = express();

const allowedOrigins = new Set(
  process.env.CORS_ACCESS ? process.env.CORS_ACCESS.split(",") : []
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

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.set("trust proxy", true);
app.use(morgan(":method :url :status :response-time ms"));

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

const port = ENV.PORT || 3000;
app.listen(port, () => {
  const message =
    ENV.NODE_ENV === "production"
      ? `App is running in production mode on port ${port}`
      : `App is listening on http://localhost:${port}`;
  logger.info(message);
});
