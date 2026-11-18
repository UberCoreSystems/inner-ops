/**
 * E2E proof for account deletion. Runs INSIDE `firebase emulators:exec` so the
 * Auth + Firestore emulators are up and torn down automatically:
 *
 *   firebase emulators:exec --only auth,firestore --project inner-ops-8ce36 \
 *     "node scripts/verify-account-deletion/run.mjs"
 *
 * Cloud Functions are not emulated. The browser's deleteUserData request is
 * intercepted and answered by the real handler from functions/index.js, run in
 * this process against the emulators, so the profile deletion the app reacts
 * to is the real one. The response is held until the test releases it, which
 * exposes the window that matters: server finished, client not yet told.
 *
 * Nothing here can reach production: Vite is forced into emulator mode, the
 * Admin SDK is refused unless both emulator hosts are loopback, and every
 * non-loopback browser request is aborted.
 *
 * Scenarios, each at 390px and 1280px, each check reported PASS/FAIL:
 *   A. A wrong password erases nothing; then the erasure succeeds.
 *   B. The server errors with nothing erased; the retry succeeds.
 *   C. The erasure completes but the response is lost.
 *
 * Set SHOTS_DIR to capture a screenshot of each state.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
// Not 5173 (a normal `npm run dev` against the real project) or 5175 (the
// email-gate harness).
const PORT = '5176';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PROJECT_ID = 'inner-ops-8ce36';
const PASSWORD = 'erase-pass-1';
const SHOTS_DIR = process.env.SHOTS_DIR || null;

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

const HEADINGS = {
  briefing: 'This is your inner command center.',
  erasing: 'Erasing your account.',
  erased: 'Account erased.',
  failed: 'Erasure not confirmed.',
};

const isLoopbackHost = (host) => /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host || '');

for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!isLoopbackHost(process.env[name])) {
    console.error(`${name} is not a loopback emulator host. Run this inside firebase emulators:exec.`);
    process.exit(1);
  }
}
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || PROJECT_ID;

// Reuse the Admin SDK and the real handler from the Cloud Functions package.
const require = createRequire(new URL('../../functions/package.json', import.meta.url));
const fns = require('./index.js');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const db = getFirestore();
const adminAuth = getAuth();

const OTHER_USER = 'erase-proof-other-user';
const otherUserDoc = db.collection('journalEntries').doc('erase-proof-other-entry');

const results = [];
function report(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

const isoDaysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`dev server never came up at ${url}`);
}

// A verified, onboarded account with known counts: 2 journal entries, 1 kill
// target, 1 settings doc, 1 profile. Today's briefing keeps the synthesis
// auto-generator idle.
async function seedAccount(email) {
  const { uid } = await adminAuth.createUser({ email, password: PASSWORD, emailVerified: true });
  const owned = (name, data) => db.collection(name).add({ userId: uid, ...data });

  await db.collection('userProfiles').doc(uid).set({
    onboardingCompletedAt: isoDaysAgo(30),
    onboardingSkipped: false,
    primaryDriver: 'discipline',
    feedbackStyle: 'direct',
    focusStatement: 'Become someone who keeps his word to himself.',
    updatedAt: isoDaysAgo(2),
  });
  for (const daysAgo of [1, 0]) {
    await owned('journalEntries', {
      content: `Seeded entry, ${daysAgo} days back.`,
      mood: 'steady',
      intensity: 3,
      classification: { status: 'empty' },
      timestamp: Timestamp.fromDate(new Date(Date.now() - daysAgo * 86400000)),
      createdAt: isoDaysAgo(daysAgo),
    });
  }
  await owned('killTargets', {
    title: 'Doomscrolling after 10pm',
    description: 'The nightly avoidance loop.',
    category: 'bad-habit',
    status: 'active',
    streak: 1,
    longestStreak: 1,
    totalTrackedDays: 5,
    consecutiveDaysRequired: 30,
    escapeData: [],
    targetDate: isoDaysAgo(0).slice(0, 10),
    checkIns: [],
    lastCheckIn: null,
    implementationIntention: { trigger: '', response: '' },
    reflectionNotes: '',
    createdAt: isoDaysAgo(5),
    lastUpdated: isoDaysAgo(1),
  });
  await owned('userSettings', { notificationPreferences: {}, bannerDismissals: {} });
  await owned('syntheses', {
    generatedAt: isoDaysAgo(0),
    cadencePeriod: 'weekly',
    isNew: false,
    readAt: isoDaysAgo(0),
    convergencePoint: 'Seeded briefing.',
    violatedRules: [],
    signalDelta: 'steady',
    signalDeltaNote: '',
    confrontationQuestion: 'Seeded question?',
    meta: {},
    timestamp: Timestamp.now(),
    createdAt: isoDaysAgo(0),
  });
  return uid;
}

// Everything the server still holds for the account. Empty means fully erased.
async function serverResidue(uid, email) {
  const residue = [];
  try {
    await adminAuth.getUserByEmail(email);
    residue.push('auth record');
  } catch (err) {
    if (err?.code !== 'auth/user-not-found') throw err;
  }
  for (const name of fns.USER_DATA_COLLECTIONS) {
    const snap = await db.collection(name).where('userId', '==', uid).limit(1).get();
    if (!snap.empty) residue.push(name);
  }
  if ((await db.collection('userProfiles').doc(uid).get()).exists) residue.push('userProfiles');
  const memory = await db.collection('users').doc(uid).collection('memory').limit(1).get();
  if (!memory.empty) residue.push('memory');
  return residue;
}

async function openSession(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const blockedHosts = new Set();
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (!url.protocol.startsWith('http') || isLoopbackHost(url.host)) return route.continue();
    blockedHosts.add(url.hostname);
    return route.abort();
  });
  const page = await context.newPage();
  const paths = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) paths.push(new URL(frame.url()).pathname);
  });
  return { context, page, blockedHosts, paths };
}

// Answers the callable with the real handler. Each expected call is armed
// with what the server does (`erase`) and how the response ends (`respond`).
async function interceptErasure(page) {
  const calls = [];
  let armed = null;
  await page.route('**/deleteUserData', async (route) => {
    const step = armed;
    armed = null;
    const token = (route.request().headers().authorization || '').replace(/^Bearer /, '');
    let claims = {};
    try {
      claims = JSON.parse(Buffer.from(token.split('.')[1] || '', 'base64url').toString());
    } catch { /* no token: handled below as an unexpected call */ }
    const call = { uid: claims.user_id || null, result: null, expected: Boolean(step) };
    calls.push(call);
    if (!step || !call.uid) return route.abort('failed');

    if (step.erase) {
      call.result = await fns.deleteUserData.run({ auth: { uid: call.uid, token: claims }, data: null });
    }
    step.handled.resolve();
    await step.release.promise;

    if (step.respond === 'abort') return route.abort('failed');
    if (step.respond === 'error') {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { message: 'Account deletion failed partway through. Please try again.', status: 'INTERNAL' },
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ result: call.result }),
    });
  });
  return {
    calls,
    arm(step) {
      armed = { ...step, handled: deferred(), release: deferred() };
      return armed;
    },
  };
}

