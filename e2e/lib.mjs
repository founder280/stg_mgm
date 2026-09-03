/** Shared helpers for the end-to-end checks. */

export const API = process.env.MGMS_API_URL ?? 'http://localhost:4000';
export const WEB = process.env.MGMS_WEB_URL ?? 'http://localhost:5173';
export const FIELD_APP = process.env.MGMS_FIELD_URL ?? 'http://localhost:5174';
export const PASSWORD = process.env.MGMS_SEED_PASSWORD ?? 'ChangeMe@2026';

export function createReporter(title) {
  let failures = 0;
  let checks = 0;

  console.log(`\n${title}\n${'─'.repeat(title.length)}`);

  return {
    check(name, condition, detail = '') {
      checks += 1;
      if (!condition) failures += 1;
      const mark = condition ? '  ok  ' : ' FAIL ';
      console.log(`${mark} ${name}${detail ? `  · ${detail}` : ''}`);
    },
    finish() {
      console.log(
        `\n${failures === 0 ? `All ${checks} checks passed.` : `${failures} of ${checks} checks FAILED.`}`,
      );
      return failures;
    },
  };
}

export async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

export async function signIn(username, password = PASSWORD) {
  const response = await api('/api/auth/login', { method: 'POST', body: { username, password } });
  if (response.status !== 200) {
    throw new Error(`Sign-in failed for ${username}: ${response.status} ${JSON.stringify(response.data)}`);
  }
  return response.data;
}

/** Capture metadata, as the field device would produce it. */
export function capture(username) {
  const now = Date.now();
  return {
    formName: 'Onsite Medical Camp Data Collection',
    formVersion: '2.0',
    username,
    loginTime: new Date(now - 3_600_000).toISOString(),
    deviceId: 'E2E-DEVICE-01',
    instanceId: crypto.randomUUID(),
    recordStartTime: new Date(now - 300_000).toISOString(),
    recordEndTime: new Date().toISOString(),
  };
}

/** Fail fast with a clear message rather than a wall of connection errors. */
export async function requireService(url, name) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!response.ok && response.status >= 500) throw new Error(String(response.status));
  } catch {
    console.error(
      `\n${name} is not reachable at ${url}.\n` +
        'Start the stack first — see docs/testing.md — then run this again.\n',
    );
    process.exit(2);
  }
}

/**
 * Playwright is an optional dependency: the API checks run without it, and the
 * browser checks say plainly what to install rather than failing obscurely.
 */
export async function loadChromium() {
  try {
    const { chromium } = await import('playwright');
    return chromium;
  } catch {
    console.error(
      '\nPlaywright is not installed. The browser checks need it:\n' +
        '  npm install -D playwright && npx playwright install chromium\n',
    );
    process.exit(2);
  }
}

export function browserLaunchOptions() {
  // Honour a preinstalled browser when one is provided (CI images often do).
  return process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : {};
}
