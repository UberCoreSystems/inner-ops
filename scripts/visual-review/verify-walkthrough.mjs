// Behavioural verification for the first-run walkthrough.
//
// Build and unit tests say nothing about whether a spotlight lands on the card
// it names, so this drives the real thing: real Auth emulator, real Firestore,
// real Vite build, real browser, real clicks.
//
// Runs on 5199 rather than Vite's default. A previous run on 5173 shadowed the
// developer's own dev server and made login look broken for reasons that had
// nothing to do with the code under test.
//
//   firebase emulators:exec --only auth,firestore --project inner-ops-8ce36 \
//     "node scripts/visual-review/verify-walkthrough.mjs"
import { chromium, webkit } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { seed, ACCOUNTS } from './seed.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const PORT = 5199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function waitForServer(url, timeoutMs = 40000) {
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

async function signIn(page, account) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const email = page.locator('input[type="email"]').first();
  if (!(await email.isVisible().catch(() => false))) {
    const enter = page.getByRole('button', { name: 'Enter', exact: true });
    if (await enter.count()) await enter.first().click().catch(() => {});
    await page.waitForTimeout(600);
  }
  await email.waitFor({ timeout: 15000 });
  const pill = page.locator('button[type="button"]', { hasText: 'Sign In' }).first();
  if (await pill.count()) await pill.click().catch(() => {});
  await email.fill(account.email);
  await page.locator('input[type="password"]').first().fill(account.password);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(/\/(dashboard|onboarding)/, { timeout: 20000 });
  await page.waitForTimeout(1500);
}

/** Clear help state so each scenario starts from a true first run. */
async function resetHelpState(page) {
  await page.evaluate(async () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('io_help_seen:'))
      .forEach((k) => localStorage.removeItem(k));
    const mod = await import('/src/utils/firebaseUtils.js');
    await mod.upsertUserSettingsFields({
      'onboardingHelp.modules': {},
      'onboardingHelp.walkthroughs': {},
    });
  });
}

/**
 * Behavioural scroll test. Asserting on `documentElement.style.overflow` would
 * only prove a property was set — and the overflow approach was abandoned
 * precisely because it looked correct while breaking hit-testing in WebKit.
 * Drive real wheel input and see whether the page actually moves.
 * @returns {Promise<boolean>} true if the viewport moved in either direction
 */
async function pageScrolls(page, viewportWidth = 1440, viewportHeight = 900) {
  await page.mouse.move(viewportWidth / 2, viewportHeight / 2);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(350);
  let now = await page.evaluate(() => window.scrollY);
  if (Math.abs(now - before) > 2) return true;
  // Might simply be at the end of the document; try the other direction.
  await page.mouse.wheel(0, -600);
  await page.waitForTimeout(350);
  now = await page.evaluate(() => window.scrollY);
  return Math.abs(now - before) > 2;
}

const launcher = (page) => page.getByRole('button', { name: 'Walk me through it' });
const ring = (page) => page.locator('[data-spotlight-ring]');
const caption = (page) => page.locator('[data-spotlight-caption]');

/** Geometric truth: does the cutout actually frame the element it names? */
async function ringCoversAnchor(page, selector) {
  return page.evaluate((sel) => {
    const r = document.querySelector('[data-spotlight-ring]')?.getBoundingClientRect();
    const t = document.querySelector(sel)?.getBoundingClientRect();
    if (!r || !t) return { ok: false, reason: 'missing element' };
    // The ring is inset 8px around the target on every side.
    const dx = Math.abs((r.left + 8) - t.left);
    const dy = Math.abs((r.top + 8) - t.top);
    const dw = Math.abs((r.width - 16) - t.width);
    return { ok: dx <= 2 && dy <= 2 && dw <= 2, reason: `dx=${dx.toFixed(1)} dy=${dy.toFixed(1)} dw=${dw.toFixed(1)}` };
  }, selector);
}

