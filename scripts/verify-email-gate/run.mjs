/**
 * E2E proof for the email-verification gate. Runs INSIDE
 * `firebase emulators:exec` so Auth + Firestore emulators are up (with
 * firestore.rules loaded) and torn down automatically:
 *
 *   firebase emulators:exec --only auth,firestore --project inner-ops-8ce36 \
 *     "node scripts/verify-email-gate/run.mjs"
 *
 * Checks, each reported as a binary PASS/FAIL:
 *   1. New signup lands on the verification-pending screen, not the app.
 *   2. Direct URL navigation to a protected route while unverified stays gated.
 *   3. Clicking the emailed link (auth-emulator oobLink), then "I've verified",
 *      grants access.
 *   4. Firestore write with an unverified token is rejected by the rules;
 *      the same write succeeds after verification + token refresh.
 *   5. Resend cooldown blocks a second send within 60 seconds.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
// Not 5173: a normal `npm run dev` (real Firebase project) may be running.
// This harness must only ever drive the emulator-mode instance.
const PORT = '5175';
const BASE_URL = `http://127.0.0.1:${PORT}`;
const AUTH_EMULATOR = 'http://127.0.0.1:9099';
const PROJECT_ID = 'inner-ops-8ce36';

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const results = [];
function report(name, pass, detail = '') {
  results.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

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

async function fetchOobCodes(email) {
  const res = await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/${PROJECT_ID}/oobCodes`);
  const body = await res.json();
  return (body.oobCodes || []).filter(
    (c) => c.email === email && c.requestType === 'VERIFY_EMAIL',
  );
}

const GATE_HEADING = 'Verify your email.';

async function gateVisible(page) {
  return page
    .getByRole('heading', { name: GATE_HEADING })
    .isVisible()
    .catch(() => false);
}

// ── Test 4: rules boundary with REAL emulator tokens (client SDK in node) ──
async function testRulesBoundary() {
  const { initializeApp } = await import('firebase/app');
  const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } = await import('firebase/auth');
  const { getFirestore, connectFirestoreEmulator, doc, setDoc } = await import('firebase/firestore');

  const app = initializeApp({ apiKey: 'fake-emulator-key', projectId: PROJECT_ID }, 'rules-probe');
  const auth = getAuth(app);
  connectAuthEmulator(auth, AUTH_EMULATOR, { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);

  const email = 'rules-probe@gate.test';
  const cred = await createUserWithEmailAndPassword(auth, email, 'probe-pass-1');
  const uid = cred.user.uid;
  const { sendEmailVerification } = await import('firebase/auth');
  await sendEmailVerification(cred.user);

  let unverifiedDenied = false;
  let denialCode = '';
  try {
    await setDoc(doc(db, 'journalEntries', 'probe-unverified'), {
      userId: uid, content: 'should be rejected', createdAt: new Date().toISOString(),
    });
  } catch (err) {
    denialCode = err?.code || String(err);
    unverifiedDenied = denialCode === 'permission-denied';
  }
  report(
    '4. Firestore write with unverified token rejected by rules',
    unverifiedDenied,
    denialCode ? `error code: ${denialCode}` : 'write unexpectedly succeeded',
  );

  // Verify via the emulator's oobLink, refresh the token, prove the same
  // write now succeeds (the deny above is the boundary, not a broken app).
  const codes = await fetchOobCodes(email);
  if (!codes.length) throw new Error('no VERIFY_EMAIL oobCode for rules probe');
  await fetch(codes[codes.length - 1].oobLink);
  await cred.user.reload();
  await cred.user.getIdToken(true);
  let verifiedAllowed = false;
  try {
    await setDoc(doc(db, 'journalEntries', 'probe-verified'), {
      userId: uid, content: 'allowed after verification', createdAt: new Date().toISOString(),
    });
    verifiedAllowed = true;
  } catch { /* leave false */ }
  report('4b. Same write succeeds after verification + token refresh', verifiedAllowed);
}