async function signIn(page, email) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  const emailInput = page.locator('input[type="email"]').first();
  const deadline = Date.now() + 45000;
  while (!(await emailInput.isVisible().catch(() => false))) {
    if (Date.now() > deadline) throw new Error('auth form never appeared');
    const enter = page.getByRole('button', { name: 'Enter', exact: true });
    if (await enter.isVisible().catch(() => false)) await enter.click().catch(() => {});
    await page.waitForTimeout(300);
  }
  const signInPill = page.locator('button[type="button"]', { hasText: 'Sign In' }).first();
  if (await signInPill.count()) await signInPill.click().catch(() => {});
  await emailInput.fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard/, { timeout: 30000 });
}

async function requestDeletion(page, password = PASSWORD) {
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  const open = page.getByRole('button', { name: 'Delete account', exact: true });
  await open.waitFor({ timeout: 30000 });
  await open.click();
  await page.locator('#delete-confirm-password').fill(password);
  await page.getByRole('button', { name: 'Permanently delete', exact: true }).click();
}

// The password is the only guard on an irreversible action.
async function checkWrongPassword(s) {
  const { page } = s.session;
  await requestDeletion(page, 'not-the-password');
  const refused = await page.getByText('Incorrect password.').first()
    .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const surface = await headingVisible(page, HEADINGS.erasing);
  const accountIntact = (await serverResidue(s.uid, s.email)).includes('auth record');
  report(`${s.tag} a wrong password erases nothing`,
    refused && !surface && s.erasure.calls.length === 0 && accountIntact,
    `refused: ${refused}; erasure surface: ${surface}; calls: ${s.erasure.calls.length}; account exists: ${accountIntact}`);
}