async function scenarioHappyPath(browser) {
  console.log('\n[1] Happy path — fresh account, all three steps');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  check('launcher card renders on first visit', await launcher(page).isVisible().catch(() => false));

  await launcher(page).click();
  await page.waitForTimeout(1500);

  const steps = [
    ['[data-tour="mirror"]', 'The Oracle reading'],
    ['[data-tour="quick-actions"]', 'The four modules'],
    ['[data-tour="stats"]', 'Your stats'],
  ];

  for (let i = 0; i < steps.length; i++) {
    const [selector, title] = steps[i];
    await ring(page).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(400);

    const titleText = await caption(page).locator('h2').textContent().catch(() => '');
    check(`step ${i + 1} caption is "${title}"`, titleText?.trim() === title, `got "${titleText?.trim()}"`);

    const cover = await ringCoversAnchor(page, selector);
    check(`step ${i + 1} spotlight frames ${selector}`, cover.ok, cover.reason);

    const indicator = await caption(page).getByText(/Step \d+ of \d+/).textContent().catch(() => '');
    check(`step ${i + 1} indicator reads "Step ${i + 1} of 3"`, indicator?.trim() === `Step ${i + 1} of 3`, `got "${indicator?.trim()}"`);

    // Scroll must be genuinely blocked while a step is displayed, and the
    // spotlight must still frame its anchor afterwards.
    check(`step ${i + 1} blocks wheel scroll`, !(await pageScrolls(page)));
    const stillAligned = await ringCoversAnchor(page, selector);
    check(`step ${i + 1} stays aligned after scroll attempt`, stillAligned.ok, stillAligned.reason);

    const isLast = i === steps.length - 1;
    const btn = caption(page).getByRole('button', { name: isLast ? 'Done' : 'Next' });
    check(`step ${i + 1} shows ${isLast ? '"Done"' : '"Next"'}`, await btn.isVisible().catch(() => false));
    await btn.click();
    await page.waitForTimeout(900);
  }

  check('tour closes after Done', !(await caption(page).isVisible().catch(() => false)));

  check('page scroll released after tour', await pageScrolls(page));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('launcher gone after reload (persisted)', !(await launcher(page).isVisible().catch(() => false)));

  await ctx.close();
}

async function scenarioEscape(browser) {
  console.log('\n[2] Escape exits, and the exit is permanent');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await launcher(page).click();
  await page.waitForTimeout(1500);
  check('tour open before Escape', await caption(page).isVisible().catch(() => false));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  check('Escape closes the tour', !(await caption(page).isVisible().catch(() => false)));
  check('scroll released after Escape', await pageScrolls(page));

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('skip is permanent across reload', !(await launcher(page).isVisible().catch(() => false)));

  await ctx.close();
}

async function scenarioDegraded(browser) {
  console.log('\n[3] Degradation — anchors removed before start');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Drop one anchor. The tour must renumber to the survivors, not claim three.
  await page.evaluate(() => document.querySelector('[data-tour="stats"]')?.removeAttribute('data-tour'));
  await launcher(page).click();
  await page.waitForTimeout(1500);

  const indicator = await caption(page).getByText(/Step \d+ of \d+/).textContent().catch(() => '');
  check('renumbers to "Step 1 of 2" with one anchor missing', indicator?.trim() === 'Step 1 of 2', `got "${indicator?.trim()}"`);

  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);

  // Now remove all three and confirm the plain-card fallback carries the copy.
  await resetHelpState(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.evaluate(() => {
    document.querySelectorAll('[data-tour]').forEach((el) => el.removeAttribute('data-tour'));
  });
  await launcher(page).click();
  await page.waitForTimeout(1500);

  const fallback = page.getByRole('dialog', { name: 'What is on this screen' });
  check('zero-resolve falls back to a plain card', await fallback.isVisible().catch(() => false));
  check('fallback has no spotlight ring', (await ring(page).count()) === 0);
  const body = await fallback.textContent().catch(() => '');
  check('fallback still carries all three lessons',
    ['Oracle reading', 'four modules', 'Your stats'].every((s) => body?.includes(s)));

  await fallback.getByRole('button', { name: 'Done' }).click();
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('fallback marks complete (does not retry forever)', !(await launcher(page).isVisible().catch(() => false)));

  await ctx.close();
}

