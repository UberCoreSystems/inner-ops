import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

import {
  LOCK_GRACE_MS,
  LOCK_BEAT_MS,
  readAppLockEnabled,
  writeAppLockEnabled,
  initialLockState,
  leftForegroundAt,
  lockReducer,
  readLockSupport,
  verifyDeviceOwner,
  setSwitcherCover,
} from './appLock.js';

const STORAGE_KEY = 'innerops_app_lock';
const T0 = 1_800_000_000_000;

// The app, as `isNativePlatform` sees it, with a web view's storage.
function fakeStorage(initial = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => { items.set(key, String(value)); },
    removeItem: (key) => { items.delete(key); },
  };
}

const inTheApp = () => { globalThis.Capacitor = { isNativePlatform: () => true }; };
const inABrowser = () => { delete globalThis.Capacitor; };

beforeEach(() => {
  inTheApp();
  globalThis.localStorage = fakeStorage();
});

afterEach(() => {
  inABrowser();
  delete globalThis.localStorage;
});

// Stand-in for the biometric plugin. `calls` records every bridge call.
function fakeBiometric({ available = {}, verify = async () => undefined } = {}) {
  const calls = [];
  const NativeBiometric = {
    isAvailable: async (options) => {
      calls.push(['isAvailable', options]);
      return available;
    },
    verifyIdentity: async (options) => {
      calls.push(['verifyIdentity', options]);
      return verify(options);
    },
  };
  return { calls, load: async () => ({ NativeBiometric }) };
}

const run = (events, state) => events.reduce(lockReducer, state);
const ON_AND_OPEN = run([{ type: 'verified' }], initialLockState(true));

// --- the setting -------------------------------------------------------------

test('the lock is off until it is stored as on', () => {
  assert.strictEqual(readAppLockEnabled(), false);

  globalThis.localStorage = fakeStorage({ [STORAGE_KEY]: 'true' });
  assert.strictEqual(readAppLockEnabled(), false);

  globalThis.localStorage = fakeStorage({ [STORAGE_KEY]: '1' });
  assert.strictEqual(readAppLockEnabled(), true);
});

test('turning it on and off is what the next launch reads', () => {
  assert.strictEqual(writeAppLockEnabled(true), true);
  assert.strictEqual(readAppLockEnabled(), true);

  assert.strictEqual(writeAppLockEnabled(false), true);
  assert.strictEqual(readAppLockEnabled(), false);
  assert.strictEqual(globalThis.localStorage.getItem(STORAGE_KEY), null);
});

test('a browser never reads the lock as on, whatever is stored', () => {
  globalThis.localStorage = fakeStorage({ [STORAGE_KEY]: '1' });
  inABrowser();

  assert.strictEqual(readAppLockEnabled(), false);
});

test('storage that throws reads as off and reports a failed write', () => {
  const broken = () => { throw new Error('storage blocked'); };
  globalThis.localStorage = { getItem: broken, setItem: broken, removeItem: broken };

  assert.strictEqual(readAppLockEnabled(), false);
  assert.strictEqual(writeAppLockEnabled(true), false);
});

// --- the state ---------------------------------------------------------------

test('with the lock on, the app starts locked and has let nothing through', () => {
  assert.deepStrictEqual(initialLockState(true), { enabled: true, phase: 'locked', opened: false, leftAt: null });
});

test('with the lock off, the app starts open', () => {
  assert.deepStrictEqual(initialLockState(false), { enabled: false, phase: 'open', opened: true, leftAt: null });
});

test('only a confirmed owner opens a locked app', () => {
  const locked = initialLockState(true);

  assert.strictEqual(run([{ type: 'resume', now: T0 }], locked), locked);
  assert.strictEqual(run([{ type: 'pause', at: T0 }, { type: 'resume', now: T0 + 1 }], locked), locked);
  assert.deepStrictEqual(run([{ type: 'verified' }], locked), {
    enabled: true, phase: 'open', opened: true, leftAt: null,
  });
});

test('going to the background covers the app at once', () => {
  const covered = run([{ type: 'pause', at: T0 }], ON_AND_OPEN);

  assert.strictEqual(covered.phase, 'covered');
  assert.strictEqual(covered.leftAt, T0);
});

test('back inside the grace period: open again, no owner check', () => {
  const back = (elapsed) => run([{ type: 'pause', at: T0 }, { type: 'resume', now: T0 + elapsed }], ON_AND_OPEN);

  assert.strictEqual(back(0).phase, 'open');
  assert.strictEqual(back(LOCK_GRACE_MS - 1).phase, 'open');
  assert.strictEqual(back(0).leftAt, null);
});

test('back at or after the grace period: locked', () => {
  const back = (elapsed) => run([{ type: 'pause', at: T0 }, { type: 'resume', now: T0 + elapsed }], ON_AND_OPEN);

  assert.strictEqual(back(LOCK_GRACE_MS).phase, 'locked');
  assert.strictEqual(back(LOCK_GRACE_MS * 100).phase, 'locked');
  assert.strictEqual(LOCK_GRACE_MS, 30_000);
});

test('a clock that went backwards, or no leaving time at all, locks', () => {
  const back = (at, now) => run([{ type: 'pause', at }, { type: 'resume', now }], ON_AND_OPEN);

  assert.strictEqual(back(T0, T0 - 1).phase, 'locked');
  assert.strictEqual(back(undefined, T0).phase, 'locked');
  assert.strictEqual(back(NaN, T0).phase, 'locked');
  assert.strictEqual(back(T0, undefined).phase, 'locked');
});

test('a return the app never saw begin locks', () => {
  assert.strictEqual(run([{ type: 'resume', now: T0 }], ON_AND_OPEN).phase, 'locked');
});

