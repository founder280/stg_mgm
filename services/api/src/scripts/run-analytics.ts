/** One-shot surveillance pass, for cron or a manual run after seeding. */
import { prisma } from '../db.js';
import { runAnalytics } from '../services/analytics.service.js';

runAnalytics()
  .then((result) => {
    console.log('Analytics run complete:', result);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
