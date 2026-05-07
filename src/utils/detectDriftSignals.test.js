import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { detectDriftSignals, DRIFT_STREAK_THRESHOLD } from './detectDriftSignals.js';
import { RELAPSE_FIELDS, KILL_TARGET_FIELDS } from './schema.js';

const dayMs = 24 * 60 * 60 * 1000;

// Fixed reference instant so tests don't drift with the wall clock.
const T0 = Date.UTC(2026, 3, 1, 12, 0, 0); // 2026-04-01T12:00:00Z
const tsForDay = (offsetDays) => T0 + offsetDays * dayMs;

const relapse = ({ archetype, day, precursors = [], contextShift = '', id }) => ({
  id: id ?? `r-${day}-${archetype ?? 'none'}`,
  timestamp: tsForDay(day),
  [RELAPSE_FIELDS.ARCHETYPE]: archetype,
  [RELAPSE_FIELDS.PRECURSORS]: precursors,
  [RELAPSE_FIELDS.CONTEXT_SHIFT]: contextShift,
});

describe('detectDriftSignals.DRIFT_STREAK_THRESHOLD', () => {
  it('is 3 (consecutive-day persistence threshold)', () => {
    assert.equal(DRIFT_STREAK_THRESHOLD, 3);
  });
});

describe('detectDriftSignals — archetype_frequency', () => {
  it('fires when same archetype appears on 3 consecutive days', () => {
    const entries = [
      relapse({ archetype: 'Avoider', day: 0 }),
      relapse({ archetype: 'Avoider', day: 1 }),
      relapse({ archetype: 'Avoider', day: 2 }),
    ];
    const { signals } = detectDriftSignals(entries, []);
    const archetypeSig = signals.find(s => s.type === 'archetype_frequency');
    assert.ok(archetypeSig, 'expected archetype_frequency signal');
    assert.equal(archetypeSig.archetype, 'Avoider');
    assert.equal(archetypeSig.streak, 3);
  });

  it('does NOT fire when same archetype appears 3 times non-consecutively', () => {
    const entries = [
      relapse({ archetype: 'Avoider', day: 0 }),
      relapse({ archetype: 'Avoider', day: 2 }),
      relapse({ archetype: 'Avoider', day: 4 }),
    ];
    const { signals } = detectDriftSignals(entries, []);
    assert.equal(signals.filter(s => s.type === 'archetype_frequency').length, 0);
  });

  it('does NOT fire below threshold (2 consecutive days)', () => {
    const entries = [
      relapse({ archetype: 'Avoider', day: 0 }),
      relapse({ archetype: 'Avoider', day: 1 }),
    ];
    const { signals } = detectDriftSignals(entries, []);
    assert.equal(signals.filter(s => s.type === 'archetype_frequency').length, 0);
  });

  it('skipping increments skippedCount when archetype is missing', () => {
    const entries = [
      { id: 'x', timestamp: tsForDay(0) },
    ];
    const { skippedCount } = detectDriftSignals(entries, []);
    assert.equal(skippedCount, 1);
  });
});

describe('detectDriftSignals — precursor_pattern', () => {
  it('fires when same precursor appears on 3 consecutive days', () => {
    const entries = [
      relapse({ archetype: 'A', day: 0, precursors: ['low_sleep'] }),
      relapse({ archetype: 'A', day: 1, precursors: ['low_sleep'] }),
      relapse({ archetype: 'A', day: 2, precursors: ['low_sleep'] }),
    ];
    const { signals } = detectDriftSignals(entries, []);
    const precursorSig = signals.find(s => s.type === 'precursor_pattern');
    assert.ok(precursorSig);
    assert.equal(precursorSig.condition, 'low_sleep');
    assert.equal(precursorSig.streak, 3);
  });
});

describe('detectDriftSignals — correlated_escape', () => {
  it('fires when kill-list escape and relapse fall within 48h', () => {
    const escapeIso = new Date(tsForDay(0)).toISOString();
    const targets = [{
      id: 't1',
      [KILL_TARGET_FIELDS.TITLE]: 'Doomscroll',
      [KILL_TARGET_FIELDS.ESCAPES]: [{ date: escapeIso }],
    }];
    const entries = [
      // Same calendar day → within 48h.
      relapse({ archetype: 'Avoider', day: 0, id: 'r1' }),
    ];
    const { signals } = detectDriftSignals(entries, targets);
    const sig = signals.find(s => s.type === 'correlated_escape');
    assert.ok(sig);
    assert.equal(sig.targetTitle, 'Doomscroll');
    assert.equal(sig.entryArchetype, 'Avoider');
  });

  it('does NOT fire when escape and relapse are >48h apart', () => {
    const escapeIso = new Date(tsForDay(0)).toISOString();
    const targets = [{
      id: 't1',
      [KILL_TARGET_FIELDS.TITLE]: 'Doomscroll',
      [KILL_TARGET_FIELDS.ESCAPES]: [{ date: escapeIso }],
    }];
    const entries = [
      relapse({ archetype: 'Avoider', day: 3, id: 'r1' }), // 72h later
    ];
    const { signals } = detectDriftSignals(entries, targets);
    assert.equal(signals.filter(s => s.type === 'correlated_escape').length, 0);
  });
});

describe('detectDriftSignals — life_transition', () => {
  it('fires when contextShift is reported on 3 consecutive days', () => {
    const entries = [
      relapse({ archetype: 'A', day: 0, contextShift: 'job change' }),
      relapse({ archetype: 'A', day: 1, contextShift: 'job change' }),
      relapse({ archetype: 'A', day: 2, contextShift: 'job change' }),
    ];
    const { signals } = detectDriftSignals(entries, []);
    const sig = signals.find(s => s.type === 'life_transition');
    assert.ok(sig);
    assert.equal(sig.streak, 3);
  });

  it('does NOT fire when contextShift is empty string', () => {
    const entries = [
      relapse({ archetype: 'A', day: 0, contextShift: '' }),
      relapse({ archetype: 'A', day: 1, contextShift: '' }),
      relapse({ archetype: 'A', day: 2, contextShift: '' }),
    ];
    const { signals } = detectDriftSignals(entries, []);
    assert.equal(signals.filter(s => s.type === 'life_transition').length, 0);
  });
});

describe('detectDriftSignals — empty / defensive inputs', () => {
  it('returns empty signals for no entries', () => {
    const { signals, skippedCount } = detectDriftSignals();
    assert.deepEqual(signals, []);
    assert.equal(skippedCount, 0);
  });

  it('returns empty signals for entries with no usable timestamps', () => {
    const entries = [
      { id: 'x', [RELAPSE_FIELDS.ARCHETYPE]: 'A' }, // no timestamp/createdAt
    ];
    const { signals } = detectDriftSignals(entries, []);
    assert.equal(signals.length, 0);
  });
});
