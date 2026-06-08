import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuickSignalEntry } from './buildQuickSignalEntry.js';
import { RELAPSE_ENTRY_TYPES } from './schema.js';

const NOW = '2026-06-07T12:00:00.000Z';

describe('buildQuickSignalEntry', () => {
  it('builds a minimal signal entry from a transcript', () => {
    const e = buildQuickSignalEntry('craving hit after the call', NOW);
    assert.equal(e.entryType, RELAPSE_ENTRY_TYPES.SIGNAL);
    assert.equal(e.reflection, 'craving hit after the call');
    assert.equal(e.eventOccurredAt, NOW);
    assert.equal(e.entryProximityFlag, 'contemporaneous');
    assert.equal(e.isQuickLog, true);
  });

  it('never logs a confirmed relapse (entryType is always signal)', () => {
    const e = buildQuickSignalEntry('x', NOW);
    assert.notEqual(e.entryType, RELAPSE_ENTRY_TYPES.RELAPSE);
    assert.equal(e.entryType, 'signal');
  });

  it('leaves archetype and precursors empty so drift detection is not corrupted', () => {
    const e = buildQuickSignalEntry('x', NOW);
    assert.equal(e.selectedSelf, '');
    assert.deepEqual(e.precursorConditions, []);
    assert.deepEqual(e.selectedHabits, []);
    assert.deepEqual(e.substanceUse, []);
  });

  it('trims the transcript', () => {
    const e = buildQuickSignalEntry('   spaced out   ', NOW);
    assert.equal(e.reflection, 'spaced out');
  });

  it('returns null for empty/whitespace/non-string input', () => {
    assert.equal(buildQuickSignalEntry('', NOW), null);
    assert.equal(buildQuickSignalEntry('   ', NOW), null);
    assert.equal(buildQuickSignalEntry(null, NOW), null);
    assert.equal(buildQuickSignalEntry(undefined, NOW), null);
  });

  it('falls back to a generated timestamp when nowISO is missing', () => {
    const e = buildQuickSignalEntry('x');
    assert.equal(typeof e.eventOccurredAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(e.eventOccurredAt)));
  });
});
