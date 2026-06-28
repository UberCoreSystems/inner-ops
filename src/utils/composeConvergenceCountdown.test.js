/**
 * Tests for composeConvergenceCountdown — the forward projection layered on a
 * fired relapse forecast. Verifies the window math (last occurrence + lead time),
 * already-open handling, soonest/aggregate selection, M-of-K, and the
 * history-framed (never destiny) copy.
 *
 * Run: node --test src/utils/composeConvergenceCountdown.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { composeConvergenceCountdown, countdownLine } from './composeConvergenceCountdown.js';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

const ante = (over) => ({ type: 'relapse:signal', lagMedian: 5, lagUnit: 'days', lastOccurredAt: NOW - DAY, ...over });

test('inactive when the forecast did not fire', () => {
  assert.equal(composeConvergenceCountdown({ fired: false, activeAntecedents: [] }).status, 'inactive');
  assert.equal(composeConvergenceCountdown(null).status, 'inactive');
  assert.equal(countdownLine(composeConvergenceCountdown(null)), '');
});

test('projects the window from last occurrence + historical lead time', () => {
  // occurred 1 day ago, typically precedes by 5 days → window opens in ~4 days
  const forecast = { fired: true, activeAntecedents: [ante()], knownRelapseAntecedents: 2 };
  const cd = composeConvergenceCountdown(forecast, { now: NOW });
  assert.equal(cd.status, 'active');
  assert.equal(cd.items[0].daysUntilWindow, 4);
  assert.equal(cd.items[0].windowOpen, false);
  assert.equal(cd.soonestDays, 4);
  assert.equal(cd.windowOpenNow, false);
  assert.equal(cd.activeCount, 1);
  assert.equal(cd.knownCount, 2);
  assert.equal(countdownLine(cd), 'Based on your record, the window opens in ~4 days. 1 of 2 known antecedents are active.');
});

test('a window whose projected time has passed reads as already open (never a missed prediction)', () => {
  // occurred 4 days ago, precedes by 3 days → projected 1 day ago → open now
  const forecast = {
    fired: true,
    knownRelapseAntecedents: 3,
    activeAntecedents: [
      ante({ type: 'killlist:escape', lagMedian: 3, lastOccurredAt: NOW - 4 * DAY }), // -1 → open
      ante({ type: 'relapse:signal', lagMedian: 5, lastOccurredAt: NOW - DAY }),       // +4
    ],
  };
  const cd = composeConvergenceCountdown(forecast, { now: NOW });
  assert.equal(cd.windowOpenNow, true);
  assert.equal(cd.soonestDays, -1, 'soonest is the earliest (already-open) window');
  assert.equal(cd.activeCount, 2);
  assert.equal(countdownLine(cd), 'Based on your record, the window has already opened. 2 of 3 known antecedents are active.');
});

test('omits the M-of-K clause when the known count is unavailable', () => {
  const forecast = { fired: true, activeAntecedents: [ante()] }; // no knownRelapseAntecedents
  const cd = composeConvergenceCountdown(forecast, { now: NOW });
  assert.equal(cd.knownCount, null);
  assert.equal(countdownLine(cd), 'Based on your record, the window opens in ~4 days.');
});

test('handles hour-resolution lead times', () => {
  const forecast = { fired: true, activeAntecedents: [ante({ lagMedian: 36, lagUnit: 'hours', lastOccurredAt: NOW - 12 * HOUR })] };
  // occurred 12h ago, precedes by 36h → projected +24h → ~1 day
  const cd = composeConvergenceCountdown(forecast, { now: NOW });
  assert.equal(cd.items[0].daysUntilWindow, 1);
  assert.equal(countdownLine(cd), 'Based on your record, the window opens in ~1 day.');
});

test('singular day phrasing', () => {
  const forecast = { fired: true, activeAntecedents: [ante({ lagMedian: 2, lastOccurredAt: NOW - DAY })] }; // +1
  assert.match(countdownLine(composeConvergenceCountdown(forecast, { now: NOW })), /in ~1 day\.$/);
});
