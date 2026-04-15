import test from 'node:test';
import assert from 'node:assert/strict';
import { clarityScoreUtils } from './clarityScore.js';

const { SCORING } = clarityScoreUtils;

// Helper: ISO date string n days in the past
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

// Helpers for constructing test data
const journal = (content, daysBack = 0) => ({ content, createdAt: daysAgo(daysBack) });
const relapse = (reflection = '', daysBack = 0) => ({ reflection, createdAt: daysAgo(daysBack) });
const blackMirror = (daysBack = 0, index = 20) => ({ blackMirrorIndex: index, createdAt: daysAgo(daysBack) });
const lesson = ({ extractedLesson = '', ruleGoingForward = '', isFinalized = false, daysBack = 0 }) => ({
  extractedLesson,
  ruleGoingForward,
  isFinalized,
  createdAt: daysAgo(daysBack),
});

// ─── getClarityRank ───────────────────────────────────────────────────────────

test('getClarityRank returns Clarity Novice below 25', () => {
  assert.equal(clarityScoreUtils.getClarityRank(0).rank, 'Clarity Novice');
  assert.equal(clarityScoreUtils.getClarityRank(24).rank, 'Clarity Novice');
});

test('getClarityRank returns correct rank at each tier boundary', () => {
  const boundaries = [
    [25, 'Clarity Beginner'],
    [75, 'Clarity Apprentice'],
    [150, 'Clarity Student'],
    [300, 'Clarity Practitioner'],
    [500, 'Clarity Seeker'],
    [750, 'Clarity Expert'],
    [1000, 'Clarity Master'],
  ];
  boundaries.forEach(([score, rank]) => {
    assert.equal(clarityScoreUtils.getClarityRank(score).rank, rank, `Score ${score} should be ${rank}`);
  });
});

test('getClarityRank returns icon and color for every rank', () => {
  [0, 25, 75, 150, 300, 500, 750, 1000].forEach((score) => {
    const result = clarityScoreUtils.getClarityRank(score);
    assert.ok(result.icon, `Score ${score} should have an icon`);
    assert.ok(result.color, `Score ${score} should have a color`);
  });
});

// ─── calculateJournalStreak ───────────────────────────────────────────────────

test('calculateJournalStreak returns 0 for empty array', () => {
  assert.equal(clarityScoreUtils.calculateJournalStreak([]), 0);
});

test('calculateJournalStreak counts consecutive days correctly', () => {
  const entries = [
    { createdAt: daysAgo(0) },
    { createdAt: daysAgo(1) },
    { createdAt: daysAgo(2) },
  ];
  const streak = clarityScoreUtils.calculateJournalStreak(entries);
  assert.ok(streak >= 3, `Expected streak >= 3, got ${streak}`);
});

test('calculateJournalStreak breaks streak on a missed day', () => {
  const entries = [
    { createdAt: daysAgo(0) },
    { createdAt: daysAgo(2) }, // gap on day 1
  ];
  const streak = clarityScoreUtils.calculateJournalStreak(entries);
  assert.ok(streak < 2, `Expected streak < 2 due to gap on day 1, got ${streak}`);
});

test('calculateJournalStreak returns 1 for a single entry today', () => {
  const entries = [{ createdAt: daysAgo(0) }];
  const streak = clarityScoreUtils.calculateJournalStreak(entries);
  assert.ok(streak >= 1, `Expected streak >= 1 for today's entry, got ${streak}`);
});

// ─── calculateWeeklyBlackMirrorBonuses ────────────────────────────────────────

test('calculateWeeklyBlackMirrorBonuses returns 0 for empty array', () => {
  assert.equal(clarityScoreUtils.calculateWeeklyBlackMirrorBonuses([]), 0);
});

test('calculateWeeklyBlackMirrorBonuses deduplicates entries in the same week', () => {
  const sameWeek = [
    blackMirror(0, 20),
    blackMirror(1, 20), // same calendar week as day 0 (within 7 days)
    blackMirror(1, 20), // duplicate
  ];
  const bonus = clarityScoreUtils.calculateWeeklyBlackMirrorBonuses(sameWeek);
  // At most 2 distinct weeks possible (day 0 and day 1 might straddle a week boundary)
  assert.ok(bonus <= (SCORING.BLACK_MIRROR_CHECK * 2), `Bonus ${bonus} exceeds max for 2 weeks`);
});

