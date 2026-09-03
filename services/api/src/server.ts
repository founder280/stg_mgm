import { createApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { prisma } from './db.js';
import { startAnalyticsScheduler, stopAnalyticsScheduler } from './services/analytics.service.js';

const app = createApp();

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'MGMS API listening');
  startAnalyticsScheduler();
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down');
  stopAnalyticsScheduler();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  // Do not let an in-flight request hold the process open indefinitely.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
