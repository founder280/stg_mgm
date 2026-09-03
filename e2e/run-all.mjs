/**
 * Run every end-to-end check in order.
 *
 *   npm run test:e2e
 *
 * Needs a running stack; see docs/testing.md.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const suites = ['api-workflow.mjs', 'field-app-offline.mjs'];

let failed = 0;

for (const suite of suites) {
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, suite)], { stdio: 'inherit', env: process.env });
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
  });

  // Exit code 2 means a prerequisite is missing, not a failing assertion —
  // reported separately so a missing browser is not mistaken for a defect.
  if (code === 2) {
    console.log(`\nSkipped ${suite}: a prerequisite is not available.\n`);
    continue;
  }
  if (code !== 0) failed += 1;
}

console.log(failed === 0 ? '\nEnd-to-end checks complete.\n' : `\n${failed} suite(s) failed.\n`);
process.exit(failed === 0 ? 0 : 1);
