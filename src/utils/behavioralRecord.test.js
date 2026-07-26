import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBehavioralRecord } from './behavioralRecord.js';

// Fixed clock so held-days and cadence math are deterministic.
const NOW = Date.parse('2026-07-20T00:00:00Z');
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString();

// ─── empty ────────────────────────────────────────────────────────────────

test('empty inputs → isEmpty with all-zero groups', () => {
  const r = computeBehavioralRecord({}, NOW);
  assert.equal(r.isEmpty, true);
  assert.deepEqual(r.execution, { kills21: 0, kills60: 0, autopsies: 0, rulesHeld: 0, deepEntries: 0 });
  assert.deepEqual(r.intelligence, { briefings: 0, reckonings: 0, contradictions: 0, daysSinceLastBriefing: null });
});

// ─── kills held (tiered) ────────────────────────────────────────────────────

test('kills tiered by realized streak: ≥21 is the full set, ≥60 a strict subset', () => {
  const confirmedKills = [
    { streak: 65 },  // ≥60
    { streak: 90 },  // ≥60
    { streak: 30 },  // ≥21 only
    { streak: 21 },  // ≥21 only
  ];
  const r = computeBehavioralRecord({ confirmedKills }, NOW);
  assert.equal(r.execution.kills21, 4);
  assert.equal(r.execution.kills60, 2);
  assert.equal(r.isEmpty, false);
});

test('kills fall back to completed threshold when streak is missing (legacy)', () => {
  const confirmedKills = [
    { consecutiveDaysRequired: 60 },        // → 60
    { difficulty: 'core' },                 // legacy → 60
    { consecutiveDaysRequired: 21 },        // → 21
  ];
  const r = computeBehavioralRecord({ confirmedKills }, NOW);
  assert.equal(r.execution.kills21, 3);
  assert.equal(r.execution.kills60, 2);
});

test('quick-kill with streak 0 minutes after creation does NOT count as held ≥ threshold', () => {
  // Gameability guard: creating a contract and killing it immediately leaves
  // streak 0 and near-zero calendar age — the threshold fallback must not
  // promote it into the ≥21 census.
  const createdAt = new Date(NOW - 30 * 60000).toISOString(); // 30 minutes old
  const confirmedKills = [
    { streak: 0, createdAt, killedAt: new Date(NOW).toISOString(), consecutiveDaysRequired: 21 },
    { createdAt, killedAt: new Date(NOW).toISOString(), consecutiveDaysRequired: 60 }, // streak absent
  ];
  const r = computeBehavioralRecord({ confirmedKills }, NOW);
  assert.equal(r.execution.kills21, 0);
  assert.equal(r.execution.kills60, 0);
});

test('legitimate old kill with no streak but age ≥ threshold still counts', () => {
  const confirmedKills = [
    // killedAt present, 90-day age supports the 60-day threshold
    { createdAt: daysAgo(92), killedAt: daysAgo(2), consecutiveDaysRequired: 60 },
    // killedAt missing — archivedAt is the kill moment
    { createdAt: daysAgo(40), archivedAt: daysAgo(1), consecutiveDaysRequired: 21 },
    // killedAt/archivedAt missing — timestamp is the kill moment
    { createdAt: daysAgo(40), timestamp: daysAgo(1), consecutiveDaysRequired: 21 },
  ];
  const r = computeBehavioralRecord({ confirmedKills }, NOW);
  assert.equal(r.execution.kills21, 3);
  assert.equal(r.execution.kills60, 1);
});

test('streakless kill younger than its threshold counts only its capped age', () => {
  // 10 days old, 21-day threshold, no streak → held 10, below the ≥21 tier.
  const confirmedKills = [
    { createdAt: daysAgo(10), killedAt: daysAgo(0), consecutiveDaysRequired: 21 },
  ];
  const r = computeBehavioralRecord({ confirmedKills }, NOW);
  assert.equal(r.execution.kills21, 0);
});

test('activeDuration (calendar age) is NEVER used for held tiers', () => {
  // A kill that existed 200 calendar days but was only held 25 consecutive
  // days is a ≥21 kill, NOT a ≥60 kill. Using activeDuration would wrongly
  // promote it.
  const confirmedKills = [{ streak: 25, activeDuration: 200, consecutiveDaysRequired: 21 }];
  const r = computeBehavioralRecord({ confirmedKills }, NOW);
  assert.equal(r.execution.kills21, 1);
  assert.equal(r.execution.kills60, 0);
});

// ─── autopsies & analyses ───────────────────────────────────────────────────