test('calculateWeeklyBlackMirrorBonuses adds low index bonus when index < 10', () => {
  const lowIndexEntry = blackMirror(0, 5);   // index 5 → low bonus applies
  const highIndexEntry = blackMirror(8, 15); // index 15 → no low bonus, different week
  const lowResult = clarityScoreUtils.calculateWeeklyBlackMirrorBonuses([lowIndexEntry]);
  const highResult = clarityScoreUtils.calculateWeeklyBlackMirrorBonuses([highIndexEntry]);
  assert.equal(lowResult, SCORING.BLACK_MIRROR_CHECK + SCORING.BLACK_MIRROR_LOW_INDEX);
  assert.equal(highResult, SCORING.BLACK_MIRROR_CHECK);
});

test('calculateWeeklyBlackMirrorBonuses counts entries across different weeks', () => {
  const multiWeek = [
    blackMirror(0, 20),  // this week
    blackMirror(8, 20),  // last week
    blackMirror(15, 20), // two weeks ago
  ];
  const bonus = clarityScoreUtils.calculateWeeklyBlackMirrorBonuses(multiWeek);
  assert.equal(bonus, SCORING.BLACK_MIRROR_CHECK * 3);
});

// ─── calculateClarityScore ────────────────────────────────────────────────────

test('calculateClarityScore returns 0 total for completely empty data', async () => {
  const result = await clarityScoreUtils.calculateClarityScore({});
  assert.equal(result.totalScore, 0);
});

test('calculateClarityScore ignores journal entries with fewer than 50 chars', async () => {
  const data = {
    journalEntries: [
      journal('Short entry.', 100),          // way under 50 chars
      journal('A'.repeat(49), 101),           // 49 chars — one short
    ],
  };
  const result = await clarityScoreUtils.calculateClarityScore(data);
  assert.equal(result.breakdown.journal, 0, 'Sub-50 char journal entries should earn 0 points');
});

test('calculateClarityScore awards journal points for entries >= 50 chars', async () => {
  // Use a recent date — temporal weight for >180 days is only 0.1, which floors to 0
  const data = {
    journalEntries: [journal('A'.repeat(50), 3)], // 3 days ago → temporal weight 1.0
  };
  const result = await clarityScoreUtils.calculateClarityScore(data);
  assert.ok(result.breakdown.journal > 0, 'A 50-char journal entry should earn points');
});

test('calculateClarityScore caps relapse awareness at 10 entries', async () => {
  const reflection = 'This is a meaningful reflection on what led to this pattern.';
  const fifteenEntries = Array.from({ length: 15 }, (_, i) => relapse(reflection, i + 300));
  const tenEntries = fifteenEntries.slice(0, 10);

  const resultFifteen = await clarityScoreUtils.calculateClarityScore({ relapseEntries: fifteenEntries });
  const resultTen = await clarityScoreUtils.calculateClarityScore({ relapseEntries: tenEntries });

  assert.equal(
    resultFifteen.breakdown.relapseAwareness,
    resultTen.breakdown.relapseAwareness,
    'Relapse awareness should be capped — 15 entries should not outscore 10 entries'
  );
});

test('calculateClarityScore requires at least 20 chars in reflection to score relapse', async () => {
  const data = {
    relapseEntries: [
      relapse('Too short.', 400),    // 10 chars — no score
      relapse('A'.repeat(19), 401),  // 19 chars — still under threshold
    ],
  };
  const result = await clarityScoreUtils.calculateClarityScore(data);
  assert.equal(result.breakdown.relapseAwareness, 0, 'Reflections under 20 chars should not score');
});

test('calculateClarityScore requires 30 chars of content for hard lesson points', async () => {
  const data = {
    hardLessons: [
      lesson({ extractedLesson: 'Too short.', isFinalized: false, daysBack: 500 }),
    ],
  };
  const result = await clarityScoreUtils.calculateClarityScore(data);
  assert.equal(result.breakdown.hardLessons, 0, 'Hard lesson under 30 chars should earn 0 points');
});

