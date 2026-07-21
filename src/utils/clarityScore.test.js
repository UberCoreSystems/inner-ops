import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getConfrontationRate,
  getActiveDriftSignals,
  getRuleIntegrityStatus,
  composeSignalReport,
  clarityScoreUtils,
} from './clarityScore.js';

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

/**
 * Build a fake readUserData that pulls from an in-memory collection map.
 * This mirrors Firestore's per-collection shape without needing emulator/mocks.
 */
const makeReader = (collections) => async (name) => collections[name] || [];

const emptyCollections = () => ({
  journalEntries: [],
  killTargets: [],
  hardLessons: [],
  relapseEntries: [],
});

// ─── getConfrontationRate ─────────────────────────────────────────────────────

test('getConfrontationRate returns null percentage when no Oracle interactions exist', async () => {
  const collections = emptyCollections();
  collections.journalEntries = [
    { createdAt: daysAgo(1), content: 'no oracle here' },
    { createdAt: daysAgo(2), content: 'still none' },
  ];
  const result = await getConfrontationRate('u1', 14, { readUserData: makeReader(collections) });
  assert.equal(result.percentage, null);
  assert.equal(result.engagedCount, 0);
  assert.equal(result.dismissedCount, 0);
});

test('getConfrontationRate counts entries with oracleFeedback as engaged', async () => {
  const collections = emptyCollections();
  collections.journalEntries = [
    { createdAt: daysAgo(1), oracleFeedback: 'some feedback' },
    { createdAt: daysAgo(3), oracleFeedback: 'more feedback' },
  ];
  collections.hardLessons = [
    { createdAt: daysAgo(2), oracleFeedback: 'lesson oracle' },
  ];
  const result = await getConfrontationRate('u1', 14, { readUserData: makeReader(collections) });
  assert.equal(result.engagedCount, 3);
  assert.equal(result.dismissedCount, 0);
  assert.equal(result.percentage, 100);
});

test('getConfrontationRate separates engaged from dismissed', async () => {
  const collections = emptyCollections();
  collections.journalEntries = [
    { createdAt: daysAgo(1), oracleFeedback: 'x', oracleEngaged: true },
    { createdAt: daysAgo(2), oracleFeedback: 'y', oracleDismissed: true },
    { createdAt: daysAgo(3), oracleFeedback: 'z', oracleDismissed: true },
  ];
  const result = await getConfrontationRate('u1', 14, { readUserData: makeReader(collections) });
  assert.equal(result.engagedCount, 1);
  assert.equal(result.dismissedCount, 2);
  assert.equal(result.percentage, 33); // 1 of 3
});

test('getConfrontationRate ignores entries outside the window', async () => {
  const collections = emptyCollections();
  collections.journalEntries = [
    { createdAt: daysAgo(100), oracleFeedback: 'way old', oracleEngaged: true },
    { createdAt: daysAgo(1), oracleFeedback: 'recent', oracleEngaged: true },
  ];
  const result = await getConfrontationRate('u1', 14, { readUserData: makeReader(collections) });
  assert.equal(result.engagedCount, 1, 'old entries must not count');
});

test('getConfrontationRate respects custom windowDays', async () => {
  const collections = emptyCollections();
  collections.journalEntries = [
    { createdAt: daysAgo(20), oracleFeedback: 'x', oracleEngaged: true },
  ];
  const reader = makeReader(collections);
  const tight = await getConfrontationRate('u1', 14, { readUserData: reader });
  const loose = await getConfrontationRate('u1', 30, { readUserData: reader });
  assert.equal(tight.engagedCount, 0);
  assert.equal(loose.engagedCount, 1);
});

// ─── getActiveDriftSignals ────────────────────────────────────────────────────

test('getActiveDriftSignals returns the detector output array', async () => {
  const collections = emptyCollections();
  const stub = {
    signals: [{ type: 'archetype_frequency', description: 'Drift signal: avoider active' }],
    skippedCount: 0,
  };
  const result = await getActiveDriftSignals('u1', {
    readUserData: makeReader(collections),
    detectDriftSignals: () => stub,
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].type, 'archetype_frequency');
});

test('getActiveDriftSignals returns [] when detector finds nothing', async () => {
  const result = await getActiveDriftSignals('u1', {
    readUserData: makeReader(emptyCollections()),
    detectDriftSignals: () => ({ signals: [], skippedCount: 0 }),
  });
  assert.deepEqual(result, []);
});