async function scenarioReducedMotionMobile(browser) {
  console.log('\n[4] Reduced motion at 320px — completes, caption stays on screen');
  const ctx = await browser.newContext({
    viewport: { width: 320, height: 640 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await launcher(page).click();
  await page.waitForTimeout(1200);

  let stepsSeen = 0;
  for (let i = 0; i < 3; i++) {
    if (!(await caption(page).isVisible().catch(() => false))) break;
    stepsSeen++;

    const box = await caption(page).boundingBox();
    const inView = box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 320 && box.y + box.height <= 640;
    check(`step ${i + 1} caption fully within 320x640`, !!inView,
      box ? `x=${box.x.toFixed(0)} y=${box.y.toFixed(0)} w=${box.width.toFixed(0)} h=${box.height.toFixed(0)}` : 'no box');

    const btn = caption(page).getByRole('button', { name: i === 2 ? 'Done' : 'Next' });
    await btn.click();
    await page.waitForTimeout(700);
  }

  check('all three steps reachable under reduced motion', stepsSeen === 3, `saw ${stepsSeen}`);
  check('tour completed under reduced motion', !(await caption(page).isVisible().catch(() => false)));

  await ctx.close();
}

async function scenarioSettingsReplay(browser) {
  console.log('\n[5] Settings replay — restarts a completed walkthrough');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);

  // Leave it in the "already completed" state the replay button exists to undo.
  await page.evaluate(async () => {
    const mod = await import('/src/utils/onboardingHelp.js');
    const { getAuth } = await import('/src/firebase.js');
    const auth = await getAuth();
    mod.markWalkthrough(auth.currentUser.uid, 'dashboard', { status: 'completed' });
  });
  await page.waitForTimeout(1200);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('launcher hidden once completed', !(await launcher(page).isVisible().catch(() => false)));

  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const restart = page.getByRole('button', { name: 'Restart dashboard walkthrough' });
  check('Settings exposes the restart button', await restart.isVisible().catch(() => false));
  await restart.click();

  await page.waitForURL(/\/dashboard/, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  check('replay navigates to the dashboard and starts the tour',
    await caption(page).isVisible().catch(() => false));

  const intros = page.getByRole('button', { name: 'Show module intros again' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  check('Settings exposes the module-intro reset', await intros.isVisible().catch(() => false));

  await ctx.close();
}

/**
 * The dismiss race, and the reason userSettings was chosen over localStorage.
 *
 * Reload-5x catches an optimistic-update race where the panel returns because
 * the read settles after the first paint. The second half is the real test:
 * a FRESH browser context has no localStorage mirror, so if the dismissal
 * shows up there it can only have come from Firestore. That is the entire
 * justification for the storage decision — dismissing on a phone must dismiss
 * on a laptop — and it is the one thing a same-browser reload cannot prove,
 * because the mirror would mask a Firestore write that never landed.
 */
async function scenarioDismissRace(browser) {
  console.log('\n[6] Module intro dismissal — 5 reloads, then cross-device');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);

  await page.goto(`${BASE_URL}/journal`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // The example, not the definition: the definition now lives in the
  // permanent header, so matching on it would never report the card as gone.
  const INTRO_TEXT = 'Skipped the gym again';
  const intro = page.getByText(INTRO_TEXT);
  check('journal intro shows on first visit', await intro.isVisible().catch(() => false));

  // Scope the click to the intro card. The page carries other dismiss affordances
  // (BannerStack rows), so an unscoped "Dismiss" is ambiguous.
  const card = page.locator('.oura-card', { hasText: INTRO_TEXT }).first();
  const dismissCount = await page.getByRole('button', { name: 'Dismiss', exact: true }).count();
  await card.getByRole('button', { name: 'Dismiss', exact: true }).first().click();
  await page.waitForTimeout(1500);

  const gone = !(await intro.isVisible().catch(() => false));
  if (!gone) {
    // Distinguish "click missed" from "dismiss is broken".
    const diag = await page.evaluate(() => ({
      mirror: Object.entries(localStorage)
        .filter(([k]) => k.startsWith('io_help_seen:'))
        .map(([k, v]) => `${k}=${v}`),
    }));
    console.log(`     diag: dismissButtonsOnPage=${dismissCount} mirror=${JSON.stringify(diag.mirror)}`);
  }
  check('intro disappears on dismiss', gone);

  let reappeared = 0;
  for (let i = 0; i < 5; i++) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2200);
    if (await intro.isVisible().catch(() => false)) reappeared++;
  }
  check('intro stays dismissed across 5 reloads', reappeared === 0, `reappeared ${reappeared}/5`);

  // Fresh context: no localStorage mirror, so this reads Firestore or nothing.
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page2 = await ctx2.newPage();
  const mirrorEmpty = await page2.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('io_help_seen:')).length === 0
  ).catch(() => true);
  check('second context starts with no local mirror', mirrorEmpty);

  await signIn(page2, ACCOUNTS.empty);
  await page2.goto(`${BASE_URL}/journal`, { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(3000);
  const intro2 = page2.getByText('Skipped the gym again');
  check('dismissal carries cross-device (Firestore, not mirror)',
    !(await intro2.isVisible().catch(() => false)));

  await ctx2.close();
  await ctx.close();
}

/** Any visible failure toast. react-hot-toast renders into a live region. */
async function visibleErrorToast(page) {
  return page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('[role="status"], [role="alert"]'));
    return nodes
      .map((n) => n.textContent?.trim() || '')
      .filter((t) => t && /fail|error|could not|try again/i.test(t));
  });
}

