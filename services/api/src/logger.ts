import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  // Never let a password, token or patient identifier reach the log stream.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.body.password',
      'req.body.currentPassword',
      'req.body.newPassword',
      'req.body.refreshToken',
      'req.body.name',
      'req.body.mobile',
      'res.headers["set-cookie"]',
    ],
    remove: true,
  },
  transport: config.isProduction ? undefined : { target: 'pino/file', options: { destination: 1 } },
});
