import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { composeJournalSignal } from './composeJournalSignal.js';

const NOW = Date.UTC(2026, 4, 27, 12, 0, 0); // 2026-05-27T12:00:00Z (Wednesday)
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Each entry "i hours ago" so they all fall in the last 7 entries when needed
// without colliding on the same day in cluster tests.
const entry = ({ hoursAgo, mood }) => ({
  timestamp: NOW - hoursAgo * HOUR,
  mood,
});

describe('composeJournalSignal — empty / minimal', () => {
  it('returns both null for empty input', () => {
    assert.deepEqual(composeJournalSignal([], { now: NOW }), {
      takeaway: null,
      cluster: null,
    });
  });

  it('tolerates non-array input', () => {
    assert.deepEqual(composeJournalSignal(null, { now: NOW }), {
      takeaway: null,
      cluster: null,
    });
  });

  it('returns null takeaway when fewer than 5 entries exist', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'heavy' }),
      entry({ hoursAgo: 2, mood: 'foggy' }),
      entry({ hoursAgo: 3, mood: 'hollow' }),
      entry({ hoursAgo: 4, mood: 'chaotic' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, null);
  });

  it('drops entries with no timestamp without crashing', () => {
    const entries = [
      { mood: 'heavy' }, // no timestamp at all
      entry({ hoursAgo: 1, mood: 'foggy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, null);
    assert.equal(out.cluster, null);
  });

  it('ignores entries with timestamps in the future', () => {
    const entries = [
      { timestamp: NOW + 10 * HOUR, mood: 'heavy' },
      entry({ hoursAgo: 1, mood: 'foggy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, null);
  });
});

describe('composeJournalSignal — predominance', () => {
  it('returns predominantly challenged when 5+ of last 7 are challenged', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'heavy' }),
      entry({ hoursAgo: 2, mood: 'foggy' }),
      entry({ hoursAgo: 3, mood: 'hollow' }),
      entry({ hoursAgo: 4, mood: 'chaotic' }),
      entry({ hoursAgo: 5, mood: 'heavy' }),
      entry({ hoursAgo: 6, mood: 'focused' }),
      entry({ hoursAgo: 7, mood: 'sharp' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, 'Predominantly challenged. 5 of last 7 are negative.');
  });

  it('returns predominantly grounded when 5+ of last 7 are grounded', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'focused' }),
      entry({ hoursAgo: 2, mood: 'sharp' }),
      entry({ hoursAgo: 3, mood: 'steady' }),
      entry({ hoursAgo: 4, mood: 'calm' }),
      entry({ hoursAgo: 5, mood: 'focused' }),
      entry({ hoursAgo: 6, mood: 'heavy' }),
      entry({ hoursAgo: 7, mood: 'electric' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, 'Predominantly grounded. 5 of last 7 are neutral.');
  });

  it('returns predominantly energized when 5+ of last 7 are energized', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'electric' }),
      entry({ hoursAgo: 2, mood: 'light' }),
      entry({ hoursAgo: 3, mood: 'radiant' }),
      entry({ hoursAgo: 4, mood: 'triumphant' }),
      entry({ hoursAgo: 5, mood: 'electric' }),
      entry({ hoursAgo: 6, mood: 'heavy' }),
      entry({ hoursAgo: 7, mood: 'focused' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, 'Predominantly energized. 5 of last 7 are positive.');
  });

  it('returns null takeaway when no category hits the threshold (tie / mixed)', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'heavy' }),
      entry({ hoursAgo: 2, mood: 'foggy' }),
      entry({ hoursAgo: 3, mood: 'focused' }),
      entry({ hoursAgo: 4, mood: 'sharp' }),
      entry({ hoursAgo: 5, mood: 'electric' }),
      entry({ hoursAgo: 6, mood: 'light' }),
      entry({ hoursAgo: 7, mood: 'heavy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, null);
  });

  it('only considers the most recent 7 entries (ignores older entries even if they would flip the count)', () => {
    const entries = [
      // Last 7 entries: 5 energized + 2 mixed
      entry({ hoursAgo: 1, mood: 'electric' }),
      entry({ hoursAgo: 2, mood: 'light' }),
      entry({ hoursAgo: 3, mood: 'radiant' }),
      entry({ hoursAgo: 4, mood: 'triumphant' }),
      entry({ hoursAgo: 5, mood: 'electric' }),
      entry({ hoursAgo: 6, mood: 'heavy' }),
      entry({ hoursAgo: 7, mood: 'focused' }),
      // Older entries (would dominate if counted)
      entry({ hoursAgo: 30, mood: 'heavy' }),
      entry({ hoursAgo: 31, mood: 'foggy' }),
      entry({ hoursAgo: 32, mood: 'hollow' }),
      entry({ hoursAgo: 33, mood: 'chaotic' }),
      entry({ hoursAgo: 34, mood: 'heavy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, 'Predominantly energized. 5 of last 7 are positive.');
  });
});

describe('composeJournalSignal — cluster', () => {
  it('returns null cluster when no 3-in-a-row exists', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'heavy' }),
      entry({ hoursAgo: 2, mood: 'foggy' }),
      entry({ hoursAgo: 3, mood: 'heavy' }),
      entry({ hoursAgo: 4, mood: 'chaotic' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.cluster, null);
  });

  it('returns a cluster string when 3+ consecutive entries share a mood', () => {
    // Day-name range is computed in local time, so assert on structure
    // rather than exact weekday tokens (test machine timezone-independent).
    const entries = [
      entry({ hoursAgo: 24, mood: 'foggy' }),
      entry({ hoursAgo: 48, mood: 'foggy' }),
      entry({ hoursAgo: 72, mood: 'foggy' }),
      entry({ hoursAgo: 96, mood: 'heavy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.match(
      out.cluster,
      /^Cluster: 3 consecutive 'foggy' entries (Sun|Mon|Tue|Wed|Thu|Fri|Sat)(-(Sun|Mon|Tue|Wed|Thu|Fri|Sat))?\.$/,
    );
  });

  it('uses the longest run when multiple clusters exist', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'heavy' }),
      entry({ hoursAgo: 2, mood: 'heavy' }),
      entry({ hoursAgo: 3, mood: 'heavy' }),
      // gap
      entry({ hoursAgo: 24, mood: 'foggy' }),
      entry({ hoursAgo: 48, mood: 'foggy' }),
      entry({ hoursAgo: 72, mood: 'foggy' }),
      entry({ hoursAgo: 96, mood: 'foggy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.match(
      out.cluster,
      /^Cluster: 4 consecutive 'foggy' entries (Sun|Mon|Tue|Wed|Thu|Fri|Sat)(-(Sun|Mon|Tue|Wed|Thu|Fri|Sat))?\.$/,
    );
  });

  it('shows a single weekday when the cluster falls on one calendar day', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'foggy' }),
      entry({ hoursAgo: 2, mood: 'foggy' }),
      entry({ hoursAgo: 3, mood: 'foggy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    // All three within 3h of NOW → same local day, no range.
    assert.match(
      out.cluster,
      /^Cluster: 3 consecutive 'foggy' entries (Sun|Mon|Tue|Wed|Thu|Fri|Sat)\.$/,
    );
  });

  it('ignores legacy mood values not in the current taxonomy', () => {
    // Real-world case: 6 historical entries with mood 'happy' (a vocabulary
    // that no longer exists) must not be reported as a cluster.
    const entries = [
      entry({ hoursAgo: 1, mood: 'happy' }),
      entry({ hoursAgo: 24, mood: 'happy' }),
      entry({ hoursAgo: 48, mood: 'happy' }),
      entry({ hoursAgo: 72, mood: 'happy' }),
      entry({ hoursAgo: 96, mood: 'happy' }),
      entry({ hoursAgo: 120, mood: 'happy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.cluster, null);
  });

  it('does not bridge a valid-mood run across a legacy mood', () => {
    // Two valid 'foggy' entries on either side of an unknown 'happy' must
    // not be merged into a single 4-entry foggy cluster.
    const entries = [
      entry({ hoursAgo: 1, mood: 'foggy' }),
      entry({ hoursAgo: 24, mood: 'foggy' }),
      entry({ hoursAgo: 48, mood: 'happy' }),
      entry({ hoursAgo: 72, mood: 'foggy' }),
      entry({ hoursAgo: 96, mood: 'foggy' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.cluster, null);
  });

  it('handles Firestore Timestamp-shaped createdAt', () => {
    const tsAt = (hoursAgo) => ({
      toDate: () => new Date(NOW - hoursAgo * HOUR),
    });
    const entries = [
      { createdAt: tsAt(1), mood: 'heavy' },
      { createdAt: tsAt(2), mood: 'heavy' },
      { createdAt: tsAt(3), mood: 'heavy' },
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.match(
      out.cluster,
      /^Cluster: 3 consecutive 'heavy' entries (Sun|Mon|Tue|Wed|Thu|Fri|Sat)\.$/,
    );
  });
});

describe('composeJournalSignal — both signals together', () => {
  it('can return both takeaway and cluster at once', () => {
    const entries = [
      entry({ hoursAgo: 1, mood: 'foggy' }),
      entry({ hoursAgo: 24, mood: 'foggy' }),
      entry({ hoursAgo: 48, mood: 'foggy' }),
      entry({ hoursAgo: 72, mood: 'heavy' }),
      entry({ hoursAgo: 96, mood: 'chaotic' }),
      entry({ hoursAgo: 120, mood: 'focused' }),
      entry({ hoursAgo: 144, mood: 'sharp' }),
    ];
    const out = composeJournalSignal(entries, { now: NOW });
    assert.equal(out.takeaway, 'Predominantly challenged. 5 of last 7 are negative.');
    assert.match(out.cluster, /^Cluster: 3 consecutive 'foggy' entries /);
  });
});