/**
 * The day-one grace, in BOTH directions.
 *
 * Checking only that a brand-new account sees no staleness banner would also
 * pass if the trigger were simply broken, or if it had been silenced for all
 * zero-entry users — which the plan explicitly rejected, because that silences
 * it for exactly the person who most needs it. So the pair matters: inside the
 * window it must be quiet, outside it must still fire.
 */
async function scenarioStalenessGrace(browser) {
  console.log('\n[7] journalStaleness — quiet inside the grace window, firing outside it');
  const BANNER = /No entries yet/i;

  const ctxFresh = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const fresh = await ctxFresh.newPage();
  await signIn(fresh, ACCOUNTS.fresh);
  await fresh.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await fresh.waitForTimeout(3500);
  const freshHasBanner = await fresh.getByText(BANNER).isVisible().catch(() => false);
  check('onboarded 10m ago + zero entries → no staleness banner', !freshHasBanner);
  await ctxFresh.close();

  const ctxOld = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const old = await ctxOld.newPage();
  await signIn(old, ACCOUNTS.empty);
  await old.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await old.waitForTimeout(3500);
  const oldHasBanner = await old.getByText(BANNER).isVisible().catch(() => false);
  check('onboarded 30d ago + zero entries → staleness banner DOES fire', oldHasBanner,
    'grace must be a delay, not a permanent silence');
  await ctxOld.close();
}

/**
 * Write-failure path. Firestore traffic is blocked at the network layer and
 * STAYS blocked across the reload — if it were unblocked, the SDK would simply
 * replay the queued write and the test would pass without the mirror ever
 * being exercised.
 *
 * With the network down, readOnboardingHelp's remote read also fails, so the
 * only thing that can suppress the panel is the localStorage mirror. That is
 * precisely the guarantee being claimed: fail toward NOT re-showing.
 */
async function scenarioWriteFailure(browser) {
  console.log('\n[8] Write failure — mirror suppresses re-show, and nothing toasts');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);

  await page.goto(`${BASE_URL}/journal`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  // The example, not the definition: the definition now lives in the
  // permanent header, so matching on it would never report the card as gone.
  const INTRO_TEXT = 'Skipped the gym again';
  const intro = page.getByText(INTRO_TEXT);
  check('intro visible before write failure', await intro.isVisible().catch(() => false));

  // Kill Firestore only. Auth is on 9099 and must keep working. The predicate
  // is held in a const so unroute() can match the same reference later.
  const isFirestore = (url) => url.port === '8080';
  await ctx.route(isFirestore, (route) => route.abort('failed'));

  const card = page.locator('.oura-card', { hasText: INTRO_TEXT }).first();
  await card.getByRole('button', { name: 'Dismiss', exact: true }).first().click();
  await page.waitForTimeout(1500);

  check('panel disappears despite failed write', !(await intro.isVisible().catch(() => false)));

  const mirrorHasKey = await page.evaluate(() =>
    Object.entries(localStorage)
      .filter(([k]) => k.startsWith('io_help_seen:'))
      .some(([, v]) => { try { return !!JSON.parse(v)?.modules?.journal; } catch { return false; } })
  );
  check('mirror written synchronously despite failed write', mirrorHasKey);

  const toasts = await visibleErrorToast(page);
  check('no error toast on failed help write', toasts.length === 0, toasts.join(' | '));

  // Reload with Firestore STILL blocked: mirror is the only possible source.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  check('stays dismissed on reload with Firestore still down',
    !(await page.getByText(INTRO_TEXT).isVisible().catch(() => false)));

  await ctx.unroute(isFirestore).catch(() => {});
  await ctx.close();
}

