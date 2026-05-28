import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { computeDepthTrend, DEPTH_TRUST_THRESHOLD } from './computeDepthTrend.js';

const NOW = Date.UTC(2026, 4, 26, 12, 0, 0); // 2026-05-26T12:00:00Z
const DAY = 86400000;

const entry = ({ daysAgo, depth = null } = {}) => ({
  timestamp: NOW - daysAgo * DAY,
  ...(depth ? { metacognitiveDepth: depth } : {}),
});

// Helper to build an evenly-spaced run of entries inside a half-window.
// `halfStartDaysAgo` is the older edge; entries land between it and `endDaysAgo`.
const spread = (depth, count, { from, to }) => {
  const span = to - from;
  return Array.from({ length: count }, (_, i) => {
    const daysAgo = from + (span * i) / Math.max(1, count - 1);
    return entry({ daysAgo, depth });
  });
};

describe('computeDepthTrend — empty / minimal', () => {
  it('returns insufficient + belowTrustThreshold for an empty array', () => {
    const out = computeDepthTrend([], { now: NOW });
    assert.equal(out.classifiedCount, 0);
    assert.equal(out.totalCount, 0);
    assert.equal(out.trajectory, 'insufficient');
    assert.equal(out.belowTrustThreshold, true);
    assert.deepEqual(out.distribution, { Surface: 0, Pattern: 0, Identity: 0 });
  });

  it('tolerates non-array input', () => {
    const out = computeDepthTrend(null, { now: NOW });
    assert.equal(out.trajectory, 'insufficient');
    assert.equal(out.belowTrustThreshold, true);
  });

  it('flags belowTrustThreshold when classified count < DEPTH_TRUST_THRESHOLD', () => {
    const entries = [
      entry({ daysAgo: 1, depth: 'Surface' }),
      entry({ daysAgo: 2, depth: 'Pattern' }),
      entry({ daysAgo: 3, depth: 'Identity' }),
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.classifiedCount, 3);
    assert.ok(out.classifiedCount < DEPTH_TRUST_THRESHOLD);
    assert.equal(out.belowTrustThreshold, true);
  });
});

describe('computeDepthTrend — distribution counting', () => {
  it('counts only classified entries in distribution but tracks totalCount of all in-window entries', () => {
    const entries = [
      entry({ daysAgo: 1, depth: 'Surface' }),
      entry({ daysAgo: 2 }), // no depth — pre-classifier entry
      entry({ daysAgo: 3, depth: 'Pattern' }),
      entry({ daysAgo: 4, depth: 'Identity' }),
      entry({ daysAgo: 5 }), // no depth
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.totalCount, 5);
    assert.equal(out.classifiedCount, 3);
    assert.deepEqual(out.distribution, { Surface: 1, Pattern: 1, Identity: 1 });
  });

  it('excludes unknown depth strings', () => {
    const entries = [
      entry({ daysAgo: 1, depth: 'Surface' }),
      entry({ daysAgo: 2, depth: 'surface' }), // lowercase — invalid
      entry({ daysAgo: 3, depth: 'Deep' }),    // unknown bucket
      entry({ daysAgo: 4, depth: 'Pattern' }),
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.classifiedCount, 2);
    assert.deepEqual(out.distribution, { Surface: 1, Pattern: 1, Identity: 0 });
  });

  it('ignores entries outside the 30-day window', () => {
    const entries = [
      entry({ daysAgo: 5, depth: 'Pattern' }),
      entry({ daysAgo: 35, depth: 'Identity' }), // outside 30d window
      entry({ daysAgo: 100, depth: 'Surface' }),
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.classifiedCount, 1);
    assert.deepEqual(out.distribution, { Surface: 0, Pattern: 1, Identity: 0 });
  });

  it('survives entries with no timestamp without crashing', () => {
    const entries = [
      { metacognitiveDepth: 'Pattern' }, // no timestamp at all
      entry({ daysAgo: 1, depth: 'Surface' }),
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.classifiedCount, 1);
  });
});