const headingVisible = (page, name, timeout = 0) => {
  const heading = page.getByRole('heading', { name, exact: true });
  if (!timeout) return heading.isVisible().catch(() => false);
  return heading.waitFor({ timeout }).then(() => true).catch(() => false);
};

const hasStoredSession = (page) => page.evaluate(async () => {
  const isSessionKey = (key) => String(key).startsWith('firebase:authUser:');
  if (Object.keys(localStorage).some(isSessionKey)) return true;
  return new Promise((resolve) => {
    const open = indexedDB.open('firebaseLocalStorageDb');
    open.onerror = () => resolve(false);
    // The database did not exist; do not create it.
    open.onupgradeneeded = () => open.transaction.abort();
    open.onsuccess = () => {
      const idb = open.result;
      if (!idb.objectStoreNames.contains('firebaseLocalStorage')) {
        idb.close();
        resolve(false);
        return;
      }
      const req = idb.transaction('firebaseLocalStorage', 'readonly')
        .objectStore('firebaseLocalStorage')
        .getAllKeys();
      req.onsuccess = () => { idb.close(); resolve(req.result.some(isSessionKey)); };
      req.onerror = () => { idb.close(); resolve(false); };
    };
  });
});

const receiptRows = (page) => page.locator('ul > li').evaluateAll((items) =>
  items.map((li) => {
    const [label, count] = li.querySelectorAll('span');
    return { label: label?.textContent?.trim(), count: Number(count?.textContent) };
  }));

const noHorizontalOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

async function shot(page, tag, stage) {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.screenshot({ path: join(SHOTS_DIR, `${tag}-${stage}.png`), fullPage: true });
}

// While the server has finished and the response is still held: the app must
// be on the erasure surface, never on the first-run briefing.
async function checkHeldWindow(session, tag) {
  const { page, paths } = session;
  // Let the profile deletion reach the browser's listeners.
  await page.waitForTimeout(2000);
  await shot(page, tag, 'held');
  const briefing = await headingVisible(page, HEADINGS.briefing);
  const onOnboarding = paths.includes('/onboarding') || new URL(page.url()).pathname === '/onboarding';
  report(
    `${tag} never lands on the onboarding briefing`,
    !onOnboarding && !briefing,
    `path trace: ${[...new Set(paths)].join(' → ')}; briefing visible: ${briefing}`,
  );
  const erasing = await headingVisible(page, HEADINGS.erasing);
  const navCount = await page.locator('nav').count();
  report(
    `${tag} shows the erasure surface with the app unreachable`,
    erasing && navCount === 0,
    `"${HEADINGS.erasing}" visible: ${erasing}; nav elements: ${navCount}`,
  );
}

