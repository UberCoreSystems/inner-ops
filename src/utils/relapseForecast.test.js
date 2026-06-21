import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeRelapseForecast,
  FORECAST_SINGLE_STRONG_CONFIDENCE,
} from './relapseForecast.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);
const at = (daysAgo) => new Date(NOW - daysAgo * MS_PER_DAY).toISOString();
const dateOnly = (daysAgo) => new Date(NOW - daysAgo * MS_PER_DAY).toISOString().slice(0, 10);

const signal = (daysAgo) => ({ entryType: 'signal', eventOccurredAt: at(daysAgo) });
const relapseEvent = (daysAgo) => ({ entryType: 'relapse', eventOccurredAt: at(daysAgo) });
const pad = (n) => Array.from({ length: n }, () => ({})); // empty hard lessons → docs, no events

// Kill target whose escapes precede relapses (date-only, daily resolution).
const targetWithEscapes = (daysAgoList) => ({
  status: 'active',
  createdAt: at(40),
  escapeData: daysAgoList.map((d) => ({ date: dateOnly(d) })),
});

describe('computeRelapseForecast — insufficient signal', () => {
  it('fires nothing below the trust gate', () => {
    const out = computeRelapseForecast({
      relapseEntries: [signal(2), relapseEvent(1)],
      now: NOW,
    });
    assert.equal(out.status, 'insufficient-signal');
    assert.equal(out.fired, false);
    assert.equal(out.signalKey, null);
  });
});

describe('computeRelapseForecast — single strong antecedent', () => {
  // signal precedes relapse 3/4 times (conf 0.75 ≥ 0.7); most recent signal is
  // 1 day ago → active. Fires on the strong-single path.
  const fixture = (signalDelta) => ({
    relapseEntries: [
      signal(20), signal(15), signal(10), signal(1),
      relapseEvent(19), relapseEvent(14), relapseEvent(9),
    ],
    hardLessons: pad(14), // 7 + 14 = 21
    now: NOW,
    signalDelta,
  });

  it('fires', () => {
    const out = computeRelapseForecast(fixture(null));
    assert.equal(out.status, 'ok');
    assert.equal(out.fired, true);
    const ante = out.activeAntecedents.find((a) => a.type === 'relapse:signal');
    assert.ok(ante, 'relapse:signal must be active');
    assert.ok(ante.confidence >= FORECAST_SINGLE_STRONG_CONFIDENCE);
    assert.ok(out.signalKey && out.signalKey.startsWith('forecast_'));
  });

  it('still fires under an improving trend (strong single survives the downgrade)', () => {
    const out = computeRelapseForecast(fixture('improving'));
    assert.equal(out.fired, true);
  });
});

describe('computeRelapseForecast — two moderate antecedents converge', () => {
  // Neither antecedent is strong alone (conf 0.6), but both are active → fires
  // on the multiple-antecedent path.
  const fixture = (signalDelta) => ({
    relapseEntries: [
      signal(20), signal(15), signal(10), signal(5), signal(1), // 3/5 followed → 0.6
      relapseEvent(19), relapseEvent(14), relapseEvent(9),
    ],
    killTargets: [targetWithEscapes([21, 16, 11, 6, 2])], // 3/5 followed → 0.6, last escape 2d ago
    hardLessons: pad(12), // 8 + 1 + 12 = 21
    now: NOW,
    signalDelta,
  });

  it('fires when delta is not improving', () => {
    const out = computeRelapseForecast(fixture(null));
    assert.equal(out.fired, true);
    const types = out.activeAntecedents.map((a) => a.type).sort();
    assert.deepEqual(types, ['killlist:escape', 'relapse:signal']);
    assert.ok(out.activeAntecedents.every((a) => a.confidence < FORECAST_SINGLE_STRONG_CONFIDENCE));
  });

  it('is downgraded (no fire) under an improving trend', () => {
    const out = computeRelapseForecast(fixture('improving'));
    assert.equal(out.fired, false);
    assert.ok(out.activeAntecedents.length >= 2, 'antecedents still surfaced, just not fired');
  });
});

describe('computeRelapseForecast — below threshold', () => {
  it('does not fire on a single moderate antecedent', () => {
    const out = computeRelapseForecast({
      relapseEntries: [
        signal(20), signal(15), signal(10), signal(5), signal(1), // conf 0.6
        relapseEvent(19), relapseEvent(14), relapseEvent(9),
      ],
      hardLessons: pad(13), // 8 + 13 = 21
      now: NOW,
    });
    assert.equal(out.status, 'ok');
    assert.equal(out.fired, false);
    assert.equal(out.signalKey, null);
  });
});

describe('computeRelapseForecast — false-positive guard', () => {
  it('suppresses when a relapse already occurred inside the lead window', () => {
    const out = computeRelapseForecast({
      relapseEntries: [
        signal(20), signal(15), signal(10), signal(1),
        relapseEvent(19), relapseEvent(14), relapseEvent(9),
        relapseEvent(0), // relapse today — prediction would be post-hoc
      ],
      hardLessons: pad(13), // 8 + 13 = 21
      now: NOW,
    });
    assert.equal(out.fired, false);
    assert.equal(out.suppressedBy, 'recent-relapse');
  });
});

describe('computeRelapseForecast — determinism', () => {
  it('produces a stable signalKey across runs', () => {
    const fixture = () => ({
      relapseEntries: [
        signal(20), signal(15), signal(10), signal(1),
        relapseEvent(19), relapseEvent(14), relapseEvent(9),
      ],
      hardLessons: pad(14),
      now: NOW,
    });
    const a = computeRelapseForecast(fixture());
    const b = computeRelapseForecast(fixture());
    assert.equal(a.signalKey, b.signalKey);
    assert.ok(a.fired && b.fired);
  });
});