test('a second pause does not move the leaving time', () => {
  const covered = run([{ type: 'pause', at: T0 }, { type: 'pause', at: T0 + LOCK_GRACE_MS }], ON_AND_OPEN);

  assert.strictEqual(covered.leftAt, T0);
});

test('a re-lock keeps what was let through mounted', () => {
  const relocked = run([{ type: 'pause', at: T0 }, { type: 'resume', now: T0 + LOCK_GRACE_MS }], ON_AND_OPEN);

  assert.strictEqual(relocked.opened, true);
  assert.strictEqual(run([{ type: 'verified' }], relocked).phase, 'open');
});

test('with the lock off, the background changes nothing', () => {
  const off = initialLockState(false);

  assert.strictEqual(run([{ type: 'pause', at: T0 }, { type: 'resume', now: T0 + LOCK_GRACE_MS * 2 }], off), off);
  assert.strictEqual(run([{ type: 'verified' }], off), off);
  assert.strictEqual(run([{ type: 'disable' }], off), off);
});

test('turning the lock on leaves the open app open', () => {
  const on = run([{ type: 'enable' }], initialLockState(false));

  assert.deepStrictEqual(on, { enabled: true, phase: 'open', opened: true, leftAt: null });
  assert.strictEqual(run([{ type: 'enable' }], on), on);
});

test('turning the lock off opens the app from any phase', () => {
  const off = initialLockState(false);
  const covered = run([{ type: 'pause', at: T0 }], ON_AND_OPEN);

  assert.deepStrictEqual(run([{ type: 'disable' }], initialLockState(true)), off);
  assert.deepStrictEqual(run([{ type: 'disable' }], covered), off);
  assert.deepStrictEqual(run([{ type: 'disable' }], ON_AND_OPEN), off);
});

test('a pause handled on time is stamped with the clock', () => {
  assert.strictEqual(leftForegroundAt(T0, T0 - 1_000), T0);
  assert.strictEqual(leftForegroundAt(T0, T0), T0);
});

test('a pause handled late is stamped from the last beat, so the time away still counts', () => {
  const lastBeat = T0;
  const handledAt = T0 + 10 * 60_000;
  const at = leftForegroundAt(handledAt, lastBeat);

  assert.strictEqual(at, lastBeat + LOCK_BEAT_MS);
  assert.strictEqual(run([{ type: 'pause', at }, { type: 'resume', now: handledAt }], ON_AND_OPEN).phase, 'locked');
});

// --- the phone ---------------------------------------------------------------

test('Face ID set up: available, by face', async () => {
  const plugin = fakeBiometric({
    available: { isAvailable: true, strongBiometryIsAvailable: true, biometryType: 2, deviceIsSecure: true },
  });

  assert.deepStrictEqual(await readLockSupport(plugin.load), { available: true, method: 'face' });
  assert.deepStrictEqual(plugin.calls, [['isAvailable', { useFallback: true }]]);
});

test('Touch ID set up: available, by touch', async () => {
  const plugin = fakeBiometric({
    available: { isAvailable: true, strongBiometryIsAvailable: true, biometryType: 1, deviceIsSecure: true },
  });

  assert.deepStrictEqual(await readLockSupport(plugin.load), { available: true, method: 'touch' });
});

test('a Face ID phone with no face enrolled, or Face ID refused for this app: by passcode', async () => {
  const plugin = fakeBiometric({
    available: { isAvailable: true, strongBiometryIsAvailable: false, biometryType: 2, deviceIsSecure: true },
  });

  assert.deepStrictEqual(await readLockSupport(plugin.load), { available: true, method: 'passcode' });
});

test('a phone with no passcode cannot confirm its owner', async () => {
  const plugin = fakeBiometric({
    available: { isAvailable: false, strongBiometryIsAvailable: false, biometryType: 2, deviceIsSecure: false },
  });

  assert.deepStrictEqual(await readLockSupport(plugin.load), { available: false, method: 'passcode' });
});

test('the owner is confirmed only when iOS says yes, with the passcode allowed', async () => {
  const plugin = fakeBiometric();

  assert.strictEqual(await verifyDeviceOwner(plugin.load), true);
  assert.deepStrictEqual(plugin.calls, [['verifyIdentity', { reason: 'Unlock Inner Ops', useFallback: true }]]);
});

test('a cancel, a failed match and a phone with no passcode are all not confirmed', async () => {
  const rejecting = (error) => fakeBiometric({ verify: async () => { throw error; } }).load;

  assert.strictEqual(await verifyDeviceOwner(rejecting({ code: '16', message: 'Canceled by user.' })), false);
  assert.strictEqual(await verifyDeviceOwner(rejecting({ code: '10', message: 'Authentication failed.' })), false);
  assert.strictEqual(await verifyDeviceOwner(rejecting(new Error('Authentication not available'))), false);
});

test('a plugin that will not load is not confirmed', async () => {
  const load = async () => { throw new Error('chunk failed to load'); };

  assert.strictEqual(await verifyDeviceOwner(load), false);
});

test('a browser is never confirmed, and the plugin is never asked', async () => {
  const plugin = fakeBiometric();
  inABrowser();

  assert.strictEqual(await verifyDeviceOwner(plugin.load), false);
  assert.deepStrictEqual(plugin.calls, []);
});

test('the app switcher cover follows what it is told', async () => {
  const calls = [];
  const PrivacyScreen = {
    enable: async (...args) => { calls.push(['enable', ...args]); },
    disable: async (...args) => { calls.push(['disable', ...args]); },
  };
  const load = async () => ({ PrivacyScreen });

  await setSwitcherCover(true, load);
  await setSwitcherCover(false, load);

  assert.deepStrictEqual(calls, [['enable'], ['disable']]);
});