describe('computeDepthTrend — trajectory', () => {
  it('returns insufficient when either half-window has < 4 classified entries', () => {
    const entries = [
      ...spread('Pattern', 6, { from: 0.5, to: 13 }), // recent half: 6 entries
      ...spread('Surface', 2, { from: 15, to: 27 }),  // prior half: only 2
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.trajectory, 'insufficient');
  });

  it('labels deepening when (Pattern + Identity) share rises by >= 15pp', () => {
    const entries = [
      // Recent half (0-14d): 4 Identity + 4 Pattern + 2 Surface = 80% deep
      ...spread('Identity', 4, { from: 0.5, to: 6 }),
      ...spread('Pattern', 4, { from: 6.5, to: 12 }),
      ...spread('Surface', 2, { from: 12.5, to: 13 }),
      // Prior half (14-28d): 2 Pattern + 6 Surface = 25% deep
      // Delta = 80 - 25 = 55pp → deepening
      ...spread('Pattern', 2, { from: 15, to: 18 }),
      ...spread('Surface', 6, { from: 19, to: 27 }),
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.trajectory, 'deepening');
  });

  it('labels surfacing when Surface share rises by >= 15pp', () => {
    const entries = [
      // Recent half: 7 Surface + 1 Pattern = 87.5% surface
      ...spread('Surface', 7, { from: 0.5, to: 10 }),
      ...spread('Pattern', 1, { from: 11, to: 13 }),
      // Prior half: 2 Surface + 4 Pattern + 2 Identity = 25% surface
      // Delta = 87.5 - 25 = 62.5pp → surfacing
      ...spread('Surface', 2, { from: 15, to: 17 }),
      ...spread('Pattern', 4, { from: 18, to: 23 }),
      ...spread('Identity', 2, { from: 24, to: 27 }),
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.trajectory, 'surfacing');
  });

  it('labels stable when neither delta crosses 15pp', () => {
    // Both halves: 4 Surface + 2 Pattern + 2 Identity = 50% surface, 50% deep
    const entries = [
      ...spread('Surface', 4, { from: 0.5, to: 6 }),
      ...spread('Pattern', 2, { from: 7, to: 9 }),
      ...spread('Identity', 2, { from: 10, to: 13 }),
      ...spread('Surface', 4, { from: 15, to: 20 }),
      ...spread('Pattern', 2, { from: 21, to: 23 }),
      ...spread('Identity', 2, { from: 24, to: 27 }),
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.trajectory, 'stable');
  });

  it('treats exactly 15pp rise as triggering (>= threshold)', () => {
    // Recent half: 5 Pattern + 5 Surface = 50% deep
    // Prior half: 7 Surface + 1 Pattern + 2 Identity = 30% deep
    // Delta = 50 - 30 = 20pp → deepening (>= 15)
    const entries = [
      ...spread('Pattern', 5, { from: 0.5, to: 6 }),
      ...spread('Surface', 5, { from: 7, to: 13 }),
      ...spread('Surface', 7, { from: 15, to: 21 }),
      ...spread('Pattern', 1, { from: 22, to: 23 }),
      ...spread('Identity', 2, { from: 24, to: 27 }),
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.trajectory, 'deepening');
  });

  it('handles entries with Firestore Timestamp-shaped createdAt', () => {
    const tsAt = (daysAgo) => ({
      toDate: () => new Date(NOW - daysAgo * DAY),
    });
    const entries = [
      { createdAt: tsAt(1), metacognitiveDepth: 'Identity' },
      { createdAt: tsAt(2), metacognitiveDepth: 'Pattern' },
      { createdAt: tsAt(3), metacognitiveDepth: 'Pattern' },
      { createdAt: tsAt(4), metacognitiveDepth: 'Identity' },
      { createdAt: tsAt(16), metacognitiveDepth: 'Surface' },
      { createdAt: tsAt(18), metacognitiveDepth: 'Surface' },
      { createdAt: tsAt(20), metacognitiveDepth: 'Surface' },
      { createdAt: tsAt(22), metacognitiveDepth: 'Surface' },
    ];
    const out = computeDepthTrend(entries, { now: NOW });
    assert.equal(out.classifiedCount, 8);
    assert.equal(out.trajectory, 'deepening');
  });
});
