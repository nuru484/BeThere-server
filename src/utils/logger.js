// src/utils/logger.ts
import pino from "pino";
import ENV from "../config/env.js";

const isProduction = ENV.NODE_ENV === "production";

const logger = pino({
  level: isProduction ? "info" : "debug",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: true,
      singleLine: false,
      ignore: "",
    },
  },
});

export default logger;
