import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateKillListCheckIn, CHECK_IN_DUE_HOURS } from './killListCheckIn.js';
import { ENGAGEMENT_TRIGGERS } from '../schema.js';

const HOURS = 60 * 60 * 1000;
const NOW = Date.parse('2026-05-30T12:00:00Z');
const hoursAgo = (h) => new Date(NOW - h * HOURS).toISOString();

const triggerId = ENGAGEMENT_TRIGGERS.KILL_LIST_CHECK_IN;
const enabledPrefs = { [triggerId]: { enabled: true } };

test('returns null when the trigger is disabled', () => {
  const result = evaluateKillListCheckIn({
    killTargets: [{ status: 'active', title: 'Doomscrolling', lastCheckIn: hoursAgo(48) }],
    notificationPreferences: { [triggerId]: { enabled: false } },
    bannerDismissals: {},
    now: NOW,
  });
  assert.equal(result, null);
});

test('returns null when there are no active targets', () => {
  const result = evaluateKillListCheckIn({
    killTargets: [{ status: 'killed', title: 'Old', lastCheckIn: hoursAgo(48) }],
    notificationPreferences: enabledPrefs,
    bannerDismissals: {},
    now: NOW,
  });
  assert.equal(result, null);
});

test('returns null when an active target was checked in recently', () => {
  const result = evaluateKillListCheckIn({
    killTargets: [{ status: 'active', title: 'Doomscrolling', lastCheckIn: hoursAgo(2) }],
    notificationPreferences: enabledPrefs,
    bannerDismissals: {},
    now: NOW,
  });
  assert.equal(result, null);
});

test('fires for an active target past the check-in window, with single-contract copy', () => {
  const result = evaluateKillListCheckIn({
    killTargets: [{ status: 'active', title: 'Doomscrolling', lastCheckIn: hoursAgo(CHECK_IN_DUE_HOURS + 1) }],
    notificationPreferences: enabledPrefs,
    bannerDismissals: {},
    now: NOW,
  });
  assert.ok(result, 'should fire');
  assert.equal(result.triggerId, triggerId);
  assert.equal(result.actionRoute, '/ledger');
  assert.match(result.copy, /Doomscrolling/);
});

test('fires for a contract with no check-in history at all', () => {
  const result = evaluateKillListCheckIn({
    killTargets: [{ status: 'active', title: 'Porn', lastCheckIn: null, checkIns: [] }],
    notificationPreferences: enabledPrefs,
    bannerDismissals: {},
    now: NOW,
  });
  assert.ok(result);
  assert.match(result.copy, /Porn/);
});

test('uses plural copy and the due count when several contracts are open', () => {
  const result = evaluateKillListCheckIn({
    killTargets: [
      { status: 'active', title: 'A', lastCheckIn: hoursAgo(40) },
      { status: 'active', title: 'B', lastCheckIn: hoursAgo(40) },
      { status: 'active', title: 'C', lastCheckIn: hoursAgo(1) }, // not due
    ],
    notificationPreferences: enabledPrefs,
    bannerDismissals: {},
    now: NOW,
  });
  assert.ok(result);
  assert.match(result.copy, /2 contracts are open/);
});

test('honors a recent dismissal when no check-in has happened since', () => {
  const result = evaluateKillListCheckIn({
    killTargets: [{ status: 'active', title: 'Doomscrolling', lastCheckIn: hoursAgo(48) }],
    notificationPreferences: enabledPrefs,
    bannerDismissals: { [triggerId]: hoursAgo(2) },
    now: NOW,
  });
  assert.equal(result, null, 'recent dismissal with no new check-in suppresses');
});

test('re-fires when the user checked in after dismissing (then went stale again)', () => {
  // Dismissed 30h ago, checked in 25h ago (after dismissal), now stale again.
  const result = evaluateKillListCheckIn({
    killTargets: [{ status: 'active', title: 'Doomscrolling', lastCheckIn: hoursAgo(25) }],
    notificationPreferences: enabledPrefs,
    bannerDismissals: { [triggerId]: hoursAgo(30) },
    now: NOW,
  });
  assert.ok(result, 'a check-in after the dismissal clears the suppression');
});

test('re-fires once a full window has elapsed since dismissal', () => {
  const result = evaluateKillListCheckIn({
    killTargets: [{ status: 'active', title: 'Doomscrolling', lastCheckIn: hoursAgo(100) }],
    notificationPreferences: enabledPrefs,
    bannerDismissals: { [triggerId]: hoursAgo(CHECK_IN_DUE_HOURS + 2) },
    now: NOW,
  });
  assert.ok(result, 'a stale dismissal does not silence the trigger forever');
});
