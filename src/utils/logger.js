// src/utils/logger.ts
import pino from 'pino';

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: isProduction ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: true,
      singleLine: false,
      ignore: '',
    },
  },
});

export default logger;