/**
 * Reset must clear the mirror as well as Firestore. This is the failure the
 * plan called out by name: skip the mirror and the replay buttons appear to do
 * nothing, because the local record still says "seen".
 */
async function scenarioResetClearsMirror(browser) {
  console.log('\n[9] Reset clears BOTH stores — the replay button actually replays');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);

  // The example, not the definition: the definition now lives in the
  // permanent header, so matching on it would never report the card as gone.
  const INTRO_TEXT = 'Skipped the gym again';
  await page.goto(`${BASE_URL}/journal`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const card = page.locator('.oura-card', { hasText: INTRO_TEXT }).first();
  await card.getByRole('button', { name: 'Dismiss', exact: true }).first().click();
  await page.waitForTimeout(1500);
  check('intro dismissed before reset', !(await page.getByText(INTRO_TEXT).isVisible().catch(() => false)));

  const mirrorBefore = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith('io_help_seen:')).length);
  check('mirror holds the dismissal before reset', mirrorBefore > 0);

  await page.goto(`${BASE_URL}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Show module intros again' }).click();
  await page.waitForTimeout(2000);

  const mirrorAfter = await page.evaluate(() => {
    const entries = Object.entries(localStorage).filter(([k]) => k.startsWith('io_help_seen:'));
    return entries.every(([, v]) => { try { return !JSON.parse(v)?.modules?.journal; } catch { return true; } });
  });
  check('reset cleared the journal key from the mirror', mirrorAfter);

  await page.goto(`${BASE_URL}/journal`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  check('intro shows again after reset', await page.getByText(INTRO_TEXT).isVisible().catch(() => false));

  await ctx.close();
}

/**
 * `text` identifies the dismissible CARD and must therefore be the example,
 * not the definition: the definition now lives in the permanent page header,
 * so matching on it would find the header and report the card as visible
 * forever. `definition` is asserted separately, and must SURVIVE dismissal.
 */
const MODULES = [
  {
    id: 'journal', route: '/journal',
    text: 'Skipped the gym again',
    definition: 'Raw input. Everything the system knows about you starts here.',
  },
  {
    id: 'ledger', route: '/ledger',
    text: 'No phone in bed. Sixty consecutive days',
    definition: 'Contracts against the patterns costing you the most. One line each, held daily.',
  },
  {
    id: 'hardlessons', route: '/hardlessons',
    text: 'lost the contract by going quiet for three weeks',
    definition: 'A cost you already paid, converted into a rule you carry forward.',
  },
  {
    id: 'relapse', route: '/relapse',
    text: '11:40pm. Alone. Third night this week',
    definition: 'Where you log the slip and what preceded it. Drift is read from the pattern, not the incident.',
  },
  {
    id: 'synthesis', route: '/synthesis',
    text: 'Your ledger says the target is discipline',
    definition: 'Cross-module behavioral intelligence. What your own data reveals across domains.',
  },
];

async function scenarioAllModuleIntros(browser) {
  console.log('\n[10] All five modules — intro renders, dismisses, definition survives');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);

  for (const m of MODULES) {
    await page.goto(`${BASE_URL}${m.route}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2800);

    // The definition is permanent page furniture, so it must be present before
    // the card is dismissed and after — never only while the card is up.
    check(`${m.id}: definition present in header on first visit`,
      await page.getByText(m.definition).first().isVisible().catch(() => false));

    const intro = page.getByText(m.text);
    const visible = await intro.isVisible().catch(() => false);
    check(`${m.id}: intro renders on first visit`, visible);
    if (!visible) continue;

    // The card must not repeat the definition that is already overhead.
    const cardText = await page.locator('.oura-card', { hasText: m.text }).first().textContent().catch(() => '');
    check(`${m.id}: card does NOT repeat the definition`, !cardText?.includes(m.definition));

    // KillList's column is `flex flex-col` with explicit order-*, so an
    // unordered child lands ABOVE the page header. Every module is checked,
    // since the failure is silent and only visible as ordering.
    // Measured via bounding boxes rather than XPath: the example renders as
    // three text nodes (open quote, text, close quote), so `contains(text())`
    // only ever sees the opening quote.
    const cardBox = await page.locator('.oura-card', { hasText: m.text }).first().boundingBox();
    const headerBox = await page.locator('h1').first().boundingBox();
    check(`${m.id}: intro sits below the page header`,
      !!cardBox && !!headerBox && cardBox.y > headerBox.y,
      cardBox && headerBox ? `intro=${cardBox.y.toFixed(0)} header=${headerBox.y.toFixed(0)}` : 'could not measure');

    const card = page.locator('.oura-card', { hasText: m.text }).first();
    await card.getByRole('button', { name: 'Dismiss', exact: true }).first().click();
    await page.waitForTimeout(1200);
    check(`${m.id}: dismisses`, !(await page.getByText(m.text).isVisible().catch(() => false)));

    // The point of moving the definition into the header: dismissal is
    // permanent, so if the definition went with the card the user could never
    // look up what the module is again.
    check(`${m.id}: definition SURVIVES dismissal`,
      await page.getByText(m.definition).first().isVisible().catch(() => false));

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    check(`${m.id}: definition still there after reload`,
      await page.getByText(m.definition).first().isVisible().catch(() => false));
  }

  await ctx.close();
}