// After the erased screen: session closed, sign-in page, nothing left server-side.
async function checkEndState(session, tag, { uid, email }) {
  const { page } = session;
  const sessionBeforeDone = await hasStoredSession(page);
  report(`${tag} session is closed while the receipt is on screen`, !sessionBeforeDone,
    `stored session present: ${sessionBeforeDone}`);

  const overflowOk = await noHorizontalOverflow(page);
  report(`${tag} erased screen fits the viewport width`, overflowOk);

  await page.getByRole('button', { name: 'Done', exact: true }).click({ timeout: 5000 }).catch(() => {});
  const formVisible = await page.locator('input[type="email"]').first()
    .waitFor({ timeout: 15000 }).then(() => true).catch(() => false);
  const landed = new URL(page.url()).pathname;
  report(`${tag} Done lands on the sign-in form`, landed === '/auth' && formVisible,
    `landed on ${landed}; sign-in form visible: ${formVisible}`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').first().waitFor({ timeout: 15000 }).catch(() => {});
  const afterReload = new URL(page.url()).pathname;
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/auth$/, { timeout: 15000 }).catch(() => {});
  const afterProtected = new URL(page.url()).pathname;
  report(`${tag} stays signed out on reload and on a protected route`,
    afterReload === '/auth' && afterProtected === '/auth',
    `after reload: ${afterReload}; after /settings: ${afterProtected}`);

  const residue = await serverResidue(uid, email);
  // Catch anything a still-running client wrote after the erasure.
  await new Promise((r) => setTimeout(r, 2000));
  const lateResidue = await serverResidue(uid, email);
  const otherSurvives = (await otherUserDoc.get()).exists;
  report(`${tag} nothing of the account remains server-side`,
    residue.length === 0 && lateResidue.length === 0 && otherSurvives,
    `residue: [${residue.join(', ')}]; 2s later: [${lateResidue.join(', ')}]; other user's doc intact: ${otherSurvives}`);
}

async function startScenario(browser, viewport, letter) {
  const tag = `${letter} ${viewport.name}`;
  const email = `erase-${letter.toLowerCase()}-${viewport.name}@erase.test`;
  const uid = await seedAccount(email);
  const session = await openSession(browser, viewport);
  await signIn(session.page, email);
  const productionHosts = [...session.blockedHosts]
    .filter((host) => /(identitytoolkit|securetoken|firestore)\.googleapis\.com$/.test(host));
  if (productionHosts.length) {
    throw new Error(`app is not in emulator mode; blocked ${productionHosts.join(', ')}`);
  }
  const erasure = await interceptErasure(session.page);
  return { tag, email, uid, session, erasure };
}

async function scenarioSuccess(browser, viewport) {
  const s = await startScenario(browser, viewport, 'A');
  const { tag, session, erasure } = s;
  const { page } = session;
  try {
    await checkWrongPassword(s);

    const step = erasure.arm({ erase: true, respond: 'ok' });
    session.paths.length = 0;
    await requestDeletion(page);
    await step.handled.promise;
    await checkHeldWindow(session, tag);
    step.release.resolve();

    const erased = await headingVisible(page, HEADINGS.erased, 15000);
    await shot(page, tag, 'erased');
    const call = erasure.calls[0];
    report(`${tag} reaches the erased screen after one call for the right account`,
      erased && erasure.calls.length === 1 && call?.uid === s.uid,
      `"${HEADINGS.erased}" visible: ${erased}; calls: ${erasure.calls.length}`);
    if (!erased) return;

    const manifest = call.result?.manifest || {};
    const expected = Object.values(manifest).filter((v) => typeof v === 'number' && v > 0);
    const rows = await receiptRows(page);
    const count = (label) => rows.find((r) => r.label === label)?.count;
    const sum = (list) => list.reduce((a, b) => a + b, 0);
    report(`${tag} receipt lists what the server removed`,
      rows.length === expected.length
        && sum(rows.map((r) => r.count)) === sum(expected)
        && count('Journal entries') === 2
        && count('Kill targets') === 1
        && count('Profile record') === 1,
      `rows: ${rows.map((r) => `${r.label} ${r.count}`).join(', ')}`);

    await checkEndState(session, tag, s);
  } finally {
    await session.context.close();
  }
}

