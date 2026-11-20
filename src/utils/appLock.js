import { isNativePlatform } from './platform.js';
import logger from './logger.js';

// The app lock: this iPhone confirms its owner (Face ID, Touch ID or the
// passcode) before Inner Ops opens. A lock on the device, not encryption.
// The plugins load on demand, so only the app ever requests them.
const loadBiometric = async () => {
  const { NativeBiometric } = await import('@capgo/capacitor-native-biometric');
  // Wrapped in an object on purpose: a plugin proxy answers `then`, so one
  // returned bare from an async function is taken for a promise.
  return { NativeBiometric };
};

const loadPrivacyScreen = async () => {
  const { PrivacyScreen } = await import('@capacitor/privacy-screen');
  return { PrivacyScreen };
};

/** How long the app may sit in the background before returning needs the owner again. */
export const LOCK_GRACE_MS = 30_000;
/** How often the foreground app notes that it is still running. */
export const LOCK_BEAT_MS = 5_000;

const STORAGE_KEY = 'innerops_app_lock';

// The plugin's numbers for `biometryType`.
const TOUCH_ID = 1;
const FACE_ID = 2;

// --- the setting -------------------------------------------------------------

/**
 * Kept in the web view's own storage: this iPhone only, never Firestore, and
 * readable before the first render. On unless stored as exactly '1'; always
 * off outside the app.
 */
export const readAppLockEnabled = () => {
  if (!isNativePlatform()) return false;
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
};

/** @returns {boolean} false when the setting could not be stored */
export const writeAppLockEnabled = (enabled) => {
  try {
    if (enabled) globalThis.localStorage.setItem(STORAGE_KEY, '1');
    else globalThis.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};

// --- the state ---------------------------------------------------------------

// phase: 'open'    nothing in the way
//        'covered' in the background, content hidden, not yet decided
//        'locked'  the lock screen is up until the owner is confirmed
// opened: whether the app has been let through once since this page loaded.
//         Until then nothing that shows user data is mounted.
const OFF = { enabled: false, phase: 'open', opened: true, leftAt: null };

export const initialLockState = (enabled) => (
  enabled ? { enabled: true, phase: 'locked', opened: false, leftAt: null } : OFF
);

/**
 * When the app left the foreground. The `pause` handler can run late, after
 * iOS froze the page and thawed it again; the last beat then shows when the
 * page really stopped, and the clock does not.
 */
export const leftForegroundAt = (now, lastBeat) => Math.min(now, lastBeat + LOCK_BEAT_MS);

const withinGrace = (leftAt, now) => (
  Number.isFinite(leftAt) && Number.isFinite(now) && now >= leftAt && now - leftAt < LOCK_GRACE_MS
);

export function lockReducer(state, event) {
  switch (event.type) {
    case 'pause':
      return state.enabled && state.phase === 'open'
        ? { ...state, phase: 'covered', leftAt: event.at }
        : state;
    case 'resume':
      if (state.phase === 'covered') {
        return { ...state, phase: withinGrace(state.leftAt, event.now) ? 'open' : 'locked', leftAt: null };
      }
      // Back from a trip the page never saw begin: how long is unknown.
      return state.enabled && state.phase === 'open' ? { ...state, phase: 'locked' } : state;
    case 'verified':
      return state.phase === 'locked' ? { ...state, phase: 'open', opened: true } : state;
    case 'enable':
      return state.enabled ? state : { ...state, enabled: true };
    case 'disable':
      return state.enabled ? OFF : state;
    default:
      return state;
  }
}

// --- the phone ---------------------------------------------------------------

/**
 * What this iPhone can confirm its owner with.
 * @returns {Promise<{ available: boolean, method: 'face'|'touch'|'passcode' }>}
 *   `available` is false when the phone has no passcode at all; `method` is
 *   biometric only while one is set up and allowed for this app
 */
export async function readLockSupport(load = loadBiometric) {
  const { NativeBiometric } = await load();
  const result = await NativeBiometric.isAvailable({ useFallback: true });
  const biometric = result?.strongBiometryIsAvailable === true;
  let method = 'passcode';
  if (biometric && result.biometryType === FACE_ID) method = 'face';
  if (biometric && result.biometryType === TOUCH_ID) method = 'touch';
  return { available: result?.isAvailable === true, method };
}

/**
 * Asks iOS to confirm the device owner, with the passcode as the fallback.
 * True only when iOS says yes. A cancel, a failed match, a phone with no
 * passcode and a plugin that would not load are all false.
 */
export async function verifyDeviceOwner(load = loadBiometric) {
  // The plugin's stand-in for browsers passes every check. Never ask it.
  if (!isNativePlatform()) return false;
  try {
    const { NativeBiometric } = await load();
    await NativeBiometric.verifyIdentity({ reason: 'Unlock Inner Ops', useFallback: true });
    return true;
  } catch (err) {
    logger.warn('Device owner not confirmed:', err?.code || err?.message);
    return false;
  }
}

/**
 * The native cover iOS shows in place of the app whenever it is not active,
 * the app switcher included. iOS forgets it at every launch.
 */
export async function setSwitcherCover(on, load = loadPrivacyScreen) {
  const { PrivacyScreen } = await load();
  if (on) await PrivacyScreen.enable();
  else await PrivacyScreen.disable();
}
