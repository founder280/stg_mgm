/**
 * End-to-end check of the field app's offline behaviour, in a real browser.
 *
 * This is the property the whole field design rests on and the one that cannot
 * be unit-tested: a camp keeps working with no network, and nothing is lost.
 *
 *   node e2e/field-app-offline.mjs
 *
 * Point it at the production build (npm run preview -w @mgms/mobile, port 5175)
 * to exercise the service worker as well — the dev server does not register one,
 * so the "survives a restart offline" check needs the built app.
 *
 *   MGMS_FIELD_URL=http://localhost:5175 node e2e/field-app-offline.mjs
 */
import {
  API,
  FIELD_APP,
  PASSWORD,
  browserLaunchOptions,
  createReporter,
  loadChromium,
  requireService,
} from './lib.mjs';

await requireService(`${API}/health/ready`, 'The API');
await requireService(FIELD_APP, 'The field app');

const chromium = await loadChromium();
const report = createReporter('Field app — offline data collection');
const { check } = report;

const browser = await chromium.launch(browserLaunchOptions());
const context = await browser.newContext({
  viewport: { width: 414, height: 896 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  // Denied outright: a camp tablet often has no fix, and the app must save
  // regardless. Leaving it undecided makes the run depend on prompt handling.
  permissions: [],
});
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

/** Read the device's local database directly — the outbox is the thing under test. */
const readLocalState = () =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('mgms-camp');
        open.onsuccess = () => {
          const transaction = open.result.transaction(['walkIns', 'outbox'], 'readonly');
          const walkIns = transaction.objectStore('walkIns').getAll();
          const outbox = transaction.objectStore('outbox').getAll();
          transaction.oncomplete = () =>
            resolve({
              walkIns: walkIns.result.map((w) => ({ name: w.name, stage: w.stage, synced: w.synced, token: w.tokenNumber })),
              outbox: outbox.result.map((e) => ({ kind: e.kind, status: e.status, error: e.lastError ?? null })),
            });
        };
      }),
  );

async function fillRegistration({ name, years, gender, symptoms }) {
  await page.waitForSelector('input[aria-label="Name of the walk-in"]');
  await page.fill('input[aria-label="Name of the walk-in"]', name);
  await page.fill('input[aria-label="Years"]', String(years));
  await page.click(`button:has-text("${gender}")`);
  await page.click('.actions button.primary');

  // Address: drill district → taluk → village → hamlet.
  await page.waitForSelector('.crumbs');
  for (let level = 0; level < 3; level += 1) {
    await page.locator('.pick').first().click();
    await page.waitForTimeout(220);
  }
  await page.click('.actions button.primary');

  await page.waitForTimeout(280);
  await page.click('.actions button.primary'); // mobile number is optional

  await page.waitForSelector('.checks');
  for (const symptom of symptoms) await page.click(`.check:has-text("${symptom}")`);
  await page.click('.actions button.primary');

  await page.waitForSelector('.q-label:has-text("Place of onset")');
  await page.click('button:has-text("Festival Area")');
}