async function scenarioRetry(browser, viewport) {
  const s = await startScenario(browser, viewport, 'B');
  const { tag, session, erasure } = s;
  const { page } = session;
  try {
    const first = erasure.arm({ erase: false, respond: 'error' });
    session.paths.length = 0;
    await requestDeletion(page);
    await first.handled.promise;
    first.release.resolve();

    const failed = await headingVisible(page, HEADINGS.failed, 15000);
    await shot(page, tag, 'failed');
    const retry = page.getByRole('button', { name: 'Run erasure again', exact: true });
    const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
    const controls = (await retry.isVisible().catch(() => false)) && (await signOut.isVisible().catch(() => false));
    const navCount = await page.locator('nav').count();
    report(`${tag} a server error shows the failed state, not the app`,
      failed && controls && navCount === 0 && !session.paths.includes('/onboarding'),
      `"${HEADINGS.failed}" visible: ${failed}; both buttons: ${controls}; nav elements: ${navCount}`);
    if (!failed) return;

    const accountIntact = (await serverResidue(s.uid, s.email)).includes('auth record')
      && (await db.collection('userProfiles').doc(s.uid).get()).exists;
    const sessionIntact = await hasStoredSession(page);
    report(`${tag} a failed erasure leaves the account and session intact`,
      accountIntact && sessionIntact,
      `account and profile exist: ${accountIntact}; session present: ${sessionIntact}`);

    const second = erasure.arm({ erase: true, respond: 'ok' });
    second.release.resolve();
    await retry.click();
    const erased = await headingVisible(page, HEADINGS.erased, 15000);
    await shot(page, tag, 'erased-after-retry');
    const rows = await receiptRows(page);
    report(`${tag} the retry needs no password and ends erased, without itemized counts`,
      erased && erasure.calls.length === 2 && rows.length === 0,
      `"${HEADINGS.erased}" visible: ${erased}; calls: ${erasure.calls.length}; receipt rows: ${rows.length}`);
    if (!erased) return;

    await checkEndState(session, tag, s);
  } finally {
    await session.context.close();
  }
}

async function scenarioLostResponse(browser, viewport) {
  const s = await startScenario(browser, viewport, 'C');
  const { tag, session, erasure } = s;
  const { page } = session;
  try {
    const step = erasure.arm({ erase: true, respond: 'abort' });
    session.paths.length = 0;
    await requestDeletion(page);
    await step.handled.promise;
    step.release.resolve();

    const erased = await headingVisible(page, HEADINGS.erased, 15000);
    await shot(page, tag, 'erased-lost-response');
    const failedShown = await headingVisible(page, HEADINGS.failed);
    const rows = await receiptRows(page);
    report(`${tag} a lost response still ends erased, without itemized counts`,
      erased && !failedShown && erasure.calls.length === 1 && rows.length === 0
        && !session.paths.includes('/onboarding'),
      `"${HEADINGS.erased}" visible: ${erased}; failed state: ${failedShown}; calls: ${erasure.calls.length}; receipt rows: ${rows.length}`);
    if (!erased) return;

    await checkEndState(session, tag, s);
  } finally {
    await session.context.close();
  }
}

async function main() {
  await otherUserDoc.set({
    userId: OTHER_USER,
    content: 'Belongs to someone else.',
    timestamp: Timestamp.now(),
    createdAt: new Date().toISOString(),
  });

  console.log('→ booting vite (emulator mode forced)');
  const vite = spawn(
    process.execPath,
    [join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'),
      '--mode', 'emulator', '--port', PORT, '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: ROOT,
      stdio: ['ignore', 'ignore', 'inherit'],
      // Process env outranks .env files: without this, a machine with no
      // .env.emulator would serve an app pointed at the real project.
      env: {
        ...process.env,
        VITE_USE_EMULATORS: 'true',
        VITE_POSTHOG_KEY: '',
        VITE_SENTRY_DSN: '',
        VITE_APPCHECK_SITE_KEY: '',
      },
    },
  );

  let browser;
  try {
    await waitForServer(BASE_URL);
    browser = await chromium.launch();
    for (const viewport of VIEWPORTS) {
      for (const scenario of [scenarioSuccess, scenarioRetry, scenarioLostResponse]) {
        try {
          await scenario(browser, viewport);
        } catch (err) {
          report(`${scenario.name} ${viewport.name} ran to completion`, false, err?.message || String(err));
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    vite.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 1000));
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  // Explicit exit: the Admin SDK keeps handles open.
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
