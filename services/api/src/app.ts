import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { config } from './config.js';
import { logger } from './logger.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { authRouter } from './routes/auth.routes.js';
import { rolesRouter } from './routes/admin/roles.routes.js';
import { departmentsRouter, usersRouter } from './routes/admin/users.routes.js';
import { addressRouter, facilitiesRouter, mastersRouter } from './routes/admin/masters.routes.js';
import { campsRouter, eventsRouter } from './routes/events.routes.js';
import { walkInsRouter } from './routes/walkins.routes.js';
import { syncRouter } from './routes/sync.routes.js';
import { alertsRouter, dashboardRouter } from './routes/dashboard.routes.js';
import { prisma } from './db.js';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', true);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Native app shells and server-to-server calls send no Origin header.
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed`));
      },
      credentials: true,
    }),
  );
  // Camp devices push a whole day's queue in one batch after a long outage.
  app.use(express.json({ limit: '5mb' }));
  if (!config.isTest) {
    app.use(
      pinoHttp({
        logger,
        // One readable line per request. The default serialisers dump every
        // header on both sides, which buries the signal and risks logging
        // tokens even with redaction in place.
        serializers: {
          req: (req) => ({ method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
        customLogLevel: (_req, res, err) =>
          err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      }),
    );
  }

  app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ready' });
    } catch (error) {
      logger.error({ err: error }, 'Readiness check failed');
      res.status(503).json({ status: 'unavailable', reason: 'database' });
    }
  });

  app.use('/api/auth', authRouter);

  // Everything below this line requires a valid access token.
  const api = express.Router();
  api.use(authenticate);
  api.use('/roles', rolesRouter);
  api.use('/users', usersRouter);
  api.use('/departments', departmentsRouter);
  api.use('/address', addressRouter);
  api.use('/facilities', facilitiesRouter);
  api.use('/masters', mastersRouter);
  api.use('/events', eventsRouter);
  api.use('/camps', campsRouter);
  api.use('/walk-ins', walkInsRouter);
  api.use('/sync', syncRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/alerts', alertsRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