/**
 * The Record — the effort-weighted census inside the Oracle card. Uses the
 * seeded `operator` (populated) account, whose data the seed script gives a
 * known shape: 2 confirmed kills (one held ≥60d, both ≥21d) with one escape
 * autopsy, 1 written relapse analysis, 2 held rules, 2 deep journal entries,
 * 1 briefing, 1 reckoning (2 contradictions). The `empty` account must show
 * no record section at all.
 */
async function scenarioTheRecord(browser) {
  console.log('\n[12] The Record — effort-weighted census inside the Oracle card');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.operator);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  // The record is computed in the deferred pass (after two extra reads), so
  // give it room to settle beyond the critical render.
  await page.waitForTimeout(3500);

  const heading = page.getByRole('heading', { name: 'The Record', exact: true });
  await heading.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  check('record heading renders', await heading.isVisible().catch(() => false));

  // Structural: the record sits INSIDE the Oracle card (mirror anchor).
  const insideCard = await page.evaluate(() => {
    const card = document.querySelector('[data-tour="mirror"] .oura-card');
    if (!card) return false;
    const hs = Array.from(card.querySelectorAll('h2'));
    return hs.some((h) => h.textContent.trim() === 'The Record');
  });
  check('record renders inside the Oracle card', insideCard);

  check('shows the Execution group', await page.getByText('Execution', { exact: true }).isVisible().catch(() => false));
  check('shows the Intelligence group', await page.getByText('Intelligence', { exact: true }).isVisible().catch(() => false));

  const recordText = await page.evaluate(() => {
    const card = document.querySelector('[data-tour="mirror"] .oura-card');
    return card ? card.textContent : '';
  });
  const has = (s) => recordText.includes(s);
  check('Execution: kills held ≥60 days line', has('held ≥60 days'), `text=${recordText.slice(0, 0)}`);
  check('Execution: kills held ≥21 days line', has('held ≥21 days'));
  check('Execution: autopsies written line', has('autops'));
  check('Execution: rules held unbroken line', has('held unbroken'));
  check('Execution: deep journal entries line', has('at depth'));
  check('Intelligence: briefings generated line', has('briefing'));
  check('Intelligence: reckonings faced line', has('reckoning'));
  check('Intelligence: contradictions surfaced line', has('contradiction'));
  check('Intelligence: cadence line', has('since last briefing'));

  await ctx.close();

  // The empty account is truly cold → the record computes empty → renders null.
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
  const page2 = await ctx2.newPage();
  await signIn(page2, ACCOUNTS.empty);
  await page2.goto(`${BASE_URL}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page2.waitForTimeout(3500);
  check('no record section for a zero-data account',
    !(await page2.getByRole('heading', { name: 'The Record', exact: true }).isVisible().catch(() => false)));

  await ctx2.close();
}

/**
 * WebKit pass. Not a duplicate of the Chromium run — the spotlight's dim is a
 * 200vmax box-shadow spread on a fixed element, and WebKit is the engine with
 * the history of mis-compositing exactly that. It is also the closest thing
 * available here to iOS Safari; a real notch still cannot be simulated, so
 * env(safe-area-inset-*) resolves to 0 and remains unverified on device.
 */
async function scenarioWebKit(wkBrowser) {
  console.log('\n[11] WebKit at 390x844 — spotlight geometry and caption placement');
  const ctx = await wkBrowser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const page = await ctx.newPage();
  await signIn(page, ACCOUNTS.empty);
  await resetHelpState(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);

  const visible = await launcher(page).isVisible().catch(() => false);
  check('webkit: launcher renders', visible);
  if (!visible) { await ctx.close(); return; }

  await launcher(page).click();
  await page.waitForTimeout(1800);

  const steps = [
    ['[data-tour="mirror"]', 'The Oracle reading'],
    ['[data-tour="quick-actions"]', 'The four modules'],
    ['[data-tour="stats"]', 'Your stats'],
  ];

  for (let i = 0; i < steps.length; i++) {
    const [selector] = steps[i];
    await ring(page).waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(500);

    const cover = await ringCoversAnchor(page, selector);
    check(`webkit: step ${i + 1} spotlight frames ${selector}`, cover.ok, cover.reason);

    const box = await caption(page).boundingBox();
    const inView = box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844;
    check(`webkit: step ${i + 1} caption within 390x844`, !!inView,
      box ? `y=${box.y.toFixed(0)} h=${box.height.toFixed(0)}` : 'no box');

    const btn = caption(page).getByRole('button', { name: i === steps.length - 1 ? 'Done' : 'Next' });
    const bb = await btn.boundingBox();
    const hit = bb ? await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      if (!el) return 'null';
      const cs = getComputedStyle(el);
      return `${el.tagName.toLowerCase()}[${el.textContent?.trim().slice(0, 12) || '?'}] z=${cs.zIndex}`;
    }, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }) : 'no box';

    let clicked = true;
    try {
      await btn.click({ timeout: 8000 });
    } catch {
      clicked = false;
      await btn.click({ force: true, timeout: 8000 }).catch(() => {});
    }
    check(`webkit: step ${i + 1} Next/Done is hit-testable`, clicked, `elementFromPoint → ${hit}`);
    await page.waitForTimeout(900);
  }

  check('webkit: tour completes', !(await caption(page).isVisible().catch(() => false)));
  check('webkit: scroll released', await pageScrolls(page, 390, 844));

  await ctx.close();
}

async function main() {
  console.log('→ seeding emulator');
  await seed();

  console.log(`→ booting vite on ${PORT} (mode=emulator)`);
  // Spawned WITHOUT a shell, invoking vite's entry script directly. Going
  // through npx/cmd makes the returned pid the shell's, and the shell exits
  // as soon as it has launched node — so the server gets re-parented and
  // `kill()` (and even `taskkill /T`) target a pid that no longer exists.
  // That is how a stranded dev server survives the run that created it.
  const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const vite = spawn(process.execPath, [viteBin, '--mode', 'emulator', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: 'ignore',
  });

  const browser = await chromium.launch();
  try {
    await waitForServer(BASE_URL);
    console.log('→ dev server up\n');

    // `--only=webkit` narrows the run while iterating on one engine; the full
    // suite is the default and is what a result should ever be quoted from.
    const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1];
    const wants = (name) => !only || only === name;

    if (wants('chromium')) {
      await scenarioHappyPath(browser);
      await scenarioEscape(browser);
      await scenarioDegraded(browser);
      await scenarioReducedMotionMobile(browser);
      await scenarioSettingsReplay(browser);
      await scenarioDismissRace(browser);
      await scenarioStalenessGrace(browser);
      await scenarioWriteFailure(browser);
      await scenarioResetClearsMirror(browser);
      await scenarioAllModuleIntros(browser);
      await scenarioTheRecord(browser);
    }
    if (wants('webkit')) {
      // Reported as skipped rather than silently passing if the engine is absent.
      let wk = null;
      try {
        wk = await webkit.launch();
      } catch (err) {
        console.log(`\n[11] WebKit SKIPPED — engine unavailable (${err.message.split('\n')[0]})`);
        results.push({ name: 'webkit pass', pass: false, detail: 'engine not installed — NOT VERIFIED' });
      }
      if (wk) {
        try { await scenarioWebKit(wk); } finally { await wk.close(); }
      }
    }
  } finally {
    await browser.close();
    // Must be SYNCHRONOUS: an async taskkill does not survive the
    // process.exit() below. A previous run stranded a server on 5199 and made
    // the next run fail on a port conflict unrelated to the code under test.
    vite.kill('SIGKILL');
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(vite.pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RESULT ${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log('\nFAILURES:');
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`));
  }
  console.log('='.repeat(60));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => { console.error('FATAL', err); process.exit(1); });
