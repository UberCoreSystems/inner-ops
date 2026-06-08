import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { composeSeededPreview } from './composeSeededPreview.js';

// Markers that would only appear if the preview FABRICATED observed metrics.
// User-typed content in the fixtures deliberately avoids these so any match
// means the util invented a number/observation it has no data for.
const FABRICATION_MARKERS = [
  /escapes?\b/i,
  /violated/i,
  /untouched/i,
  /this week/i,
  /\bin \d+\s*d\b/i,
  /streak/i,
  /held this week/i,
  /relapses?\b/i,
];

const assertNoFabrication = (result) => {
  const blob = [
    ...(result.lines || []),
    result.direction || '',
    result.driverLine || '',
    result.firstQuestion || '',
    ...(result.watchFor || []),
    ...(result.situations || []),
  ].join(' \n ');
  for (const re of FABRICATION_MARKERS) {
    assert.ok(!re.test(blob), `fabrication marker ${re} found in seeded preview output: ${blob}`);
  }
};

describe('composeSeededPreview', () => {
  it('full onboarding → seeded, reflects only real answers', () => {
    const profile = {
      focusStatement: 'Stop numbing discomfort with distraction',
      primaryDriver: 'addiction',
      knownTriggers: ['Alone after 11pm', 'After conflict'],
      activeSituations: ['Career transition'],
      confrontationCriteria: [
        { archetypeName: 'The Addict', threshold: 2, periodDays: 30, question: 'What are you running from right now?' },
      ],
    };
    const r = composeSeededPreview(profile);
    assert.equal(r.status, 'seeded');
    assert.equal(r.direction, 'Stop numbing discomfort with distraction');
    assert.equal(r.firstQuestion, 'What are you running from right now?');
    assert.deepEqual(r.watchFor, ['Alone after 11pm', 'After conflict']);
    assert.deepEqual(r.situations, ['Career transition']);
    assert.equal(r.routeHint, null);
    // archetype label is resolved, not the raw id
    assert.ok(r.lines.some((l) => /Craving \/ Urge/.test(l)));
    assertNoFabrication(r);
  });

  it('null profile → empty start-here, never fabricated', () => {
    const r = composeSeededPreview(null);
    assert.equal(r.status, 'empty');
    assert.equal(r.direction, null);
    assert.ok(r.routeHint && r.routeHint.to === '/ledger');
    assert.ok(r.lines.length === 1 && /Nothing declared yet/.test(r.lines[0]));
    assertNoFabrication(r);
  });

  it('empty object profile → empty', () => {
    const r = composeSeededPreview({});
    assert.equal(r.status, 'empty');
    assert.equal(r.routeHint.label, 'Name your first target');
    assertNoFabrication(r);
  });

  it('partial (no focus statement, has triggers only) → partial, no fabricated direction', () => {
    const r = composeSeededPreview({ knownTriggers: ['Long weekends'] });
    assert.equal(r.status, 'partial');
    assert.equal(r.direction, null);
    assert.deepEqual(r.watchFor, ['Long weekends']);
    assert.equal(r.firstQuestion, null);
    assertNoFabrication(r);
  });

  it('driver-only → partial, driver line present, no invented direction', () => {
    const r = composeSeededPreview({ primaryDriver: 'clarity' });
    assert.equal(r.status, 'partial');
    assert.equal(r.direction, null);
    assert.ok(/building mental clarity and discipline/.test(r.driverLine));
    assertNoFabrication(r);
  });

  it('unknown driver is ignored (no garbage line)', () => {
    const r = composeSeededPreview({ primaryDriver: 'not-a-real-driver', focusStatement: 'x focus' });
    assert.equal(r.driverLine, null);
    assert.equal(r.status, 'seeded');
  });

  it('whitespace-only fields are treated as empty', () => {
    const r = composeSeededPreview({ focusStatement: '   ', knownTriggers: ['  ', ''], confrontationCriteria: [{ question: '   ' }] });
    assert.equal(r.status, 'empty');
    assert.deepEqual(r.watchFor, []);
    assert.equal(r.firstQuestion, null);
  });

  it('confrontation criterion without a question is skipped', () => {
    const r = composeSeededPreview({
      focusStatement: 'focus here',
      confrontationCriteria: [{ archetypeName: 'The Victim', threshold: 2 }],
    });
    assert.equal(r.firstQuestion, null);
    assert.equal(r.status, 'seeded');
  });

  it('is deterministic', () => {
    const profile = { focusStatement: 'a', primaryDriver: 'becoming', knownTriggers: ['t1'] };
    assert.deepEqual(composeSeededPreview(profile), composeSeededPreview(profile));
  });
});
