/** Load the test environment before any module reads `process.env`. */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));

// A DATABASE_URL already in the environment wins: CI points the suite at its
// own PostgreSQL service, and must not be overridden by the local defaults.
const fromEnvironment = process.env.DATABASE_URL;
dotenv.config({ path: path.resolve(here, '../.env.test'), override: true });
if (fromEnvironment) process.env.DATABASE_URL = fromEnvironment;

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-that-is-long-enough-for-validation';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-that-is-long-enough-for-validation';
