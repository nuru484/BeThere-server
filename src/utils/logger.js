// src/utils/logger.js
import pino from "pino";
import ENV from "../config/env.js";

const isProduction = ENV.NODE_ENV === "production";

// JSON logs in production (for log aggregators); pretty-printed in dev only.
const logger = pino({
  level: isProduction ? "info" : "debug",
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: true,
            singleLine: false,
            ignore: "",
          },
        },
      }),
});

export default logger;