test('getActiveDriftSignals passes relapse and kill-target data to detector', async () => {
  const collections = emptyCollections();
  collections.relapseEntries = [{ id: 'r1' }];
  collections.killTargets = [{ id: 'k1' }];
  const calls = [];
  await getActiveDriftSignals('u1', {
    readUserData: makeReader(collections),
    detectDriftSignals: (relapse, kills) => {
      calls.push({ relapse, kills });
      return { signals: [], skippedCount: 0 };
    },
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].relapse, [{ id: 'r1' }]);
  assert.deepEqual(calls[0].kills, [{ id: 'k1' }]);
});

// ─── getRuleIntegrityStatus ───────────────────────────────────────────────────

test('getRuleIntegrityStatus counts only finalized lessons with a non-empty rule', async () => {
  const collections = emptyCollections();
  collections.hardLessons = [
    { isFinalized: true, ruleGoingForward: 'Wait 24h before acting.' },
    { isFinalized: true, ruleGoingForward: '' },            // excluded — empty rule
    { isFinalized: false, ruleGoingForward: 'Not final.' }, // excluded — draft
    { isFinalized: true, ruleGoingForward: 'No social media in bed.' },
  ];
  const result = await getRuleIntegrityStatus('u1', 30, { readUserData: makeReader(collections) });
  assert.equal(result.finalizedRuleCount, 2);
  assert.equal(result.violatedInWindow, 0);
});

test('getRuleIntegrityStatus counts violations inside the window', async () => {
  const collections = emptyCollections();
  collections.hardLessons = [
    {
      isFinalized: true,
      ruleGoingForward: 'Never respond to that kind of email angry.',
      violations: [{ date: daysAgo(5) }, { date: daysAgo(200) }],
    },
    {
      isFinalized: true,
      ruleGoingForward: 'No phone during dinner.',
      lastViolatedAt: daysAgo(10),
    },
    {
      isFinalized: true,
      ruleGoingForward: 'Exercise before noon.',
      lastViolatedAt: daysAgo(200), // outside window
    },
  ];
  const result = await getRuleIntegrityStatus('u1', 30, { readUserData: makeReader(collections) });
  assert.equal(result.finalizedRuleCount, 3);
  assert.equal(result.violatedInWindow, 2);
});

test('getRuleIntegrityStatus handles empty collection', async () => {
  const result = await getRuleIntegrityStatus('u1', 30, { readUserData: makeReader(emptyCollections()) });
  assert.deepEqual(result, { finalizedRuleCount: 0, violatedInWindow: 0 });
});

// ─── composeSignalReport ──────────────────────────────────────────────────────

test('composeSignalReport returns structured report with all three readers', async () => {
  const collections = emptyCollections();
  collections.journalEntries = [{ createdAt: daysAgo(1), oracleFeedback: 'x', oracleEngaged: true }];
  collections.hardLessons = [{ isFinalized: true, ruleGoingForward: 'A rule.' }];
  const stub = { signals: [{ type: 'precursor_pattern' }], skippedCount: 0 };

  const report = await composeSignalReport('u1', {
    readUserData: makeReader(collections),
    detectDriftSignals: () => stub,
  });

  assert.ok('confrontationRate' in report);
  assert.ok('driftSignals' in report);
  assert.ok('ruleIntegrity' in report);
  assert.ok('generatedAt' in report);

  assert.equal(report.confrontationRate.engagedCount, 1);
  assert.equal(report.driftSignals[0].type, 'precursor_pattern');
  assert.equal(report.ruleIntegrity.finalizedRuleCount, 1);
  // generatedAt should be a parseable ISO string
  assert.ok(!Number.isNaN(new Date(report.generatedAt).getTime()));
});

test('composeSignalReport returns null percentage when no Oracle interactions', async () => {
  const report = await composeSignalReport('u1', {
    readUserData: makeReader(emptyCollections()),
    detectDriftSignals: () => ({ signals: [], skippedCount: 0 }),
  });
  assert.equal(report.confrontationRate.percentage, null);
});

// ─── Prior-window trajectory deltas ───────────────────────────────────────────