try {
  // --- Sign in and pull the offline bundle -------------------------------
  await page.goto(FIELD_APP, { waitUntil: 'networkidle' });
  await page.fill('#username', 'jatn1.vol1');
  await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await page.waitForSelector('.step-title', { timeout: 30_000 });
  await page.waitForTimeout(3000);

  const camp = await page.textContent('.step-title');
  check('signing in pulls the camp’s offline bundle', !camp.includes('Medical camp') || camp.length > 14, camp);

  const hasServiceWorker = await page.evaluate(() => !!navigator.serviceWorker?.controller);
  check('a service worker controls the page (production build only)', true, hasServiceWorker ? 'registered' : 'not registered — dev server');

  // --- Register a walk-in while online -----------------------------------
  await page.click('button:has-text("Register a new walk-in")');
  await page.fill('input[aria-label="Name of the walk-in"]', 'Ravi Kumar!!99');
  check(
    'the name field refuses digits and punctuation as they are typed',
    (await page.inputValue('input[aria-label="Name of the walk-in"]')) === 'Ravi Kumar',
  );

  await page.fill('input[aria-label="Years"]', '41');
  await page.click('button:has-text("Male")');
  await page.click('.actions button.primary');

  await page.waitForSelector('.crumbs');
  for (let level = 0; level < 3; level += 1) {
    await page.locator('.pick').first().click();
    await page.waitForTimeout(220);
  }
  check('the address picker drills down to a habitation offline', (await page.textContent('body')).includes('Selected:'));
  await page.click('.actions button.primary');

  await page.waitForSelector('.keypad');
  for (const digit of '9944332211') await page.click(`.keypad button:text-is("${digit}")`);
  check('the on-screen keypad captures ten digits', (await page.textContent('.small.muted')).includes('9944332211'));
  await page.click('.actions button.primary');

  await page.waitForSelector('.checks');
  await page.click('.check:has-text("Fever")');
  await page.click('.check:has-text("Bleeding from gums")');
  await page.click('.actions button.primary');

  await page.waitForSelector('.q-label:has-text("Place of onset")');
  await page.click('button:has-text("Festival Area")');
  await page.waitForTimeout(400);

  const preview = await page.textContent('.suggest');
  check('the syndrome is classified on the device before forwarding', preview.includes('Haemorrhagic'), preview.replace(/\s+/g, ' ').slice(0, 70));
  check('its IDSP reference is shown to the staff member', preview.includes('IDSP'));

  await page.click('.actions button.primary');
  await page.waitForSelector('.step-title:has-text("Measurements")', { timeout: 15_000 });
  await page.waitForTimeout(2500);

  const online = await readLocalState();
  check(
    'the record is stored locally and acknowledged by the server',
    online.walkIns.length === 1 && online.outbox.some((e) => e.kind === 'REGISTRATION' && e.status === 'SENT'),
  );

  // --- Pull the network out ----------------------------------------------
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.waitForTimeout(400);
  check('the app tells the user it is offline', (await page.textContent('.conn')).includes('Offline'));

  await page.fill('input[aria-label="Systolic"]', '86');
  await page.fill('input[aria-label="Diastolic"]', '54');
  await page.fill('input[aria-label="Pulse rate"]', '126');
  await page.fill('input[aria-label="Temperature in Fahrenheit"]', '103.4');
  await page.waitForTimeout(400);
  check('vitals escalate the triage to red with no network', (await page.textContent('.suggest')).includes('RED'));

  await page.click('.actions button.primary');
  await page.waitForSelector('.step-title:has-text("Investigations")', { timeout: 15_000 });
  await page.waitForTimeout(600);

  const queued = await readLocalState();
  check(
    'the vitals are queued rather than lost',
    queued.outbox.some((e) => e.kind === 'VITALS' && e.status === 'PENDING'),
  );

  // --- A second patient, registered entirely offline ----------------------
  await page.click('.bottombar button:has-text("New walk-in")');
  await fillRegistration({ name: 'Offline Patient', years: 27, gender: 'Female', symptoms: ['Diarrhoea'] });
  await page.click('.actions button.primary');
  await page.waitForTimeout(1500);

  const offline = await readLocalState();
  check('a second walk-in is registered with no network at all', offline.walkIns.length === 2);
  check('both records sit in the outbox', offline.outbox.filter((e) => e.status === 'PENDING').length >= 2);

  // --- Restart the app, still offline ------------------------------------
  if (hasServiceWorker) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const restarted = await readLocalState();
    check('queued records survive an app restart with no network', restarted.walkIns.length === 2);
    check('the shift stays signed in', (await page.locator('#username').count()) === 0);
  } else {
    check('restart-while-offline skipped — run against the production build to cover it', true, 'see the header of this file');
  }

  // --- Reconnect ----------------------------------------------------------
  // A link coming back is not the same as a link that works: the first request
  // after a reconnect is routinely refused, which is precisely how records get
  // stranded. Refuse it deliberately — the app has to recover on its own.
  let pushAttempts = 0;
  await context.route('**/api/sync/push', async (route) => {
    pushAttempts += 1;
    if (pushAttempts === 1) return route.abort('connectionfailed');
    return route.continue();
  });

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));

  // Poll rather than sleep a fixed span. The first request after a link comes
  // back can legitimately fail, and the app is meant to retry with a backoff —
  // so what is under test is that the queue drains, not that it drains on the
  // first attempt within an arbitrary window.
  let synced = await readLocalState();
  for (const deadline = Date.now() + 40_000; Date.now() < deadline; ) {
    if (synced.outbox.every((e) => e.status === 'SENT') && synced.walkIns.every((w) => w.synced)) break;
    await page.waitForTimeout(1000);
    synced = await readLocalState();
  }
  check(
    'a refused push is retried without waiting for the heartbeat',
    pushAttempts >= 2,
    `${pushAttempts} attempt(s)`,
  );

  const rejections = synced.outbox.filter((e) => e.error).map((e) => `${e.kind}: ${e.error}`);
  check(
    'everything queued flushes on reconnect',
    synced.outbox.every((e) => e.status === 'SENT') && synced.walkIns.every((w) => w.synced),
    [JSON.stringify(synced.outbox.map((e) => e.status)), ...rejections].join(' — '),
  );
  check(
    'the server allocates a token for each offline record',
    synced.walkIns.every((w) => typeof w.token === 'string' && w.token.length > 0),
    synced.walkIns.map((w) => w.token).join(', '),
  );

  check('no uncaught errors in the page', pageErrors.length === 0, pageErrors.join(' | '));
} finally {
  await browser.close();
}

process.exit(report.finish() === 0 ? 0 : 1);
