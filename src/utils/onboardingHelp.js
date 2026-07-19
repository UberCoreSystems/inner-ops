/**
 * onboardingHelp — first-run help state (module intros + guided walkthroughs).
 *
 * Source of truth is `userSettings.onboardingHelp`, so dismissing an intro on
 * a phone also dismisses it on a laptop. A uid-keyed localStorage mirror sits
 * in front of it purely as a failure backstop.
 *
 * The mirror exists because the two failure modes are not symmetric:
 *
 *   Re-showing something the user already dismissed is an active insult — they
 *   told the app they had read it and the app ignored them.
 *
 *   Failing to show an intro once costs very little: every module header still
 *   carries its tagline, and Settings can replay the whole set.
 *
 * So every path here fails toward NOT re-showing. The mirror is written
 * synchronously before the network call; a Firestore failure is logged and
 * otherwise swallowed, and the user still sees the panel stay dismissed.
 *
 * Consequence worth remembering: any reset MUST clear the mirror too, or the
 * replay buttons appear to do nothing. resetHelp() owns that so no caller can
 * forget it.
 */

import { readUserData, upsertUserSettingsFields } from './firebaseUtils';
import { ONBOARDING_HELP_VERSION } from './schema';
import logger from './logger';

const MIRROR_PREFIX = 'io_help_seen';

const mirrorKey = (uid) => `${MIRROR_PREFIX}:${uid}`;

/**
 * Every entry point takes an explicit uid rather than reaching for the auth
 * singleton itself.
 *
 * Deriving it here independently was a real bug: this module would have called
 * `getAuth()` from `firebase/auth` directly while its caller obtained the user
 * from the app's lazy async accessor in `../firebase`. Those two race. When the
 * direct accessor had not yet hydrated `currentUser`, the uid came back null,
 * the mirror lookup missed, and an intro the user had already dismissed
 * reappeared — intermittently, which is the worst way for it to fail.
 *
 * The caller already has an authenticated user. Take it from them.
 */

// localStorage throws in Safari private mode and can be absent in a WKWebView.
// Both accessors fail toward "nothing recorded" rather than throwing.
const readMirror = (uid) => {
  if (!uid) return { modules: {}, walkthroughs: {} };
  try {
    const raw = localStorage.getItem(mirrorKey(uid));
    if (!raw) return { modules: {}, walkthroughs: {} };
    const parsed = JSON.parse(raw);
    return {
      modules: parsed?.modules && typeof parsed.modules === 'object' ? parsed.modules : {},
      walkthroughs: parsed?.walkthroughs && typeof parsed.walkthroughs === 'object' ? parsed.walkthroughs : {},
    };
  } catch {
    return { modules: {}, walkthroughs: {} };
  }
};

const writeMirror = (uid, next) => {
  if (!uid) return;
  try {
    localStorage.setItem(mirrorKey(uid), JSON.stringify(next));
  } catch { /* best-effort */ }
};

const clearMirror = (uid, scope) => {
  if (!uid) return;
  try {
    if (scope === 'all') {
      localStorage.removeItem(mirrorKey(uid));
      return;
    }
    const current = readMirror(uid);
    writeMirror(uid, { ...current, [scope]: {} });
  } catch { /* best-effort */ }
};

/**
 * Read the merged help state. Firestore carries it across devices; the mirror
 * only suppresses a re-show on a device whose write failed. Entries recorded
 * under an older ONBOARDING_HELP_VERSION are ignored, which is what makes a
 * version bump re-show everything without a migration.
 *
 * @returns {Promise<{modules: object, walkthroughs: object, ready: true}>}
 */
export async function readOnboardingHelp(uid) {
  const mirror = readMirror(uid);

  let remote = { modules: {}, walkthroughs: {} };
  try {
    const docs = await readUserData('userSettings');
    const help = docs?.[0]?.onboardingHelp;
    if (help && Number(help.version) === ONBOARDING_HELP_VERSION) {
      remote = {
        modules: help.modules && typeof help.modules === 'object' ? help.modules : {},
        walkthroughs: help.walkthroughs && typeof help.walkthroughs === 'object' ? help.walkthroughs : {},
      };
    }
  } catch (err) {
    // Offline or rules failure. The mirror alone still suppresses anything
    // dismissed on this device; the rest simply shows again later.
    logger.warn('Failed to read onboarding help state:', err);
  }

  return {
    modules: { ...mirror.modules, ...remote.modules },
    walkthroughs: { ...mirror.walkthroughs, ...remote.walkthroughs },
    ready: true,
  };
}

/** Record that a module intro has been dismissed. Never throws. */
export function markModuleSeen(uid, moduleId) {
  if (!moduleId) return;
  const at = new Date().toISOString();

  const mirror = readMirror(uid);
  writeMirror(uid, { ...mirror, modules: { ...mirror.modules, [moduleId]: at } });

  // Fire-and-forget: the panel is already gone locally, and a failed help
  // write is not worth interrupting the user over.
  upsertUserSettingsFields({
    'onboardingHelp.version': ONBOARDING_HELP_VERSION,
    [`onboardingHelp.modules.${moduleId}`]: at,
  }).catch((err) => logger.warn('Failed to persist module intro dismissal:', err));
}

/**
 * Record the outcome of a guided walkthrough.
 * @param {string} tourId
 * @param {{status: 'completed'|'skipped', atStep?: number}} outcome
 */
export function markWalkthrough(uid, tourId, { status, atStep = null } = {}) {
  if (!tourId || !status) return;
  const entry = { status, at: new Date().toISOString(), atStep, version: ONBOARDING_HELP_VERSION };

  const mirror = readMirror(uid);
  writeMirror(uid, { ...mirror, walkthroughs: { ...mirror.walkthroughs, [tourId]: entry } });

  upsertUserSettingsFields({
    'onboardingHelp.version': ONBOARDING_HELP_VERSION,
    [`onboardingHelp.walkthroughs.${tourId}`]: entry,
  }).catch((err) => logger.warn('Failed to persist walkthrough state:', err));
}

/**
 * Clear help state so it shows again. Clears the mirror as well as Firestore —
 * skipping the mirror is the one mistake that makes a reset silently no-op.
 *
 * @param {'modules'|'walkthroughs'|'all'} scope
 */
export async function resetHelp(uid, scope = 'all') {
  if (scope === 'all') {
    clearMirror(uid, 'all');
    await upsertUserSettingsFields({
      'onboardingHelp.modules': {},
      'onboardingHelp.walkthroughs': {},
    });
    return;
  }

  clearMirror(uid, scope);
  await upsertUserSettingsFields({ [`onboardingHelp.${scope}`]: {} });
}

export const __testables = { readMirror, mirrorKey };