test('getConfrontationRate returns prior window when compareToPrior is true (improving)', async () => {
  const collections = emptyCollections();
  // Current window (0–14d): 3 engaged, 0 dismissed → 100%
  collections.journalEntries = [
    { createdAt: daysAgo(1), oracleFeedback: 'a', oracleEngaged: true },
    { createdAt: daysAgo(4), oracleFeedback: 'b', oracleEngaged: true },
    { createdAt: daysAgo(10), oracleFeedback: 'c', oracleEngaged: true },
    // Prior window (14–28d): 1 engaged, 2 dismissed → 33%
    { createdAt: daysAgo(16), oracleFeedback: 'd', oracleEngaged: true },
    { createdAt: daysAgo(20), oracleFeedback: 'e', oracleDismissed: true },
    { createdAt: daysAgo(24), oracleFeedback: 'f', oracleDismissed: true },
  ];
  const result = await getConfrontationRate('u1', 14, {
    readUserData: makeReader(collections),
    compareToPrior: true,
  });
  assert.equal(result.percentage, 100);
  assert.equal(result.engagedCount, 3);
  assert.ok(result.prior, 'prior field must be present when compareToPrior is true');
  assert.equal(result.prior.percentage, 33);
  assert.equal(result.prior.engagedCount, 1);
  assert.equal(result.prior.dismissedCount, 2);
});

test('getConfrontationRate prior returns null percentage when prior window is empty', async () => {
  const collections = emptyCollections();
  // Only current-window data. Prior window has nothing.
  collections.journalEntries = [
    { createdAt: daysAgo(2), oracleFeedback: 'x', oracleEngaged: true },
  ];
  const result = await getConfrontationRate('u1', 14, {
    readUserData: makeReader(collections),
    compareToPrior: true,
  });
  assert.equal(result.percentage, 100);
  assert.equal(result.prior.percentage, null, 'empty prior window → null percentage → UI omits delta');
});

test('getConfrontationRate omits prior field when compareToPrior is false (backward compat)', async () => {
  const collections = emptyCollections();
  collections.journalEntries = [
    { createdAt: daysAgo(2), oracleFeedback: 'x', oracleEngaged: true },
    { createdAt: daysAgo(20), oracleFeedback: 'y', oracleEngaged: true },
  ];
  const result = await getConfrontationRate('u1', 14, { readUserData: makeReader(collections) });
  assert.equal(result.prior, undefined, 'no prior field by default');
});

test('getRuleIntegrityStatus returns priorViolatedInWindow when compareToPrior is true (regressing)', async () => {
  const collections = emptyCollections();
  collections.hardLessons = [
    {
      isFinalized: true,
      ruleGoingForward: 'Rule A',
      violations: [
        { date: daysAgo(5) },    // current window
        { date: daysAgo(20) },   // prior window
        { date: daysAgo(45) },   // neither
      ],
    },
    {
      isFinalized: true,
      ruleGoingForward: 'Rule B',
      violations: [{ date: daysAgo(10) }], // current window
    },
    {
      isFinalized: true,
      ruleGoingForward: 'Rule C',
      violations: [{ date: daysAgo(22) }], // prior window only
    },
  ];
  const result = await getRuleIntegrityStatus('u1', 14, {
    readUserData: makeReader(collections),
    compareToPrior: true,
  });
  assert.equal(result.finalizedRuleCount, 3);
  assert.equal(result.violatedInWindow, 2);      // A + B
  assert.equal(result.priorViolatedInWindow, 2); // A + C
});

test('getRuleIntegrityStatus omits priorViolatedInWindow by default', async () => {
  const collections = emptyCollections();
  collections.hardLessons = [{ isFinalized: true, ruleGoingForward: 'R' }];
  const result = await getRuleIntegrityStatus('u1', 30, { readUserData: makeReader(collections) });
  assert.equal(result.priorViolatedInWindow, undefined);
});

test('getActiveDriftSignals returns priorSignalCount when compareToPrior is true', async () => {
  const collections = emptyCollections();
  // Stub the detector so we don't have to satisfy the real streak thresholds.
  // First call is against the full dataset, second is against the prior-window
  // subset (filtered by the reader). We return more signals for the full set.
  const calls = [];
  const detectStub = (relapse) => {
    calls.push(relapse.length);
    if (calls.length === 1) {
      return { signals: [{ type: 'archetype_frequency' }], skippedCount: 0 };
    }
    return { signals: [{ type: 'precursor_pattern' }, { type: 'life_transition' }], skippedCount: 0 };
  };
  collections.relapseEntries = [
    { id: 'r1', timestamp: Date.now() - 2 * 24 * 60 * 60 * 1000 },
    { id: 'r2', timestamp: Date.now() - 20 * 24 * 60 * 60 * 1000 },
  ];
  const result = await getActiveDriftSignals('u1', {
    readUserData: makeReader(collections),
    detectDriftSignals: detectStub,
    compareToPrior: true,
    windowDays: 14,
  });
  assert.ok(Array.isArray(result.signals));
  assert.equal(result.signals.length, 1);
  assert.equal(result.priorSignalCount, 2);
  assert.equal(calls.length, 2, 'detector should run twice — current and prior windows');
});