test('autopsies count escape analyses across live + confirmed targets, plus relapse reflections', () => {
  const killTargets = [
    { escapeData: [{ context: 'saw the urge coming' }, { rationalization: 'told myself once' }] },
    { escapeData: [{}] },                       // blank entry — not counted
    { escapeData: [{ prevention: 'delete the app' }] },
  ];
  const confirmedKills = [
    { escapeData: [{ context: 'escaped once before the kill' }] },
  ];
  const relapseEntries = [
    { entryType: 'relapse', reflection: 'went back to the pattern; the trigger was isolation' },
    { entryType: 'relapse', reflection: '   ' },   // blank reflection — not counted
    { entryType: 'signal', reflection: 'early warning only' }, // not an actual relapse
  ];
  const r = computeBehavioralRecord({ killTargets, confirmedKills, relapseEntries }, NOW);
  // 3 escape autopsies (2+0+1 live) + 1 confirmed + 1 relapse analysis = 5
  assert.equal(r.execution.autopsies, 5);
});

// ─── rules finalized & held ─────────────────────────────────────────────────

test('rulesHeld counts finalized+held, excludes under-review and non-finalized', () => {
  const hardLessons = [
    // held: finalized, no unresolved break
    { isFinalized: true, ruleGoingForward: 'send the email first', finalizedAt: daysAgo(30), violations: [] },
    // under review: most-recent break unresolved → held streak 0
    { isFinalized: true, ruleGoingForward: 'no phone in bed', finalizedAt: daysAgo(40),
      violations: [{ date: daysAgo(2) }] },
    // re-affirmed: break resolved → held again from resolvedAt
    { isFinalized: true, ruleGoingForward: 'call back within a day', finalizedAt: daysAgo(50),
      violations: [{ date: daysAgo(10), resolvedAt: daysAgo(5) }] },
    // not finalized
    { isFinalized: false, ruleGoingForward: 'draft rule' },
    // finalized but empty rule text
    { isFinalized: true, ruleGoingForward: '   ' },
  ];
  const r = computeBehavioralRecord({ hardLessons }, NOW);
  assert.equal(r.execution.rulesHeld, 2); // rule 1 and rule 3
});

// ─── deep journal entries ───────────────────────────────────────────────────

test('deepEntries counts Pattern/Identity depth only, all-time', () => {
  const journalEntries = [
    { metacognitiveDepth: 'Identity' },
    { metacognitiveDepth: 'Pattern' },
    { metacognitiveDepth: 'Surface' },   // shallow
    { content: 'no depth field at all' }, // unclassified
    { classification: { status: 'extracted' } }, // classification is NOT depth
  ];
  const r = computeBehavioralRecord({ journalEntries }, NOW);
  assert.equal(r.execution.deepEntries, 2);
});

// ─── intelligence: briefings / reckonings / contradictions / cadence ────────

test('briefings vs reckonings by type; briefings write no type field', () => {
  const syntheses = [
    { generatedAt: daysAgo(3) },                                   // briefing (no type)
    { type: 'synthesis', generatedAt: daysAgo(10) },               // explicit briefing
    { type: 'reckoning', generatedAt: daysAgo(6), meta: { contradictionCount: 4 } },
    { type: 'reckoning', generatedAt: daysAgo(20), meta: { contradictionCount: 3 } },
  ];
  const r = computeBehavioralRecord({ syntheses }, NOW);
  assert.equal(r.intelligence.briefings, 2);
  assert.equal(r.intelligence.reckonings, 2);
  assert.equal(r.intelligence.contradictions, 7);   // 4 + 3
  assert.equal(r.intelligence.daysSinceLastBriefing, 3); // most recent generatedAt
});

test('contradictions tolerates reckonings missing meta', () => {
  const syntheses = [
    { type: 'reckoning', generatedAt: daysAgo(1) },                // no meta
    { type: 'reckoning', generatedAt: daysAgo(2), meta: {} },      // no count
    { type: 'reckoning', generatedAt: daysAgo(3), meta: { contradictionCount: 5 } },
  ];
  const r = computeBehavioralRecord({ syntheses }, NOW);
  assert.equal(r.intelligence.contradictions, 5);
});

test('cadence is null with no syntheses, and syntheses alone make the record non-empty', () => {
  const empty = computeBehavioralRecord({}, NOW);
  assert.equal(empty.intelligence.daysSinceLastBriefing, null);

  const withBriefing = computeBehavioralRecord({ syntheses: [{ generatedAt: daysAgo(0) }] }, NOW);
  assert.equal(withBriefing.intelligence.daysSinceLastBriefing, 0);
  assert.equal(withBriefing.isEmpty, false);
});

test('malformed inputs never throw', () => {
  assert.doesNotThrow(() => computeBehavioralRecord({
    confirmedKills: [null, {}, { streak: 'x' }],
    hardLessons: [null, {}],
    journalEntries: [null, {}],
    relapseEntries: [null, { entryType: 'relapse' }],
    syntheses: [null, {}, { type: 'reckoning', meta: null }],
  }, NOW));
});
