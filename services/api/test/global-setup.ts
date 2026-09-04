import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import { requireTestDatabase } from './require-test-database.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.resolve(here, '..');

/**
 * Bring the test database up to the current schema once per run.
 *
 * `migrate deploy` rather than `db push`, so the tests exercise the same
 * migrations that will be applied in production — a migration that fails in
 * CI is exactly the thing this should catch.
 */
export default function setup() {
  // Same precedence as the per-test setup: an externally supplied
  // DATABASE_URL (CI) takes priority over the committed local default.
  const fromEnvironment = process.env.DATABASE_URL;
  dotenv.config({ path: path.resolve(apiRoot, '.env.test'), override: true });
  if (fromEnvironment) process.env.DATABASE_URL = fromEnvironment;

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set; check services/api/.env.test');
  }
  requireTestDatabase(process.env.DATABASE_URL);

  execSync('npx prisma migrate deploy', {
    cwd: apiRoot,
    stdio: 'inherit',
    env: { ...process.env },
  });
}