// ── Tests 1, 2, 3, 5: real UI through the browser ──
async function testUiFlow() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const email = 'gate-e2e@gate.test';
  const password = 'gate-pass-1';

  try {
    await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
    // First arrival shows the BriefingScreen intro before the form. Loop until
    // the form is up, clicking "Enter" whenever the intro is what's showing.
    const emailInput = page.locator('input[type="email"]').first();
    const deadline = Date.now() + 30000;
    while (!(await emailInput.isVisible().catch(() => false))) {
      if (Date.now() > deadline) throw new Error('auth form never appeared');
      const enter = page.getByRole('button', { name: 'Enter', exact: true });
      if (await enter.isVisible().catch(() => false)) {
        await enter.click().catch(() => {});
      }
      await page.waitForTimeout(500);
    }

    // Switch to registration and sign up.
    await page.locator('button[type="button"]', { hasText: 'Create Account' }).first().click();
    await emailInput.fill(email);
    await page.locator('input[name="displayName"]').fill('Gate Probe');
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="confirmPassword"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // Test 1 — pending screen, not the app.
    await page
      .getByRole('heading', { name: GATE_HEADING })
      .waitFor({ timeout: 20000 })
      .catch(() => {});
    const onGate = await gateVisible(page);
    const emailShown = await page.getByText(email).isVisible().catch(() => false);
    report(
      '1. New signup lands on verification-pending screen, not the app',
      onGate && emailShown,
      onGate ? `gate shown, email displayed: ${emailShown}` : 'gate heading not found',
    );

    // Test 2 — direct navigation to a protected route stays gated.
    await page.goto(`${BASE_URL}/journal`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const gatedOnDirectNav = await gateVisible(page);
    const journalLeaked = await page
      .getByText(/journal/i)
      .first()
      .isVisible()
      .catch(() => false);
    report(
      '2. Direct URL to protected route while unverified stays gated',
      gatedOnDirectNav && !journalLeaked,
      `gate visible: ${gatedOnDirectNav}, journal UI leaked: ${journalLeaked}`,
    );

    // Test 5 — resend cooldown. Signup already sent one email; click Resend,
    // then confirm the button locks and a second click cannot send again.
    const before = (await fetchOobCodes(email)).length;
    const resend = page.getByRole('button', { name: 'Resend email' });
    await resend.click();
    await page.getByRole('button', { name: /Resend in \d+s/ }).waitFor({ timeout: 5000 });
    const afterFirst = (await fetchOobCodes(email)).length;
    const cooldownButton = page.getByRole('button', { name: /Resend in \d+s/ });
    const disabled = await cooldownButton.isDisabled();
    // Force-dispatch a click on the disabled button anyway — must not send.
    await cooldownButton.dispatchEvent('click');
    await page.waitForTimeout(1000);
    const afterSecond = (await fetchOobCodes(email)).length;
    report(
      '5. Resend cooldown blocks a second send within 60 seconds',
      afterFirst === before + 1 && disabled && afterSecond === afterFirst,
      `sends: ${before} → ${afterFirst} → ${afterSecond}; button disabled during cooldown: ${disabled}`,
    );

    // Test 3 — click the emailed link (emulator oobLink), then "I've verified".
    const codes = await fetchOobCodes(email);
    await fetch(codes[codes.length - 1].oobLink);
    await page.getByRole('button', { name: "I've verified" }).click();
    await page
      .waitForFunction(
        (heading) => !document.body.innerText.includes(heading),
        GATE_HEADING,
        { timeout: 20000 },
      )
      .catch(() => {});
    await page.waitForTimeout(1500);
    const gateGone = !(await gateVisible(page));
    const url = page.url();
    const inApp = /\/(onboarding|dashboard)/.test(url);
    report(
      "3. Emailed link + \"I've verified\" grants access",
      gateGone && inApp,
      `gate gone: ${gateGone}, landed on: ${url}`,
    );
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('→ booting vite (mode=emulator)');
  const vite = spawn(npx, ['vite', '--mode', 'emulator', '--port', PORT, '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: 'inherit', shell: true,
  });

  try {
    await waitForServer(BASE_URL);
    await testUiFlow();
    await testRulesBoundary();
  } finally {
    // shell:true on Windows leaves grandchildren alive on .kill() — kill the
    // whole tree so emulators:exec is not held open by an orphaned Vite.
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    } else {
      vite.kill('SIGTERM');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  // Explicit exit: the rules-probe Firebase client keeps gRPC/auth handles
  // open, so the event loop never drains on its own.
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