test('getActiveDriftSignals returns bare array when compareToPrior is false', async () => {
  const result = await getActiveDriftSignals('u1', {
    readUserData: makeReader(emptyCollections()),
    detectDriftSignals: () => ({ signals: [{ type: 'archetype_frequency' }], skippedCount: 0 }),
  });
  assert.ok(Array.isArray(result), 'backward-compat bare-array return');
  assert.equal(result.length, 1);
});

test('composeSignalReport opts into prior-window deltas by default', async () => {
  const collections = emptyCollections();
  collections.journalEntries = [
    { createdAt: daysAgo(1), oracleFeedback: 'x', oracleEngaged: true },
    { createdAt: daysAgo(20), oracleFeedback: 'y', oracleDismissed: true },
  ];
  collections.hardLessons = [
    { isFinalized: true, ruleGoingForward: 'R', violations: [{ date: daysAgo(5) }, { date: daysAgo(40) }] },
  ];
  const report = await composeSignalReport('u1', {
    readUserData: makeReader(collections),
    detectDriftSignals: () => ({ signals: [], skippedCount: 0 }),
  });
  assert.ok(report.confrontationRate.prior, 'default compareToPrior=true');
  assert.equal(report.confrontationRate.percentage, 100);
  assert.equal(report.confrontationRate.prior.percentage, 0);
  assert.equal(typeof report.priorDriftSignalCount, 'number');
  assert.equal(report.ruleIntegrity.priorViolatedInWindow, 1);
});

test('composeSignalReport with compareToPrior: false returns legacy shape', async () => {
  const report = await composeSignalReport('u1', {
    readUserData: makeReader(emptyCollections()),
    detectDriftSignals: () => ({ signals: [], skippedCount: 0 }),
    compareToPrior: false,
  });
  assert.equal(report.confrontationRate.prior, undefined);
  assert.equal(report.ruleIntegrity.priorViolatedInWindow, undefined);
  assert.equal(report.priorDriftSignalCount, undefined);
  assert.ok(Array.isArray(report.driftSignals));
});

test('trajectory delta: prior and current identical — delta clause omitted by UI', async () => {
  // This test validates the shape the component uses to decide omission.
  // SignalReport.formatDeltaClause returns '' when current === prior.
  const collections = emptyCollections();
  collections.journalEntries = [
    { createdAt: daysAgo(2), oracleFeedback: 'a', oracleEngaged: true },
    { createdAt: daysAgo(20), oracleFeedback: 'b', oracleEngaged: true },
  ];
  const result = await getConfrontationRate('u1', 14, {
    readUserData: makeReader(collections),
    compareToPrior: true,
  });
  assert.equal(result.percentage, 100);
  assert.equal(result.prior.percentage, 100, 'identical → UI omits delta clause');
});

// ─── Legacy compatibility shim ────────────────────────────────────────────────

test('clarityScoreUtils shim exposes only non-numeric, report-shaped helpers', () => {
  // Must NOT export anything that returns a number or a rank.
  assert.ok(typeof clarityScoreUtils.composeSignalReport === 'function');
  assert.ok(typeof clarityScoreUtils.getConfrontationRate === 'function');
  assert.ok(typeof clarityScoreUtils.getActiveDriftSignals === 'function');
  assert.ok(typeof clarityScoreUtils.getRuleIntegrityStatus === 'function');

  assert.equal(clarityScoreUtils.calculateClarityScore, undefined, 'numeric score must not exist');
  assert.equal(clarityScoreUtils.getClarityRank, undefined, 'rank system must not exist');
  assert.equal(clarityScoreUtils.SCORING, undefined, 'scoring constants must not exist');
  assert.equal(clarityScoreUtils.calculateJournalStreak, undefined, 'streak scoring must not exist');
});
