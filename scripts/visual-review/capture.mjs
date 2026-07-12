// Visual-review screenshot harness.
// Drives the running dev server (Vite in --mode emulator) with Playwright,
// signs in through the real Auth UI against the Auth emulator, and captures
// each core route at mobile + desktop widths. Populated vs empty is chosen by
// which seeded account is passed in (OPERATOR = seeded, EMPTY = fresh).
//
// Prereqs (handled by run.mjs): emulators up, data seeded, dev server on BASE_URL.
//
// Usage: node scripts/visual-review/capture.mjs <email> <password> <label>
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const BASE_URL = process.env.VR_BASE_URL || 'http://127.0.0.1:5173';
const [, , EMAIL, PASSWORD, LABEL = 'populated'] = process.argv;

if (!EMAIL || !PASSWORD) {
  console.error('usage: node capture.mjs <email> <password> <label>');
  process.exit(1);
}

const OUT_DIR = process.env.VR_OUT_DIR
  || join(dirname(fileURLToPath(import.meta.url)), 'shots');
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
];

// Route → post-navigation settle. Kept generous; the app uses realtime
// Firestore listeners so content can arrive a beat after load.
const ROUTES = [
  { path: '/dashboard', name: 'dashboard' },
  { path: '/synthesis', name: 'synthesis' },
  { path: '/journal', name: 'journal' },
  { path: '/ledger', name: 'ledger' },
  { path: '/hardlessons', name: 'hardlessons' },
  { path: '/relapse', name: 'signal' },
  { path: '/settings', name: 'settings' },
  { path: '/profile', name: 'profile' },
];

async function settle(page, ms = 1200) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

async function signIn(page, captureForm = false, vpName = '') {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await settle(page, 800);
  // First arrival shows the BriefingScreen intro (primary button "Enter") and
  // only reveals the auth form after it. Click through if the form isn't up.
  const email = page.locator('input[type="email"]').first();
  if (!(await email.isVisible().catch(() => false))) {
    const enter = page.getByRole('button', { name: 'Enter', exact: true });
    if (await enter.count()) await enter.first().click().catch(() => {});
    await settle(page, 600);
  }
  await email.waitFor({ timeout: 15000 });
  if (captureForm) {
    await page.screenshot({ path: join(OUT_DIR, `${vpName}-auth-form.png`), fullPage: true });
  }
  // Force sign-in mode (the mode pill is a type="button"; submit shares the
  // "Sign In" label, so disambiguate on type to avoid strict-mode ambiguity).
  const signInPill = page.locator('button[type="button"]', { hasText: 'Sign In' }).first();
  if (await signInPill.count()) await signInPill.click().catch(() => {});
  const pass = page.locator('input[type="password"]').first();
  await email.fill(EMAIL);
  await pass.fill(PASSWORD);
  // Submit via the form's submit button, falling back to Enter.
  const submit = page.locator('button[type="submit"]').first();
  if (await submit.count()) {
    await submit.click();
  } else {
    await pass.press('Enter');
  }
  // Land on an authed route.
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20000 }).catch(() => {});
  await settle(page);
}

async function run() {
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 2,
        colorScheme: 'dark',
      });
      const page = await context.newPage();

      // Auth surfaces (only on the populated pass — identical across accounts).
      // Intro (BriefingScreen) first, then the form is captured inside signIn.
      const capAuth = LABEL === 'populated';
      if (capAuth) {
        await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
        await settle(page, 800);
        await page.screenshot({ path: join(OUT_DIR, `${vp.name}-auth-intro.png`), fullPage: true });
      }

      await signIn(page, capAuth, vp.name);

      for (const route of ROUTES) {
        await page.goto(`${BASE_URL}${route.path}`, { waitUntil: 'domcontentloaded' });
        await settle(page);
        const file = `${vp.name}-${route.name}-${LABEL}.png`;
        await page.screenshot({ path: join(OUT_DIR, file), fullPage: true });
        console.log(`captured ${file}`);
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