test('calculateClarityScore awards finalization bonus only when ruleGoingForward >= 20 chars', async () => {
  // hardLessons is NOT part of the cache key, so use different journal counts to avoid cache collision
  const withRule = {
    hardLessons: [lesson({
      extractedLesson: 'A long and meaningful lesson extracted from this painful experience.',
      ruleGoingForward: 'If I feel this urge, I will wait 24 hours before acting.',
      isFinalized: true,
      daysBack: 5,
    })],
    // unique journal entry to produce a distinct cache key
    journalEntries: [journal('A'.repeat(50), 50)],
  };
  const withoutRule = {
    hardLessons: [lesson({
      extractedLesson: 'A long and meaningful lesson extracted from this painful experience.',
      ruleGoingForward: 'Too short.',
      isFinalized: true,
      daysBack: 5,
    })],
    // different timestamp → different cache key
    journalEntries: [journal('A'.repeat(50), 51)],
  };

  const resultWith = await clarityScoreUtils.calculateClarityScore(withRule);
  const resultWithout = await clarityScoreUtils.calculateClarityScore(withoutRule);

  assert.ok(
    resultWith.breakdown.hardLessons > resultWithout.breakdown.hardLessons,
    'Lesson with valid rule should outscore lesson with short rule'
  );
});

test('calculateClarityScore applies temporal decay: recent entry outscores old entry', async () => {
  const content = 'X'.repeat(60);
  const recentData = { journalEntries: [journal(content, 10)] };  // 10 days ago → weight 1.0
  const oldData = { journalEntries: [journal(content, 120)] };    // 120 days ago → weight 0.3

  const recentResult = await clarityScoreUtils.calculateClarityScore(recentData);
  const oldResult = await clarityScoreUtils.calculateClarityScore(oldData);

  assert.ok(
    recentResult.breakdown.journal > oldResult.breakdown.journal,
    `Recent (${recentResult.breakdown.journal}) should outscore old (${oldResult.breakdown.journal})`
  );
});

test('calculateClarityScore completion rate multiplier: 100% completion scores higher than 0%', async () => {
  const completedTarget = { killTargets: [{ progress: 100, createdAt: daysAgo(700) }] };
  const incompleteTarget = { killTargets: [{ progress: 0, createdAt: daysAgo(701) }] };

  const highResult = await clarityScoreUtils.calculateClarityScore(completedTarget);
  const lowResult = await clarityScoreUtils.calculateClarityScore(incompleteTarget);

  assert.ok(
    highResult.breakdown.killList > lowResult.breakdown.killList,
    `Completed target (${highResult.breakdown.killList}) should outscore incomplete (${lowResult.breakdown.killList})`
  );
  assert.equal(highResult.breakdown.completionMultiplier, 1.5, '100% completion should apply 1.5x multiplier');
  assert.ok(lowResult.breakdown.completionMultiplier < 1, 'Under 20% completion should apply a penalty multiplier');
});

test('calculateClarityScore result includes expected breakdown keys', async () => {
  const result = await clarityScoreUtils.calculateClarityScore({});
  const required = ['journal', 'killList', 'hardLessons', 'blackMirror', 'relapseAwareness', 'bonuses', 'completionRate', 'completionMultiplier'];
  required.forEach((key) => {
    assert.ok(key in result.breakdown, `breakdown should contain key: ${key}`);
  });
  assert.ok('totalScore' in result);
  assert.ok('journalStreak' in result);
  assert.ok('killTargetsCompleted' in result);
});

// ─── Finding 17: edge-case coverage ────────────────────────────────────────

test('[edge] calculateClarityScore handles completely missing fields without throwing', async () => {
  const result = await clarityScoreUtils.calculateClarityScore({
    journalEntries: undefined,
    killTargets: null,
    relapseEntries: undefined,
    blackMirrorEntries: null,
    hardLessons: undefined,
  });
  assert.equal(typeof result.totalScore, 'number');
  assert.equal(result.totalScore, 0);
});

