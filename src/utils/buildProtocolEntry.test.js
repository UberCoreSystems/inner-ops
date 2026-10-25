import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildProtocolEntry, PROTOCOL_TOOL_IDS } from './buildProtocolEntry.js';
import { RELAPSE_FIELDS } from './schema.js';

const NOW = '2026-10-24T12:00:00.000Z';

describe('buildProtocolEntry', () => {
  it('builds a signal entry carrying the run', () => {
    const e = buildProtocolEntry({
      intensity: 7,
      trigger: ' the call ',
      reflection: ' wanted to disappear ',
      toolsUsed: ['breathing'],
      breathingCycles: 4,
    }, NOW);
    assert.equal(e.reflection, 'wanted to disappear');
    assert.equal(e.eventOccurredAt, NOW);
    assert.equal(e.entryProximityFlag, 'contemporaneous');
    assert.deepEqual(e[RELAPSE_FIELDS.PROTOCOL_RUN], {
      intensity: 7,
      trigger: 'the call',
      toolsUsed: ['breathing'],
      breathingCycles: 4,
    });
  });

  it('writes no entry type and no resolution — a run opens a live window like any signal', () => {
    const e = buildProtocolEntry({ intensity: 10 }, NOW);
    assert.equal('entryType' in e, false);
    assert.equal(RELAPSE_FIELDS.RESOLUTION in e, false);
  });

  it('leaves archetype and precursors empty so drift detection is not corrupted', () => {
    const e = buildProtocolEntry({ intensity: 3 }, NOW);
    assert.equal(e.selectedSelf, '');
    assert.deepEqual(e.precursorConditions, []);
    assert.deepEqual(e.selectedHabits, []);
    assert.deepEqual(e.substanceUse, []);
    assert.equal(e.precursorContext, null);
  });

  it('clamps intensity to 1-10 and defaults when missing', () => {
    assert.equal(buildProtocolEntry({ intensity: 14 }, NOW).protocolRun.intensity, 10);
    assert.equal(buildProtocolEntry({ intensity: -2 }, NOW).protocolRun.intensity, 1);
    assert.equal(buildProtocolEntry({ intensity: 6.6 }, NOW).protocolRun.intensity, 7);
    assert.equal(buildProtocolEntry({}, NOW).protocolRun.intensity, 5);
    assert.equal(buildProtocolEntry({ intensity: 'x' }, NOW).protocolRun.intensity, 5);
  });

  it('keeps only known tool ids, deduplicated', () => {
    const e = buildProtocolEntry({ toolsUsed: ['breathing', 'breathing', 'nap', 'cold'] }, NOW);
    assert.deepEqual(e.protocolRun.toolsUsed, ['breathing', 'cold']);
    assert.deepEqual(buildProtocolEntry({ toolsUsed: 'breathing' }, NOW).protocolRun.toolsUsed, []);
    assert.ok(PROTOCOL_TOOL_IDS.includes('breathing'));
  });

  it('floors breathing cycles at zero', () => {
    assert.equal(buildProtocolEntry({ breathingCycles: -1 }, NOW).protocolRun.breathingCycles, 0);
    assert.equal(buildProtocolEntry({ breathingCycles: 2.9 }, NOW).protocolRun.breathingCycles, 2);
    assert.equal(buildProtocolEntry({}, NOW).protocolRun.breathingCycles, 0);
  });

  it('tolerates empty text fields', () => {
    const e = buildProtocolEntry({ trigger: null, reflection: undefined }, NOW);
    assert.equal(e.reflection, '');
    assert.equal(e.protocolRun.trigger, '');
  });

  it('falls back to a generated timestamp when nowISO is missing', () => {
    const e = buildProtocolEntry({});
    assert.equal(typeof e.eventOccurredAt, 'string');
    assert.ok(!Number.isNaN(Date.parse(e.eventOccurredAt)));
  });
});
