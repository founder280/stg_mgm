/**
 * Assemble the static demonstration site.
 *
 *   npm run demo:build
 *
 * Produces site-dist/ laid out as GitHub Pages will serve it:
 *   /            the landing page
 *   /console/    the administration console and dashboard
 *   /camp/       the field app
 *
 * Both apps are built in demo mode, so they answer their own requests in the
 * browser instead of calling an API that is not there.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'site-dist');

/** Where the site is served from — "/" locally, "/<repo>/" on project Pages. */
const prefix = process.env.MGMS_SITE_BASE ?? '/';
const run = (command, args, env = {}) =>
  execFileSync(command, args, { cwd: root, stdio: 'inherit', env: { ...process.env, ...env } });

console.log(`Building the demonstration site with base "${prefix}"`);

if (!existsSync(path.join(root, 'packages/demo/src/snapshot.json'))) {
  console.error(
    '\npackages/demo/src/snapshot.json is missing.\n' +
      'Seed a database and run: npm run demo:snapshot\n',
  );
  process.exit(1);
}

run('npm', ['run', 'build', '--workspace', '@mgms/shared']);
run('npm', ['run', 'build:demo', '--workspace', '@mgms/web'], { MGMS_BASE: `${prefix}console/` });
run('npm', ['run', 'build:demo', '--workspace', '@mgms/mobile'], { MGMS_BASE: `${prefix}camp/` });

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(path.join(root, 'site'), out, { recursive: true });
cpSync(path.join(root, 'apps/web/dist'), path.join(out, 'console'), { recursive: true });
cpSync(path.join(root, 'apps/mobile/dist'), path.join(out, 'camp'), { recursive: true });

// Rewrite the landing page's links for a subdirectory deployment.
if (prefix !== '/') {
  const landing = path.join(out, 'index.html');
  const html = readFileSync(landing, 'utf8');
  writeFileSync(
    landing,
    html.replaceAll('href="./console/"', `href="${prefix}console/"`).replaceAll('href="./camp/"', `href="${prefix}camp/"`),
  );
}

// Pages would otherwise run the output through Jekyll, which drops _-prefixed
// files and can mangle asset paths.
writeFileSync(path.join(out, '.nojekyll'), '');

console.log(`\nDemonstration site built into ${out}`);
console.log('Serve it locally with:  npx serve site-dist   (or any static server)');