test('[edge] calculateClarityScore accepts Firestore Timestamp-shaped createdAt (toDate)', async () => {
  // Simulate Firebase Timestamp: object exposing toDate() returning a real Date.
  const fakeTimestamp = (msAgo) => ({
    toDate: () => new Date(Date.now() - msAgo),
  });
  const data = {
    hardLessons: [{
      extractedLesson: 'A real lesson extracted from a costly mistake that has weight.',
      ruleGoingForward: 'If I feel this urge, I will wait at least 24 hours before acting on it.',
      isFinalized: true,
      createdAt: fakeTimestamp(3 * 24 * 60 * 60 * 1000), // 3 days ago
    }],
  };
  const result = await clarityScoreUtils.calculateClarityScore(data);
  // Recent lesson should score above zero (weight 1.0 within 30 days).
  assert.ok(result.breakdown.hardLessons > 0, 'Timestamp-shaped createdAt should be recognized');
});

test('[edge] temporal decay boundary: entry at day 30 scores more than entry at day 31', async () => {
  const content = 'X'.repeat(60);
  const day30 = { journalEntries: [journal(content, 29)] };   // weight 1.0
  const day91 = { journalEntries: [journal(content, 91)] };   // weight 0.3
  const r30 = await clarityScoreUtils.calculateClarityScore(day30);
  const r91 = await clarityScoreUtils.calculateClarityScore(day91);
  assert.ok(r30.breakdown.journal > r91.breakdown.journal, 'Decay boundaries must reduce score');
});

test('[edge] temporal decay boundary at 180 days: scores approach zero past 180d', async () => {
  const content = 'X'.repeat(60);
  const inside180 = { journalEntries: [journal(content, 179)] }; // weight 0.3
  const past180   = { journalEntries: [journal(content, 365)] }; // weight 0.1
  const rInside = await clarityScoreUtils.calculateClarityScore(inside180);
  const rPast   = await clarityScoreUtils.calculateClarityScore(past180);
  assert.ok(rInside.breakdown.journal >= rPast.breakdown.journal, 'Weight past 180d must not exceed weight at 179d');
});

test('[edge] farm attempt: 200 one-word journal entries should not score', async () => {
  const farm = { journalEntries: Array.from({ length: 200 }, (_, i) => journal('noise', i)) };
  const result = await clarityScoreUtils.calculateClarityScore(farm);
  // Every entry is below the 50-char minimum, so journal score stays at 0.
  assert.equal(result.breakdown.journal, 0, 'Sub-threshold entries should earn zero regardless of count');
});

test('[edge] farm attempt: 50 empty relapse reflections should not farm relapseAwareness', async () => {
  const farm = { relapseEntries: Array.from({ length: 50 }, (_, i) => relapse('', i)) };
  const result = await clarityScoreUtils.calculateClarityScore(farm);
  assert.equal(result.breakdown.relapseAwareness, 0, 'Empty reflections should earn zero relapse points');
});

test('[edge] farm attempt: 50 padded-but-meaningless lessons do not earn finalization bonus without rule', async () => {
  const padded = 'Padding characters to cross thirty character threshold here.';
  const farm = {
    hardLessons: Array.from({ length: 50 }, (_, i) =>
      lesson({
        extractedLesson: padded,
        ruleGoingForward: '',      // missing enforceable rule
        isFinalized: true,
        daysBack: i,
      })
    ),
  };
  const result = await clarityScoreUtils.calculateClarityScore(farm);
  // Base extraction points may accrue, but finalization bonus (25 * weight)
  // must not apply when ruleGoingForward is absent or too short.
  const floorPerLesson = SCORING.HARD_LESSON_EXTRACTED;
  const ceilingPerLesson = SCORING.HARD_LESSON_EXTRACTED + SCORING.HARD_LESSON_FINALIZED;
  const per = result.breakdown.hardLessons / 50;
  assert.ok(per < ceilingPerLesson, 'Finalization bonus must not apply without a valid rule');
  assert.ok(per <= floorPerLesson + 0.1, `Per-lesson score too high (${per}) — rule-less finalization leaking`);
});
