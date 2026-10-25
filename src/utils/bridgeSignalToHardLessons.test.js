import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  HL_BRIDGE_PREFILL_KEY,
  buildSignalLessonPrefill,
  bridgeSignalToHardLessons,
} from './bridgeSignalToHardLessons.js';
import { ARCHETYPE_IDS, resolveArchetypeLabel } from './relapseTaxonomy.js';

const archetypeId = ARCHETYPE_IDS[0];
const archetypeLabel = resolveArchetypeLabel(archetypeId);

describe('buildSignalLessonPrefill', () => {
  it('leads with the archetype, then the conditions, then his words', () => {
    const prefill = buildSignalLessonPrefill({
      id: 'sig-1',
      selectedSelf: archetypeId,
      precursorConditions: ['Isolated', ' High stress ', ''],
      reflection: '  Third night alone. Started rationalizing.  ',
    });
    assert.equal(
      prefill.eventDescription,
      `${archetypeLabel} — conditions: Isolated, High stress. Third night alone. Started rationalizing.`
    );
    assert.equal(prefill.sourceSignalId, 'sig-1');
  });

  it('a Protocol run with no archetype leads with the run', () => {
    const prefill = buildSignalLessonPrefill({
      id: 'p1',
      selectedSelf: '',
      precursorConditions: [],
      reflection: 'wanted to disappear',
      protocolRun: { intensity: 8, trigger: 'the call', toolsUsed: ['breathing'], breathingCycles: 4 },
    });
    assert.equal(prefill.eventDescription, 'Protocol run. wanted to disappear');
  });

  it('his words alone when nothing else is on the signal', () => {
    const prefill = buildSignalLessonPrefill({ id: 'x', reflection: 'just the text' });
    assert.equal(prefill.eventDescription, 'just the text');
  });

  it('an empty signal yields an empty description and no source id', () => {
    assert.deepEqual(buildSignalLessonPrefill({}), { eventDescription: '' });
    assert.deepEqual(buildSignalLessonPrefill(null), { eventDescription: '' });
  });
});

describe('bridgeSignalToHardLessons', () => {
  const original = globalThis.sessionStorage;
  afterEach(() => {
    if (original === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = original;
  });

  it('stashes the prefill under the key HardLessons consumes', () => {
    const store = {};
    globalThis.sessionStorage = { setItem: (k, v) => { store[k] = v; } };
    const signal = { id: 'sig-2', selectedSelf: archetypeId, precursorConditions: ['Craving'], reflection: 'late' };
    const returned = bridgeSignalToHardLessons(signal);
    assert.deepEqual(JSON.parse(store[HL_BRIDGE_PREFILL_KEY]), buildSignalLessonPrefill(signal));
    assert.deepEqual(returned, buildSignalLessonPrefill(signal));
  });

  it('swallows storage failures and still returns the payload', () => {
    globalThis.sessionStorage = { setItem: () => { throw new Error('quota'); } };
    assert.doesNotThrow(() => bridgeSignalToHardLessons({ id: 's', reflection: 'r' }));
    assert.equal(bridgeSignalToHardLessons({ id: 's', reflection: 'r' }).eventDescription, 'r');
  });

  it('survives a runtime with no sessionStorage at all', () => {
    delete globalThis.sessionStorage;
    assert.doesNotThrow(() => bridgeSignalToHardLessons({ id: 's', reflection: 'r' }));
  });
});
