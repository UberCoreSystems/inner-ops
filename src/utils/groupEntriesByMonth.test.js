import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { groupEntriesByMonth } from './groupEntriesByMonth.js';

// Local-noon dates so the assertions don't flip month under any test-runner TZ.
const at = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0);

describe('groupEntriesByMonth', () => {
  it('returns [] for empty or non-array input', () => {
    assert.deepEqual(groupEntriesByMonth([]), []);
    assert.deepEqual(groupEntriesByMonth(null), []);
    assert.deepEqual(groupEntriesByMonth(undefined), []);
  });

  it('groups same-month entries together and preserves input order', () => {
    const entries = [
      { id: 'a', timestamp: at(2026, 7, 21) },
      { id: 'b', timestamp: at(2026, 7, 14) },
      { id: 'c', timestamp: at(2026, 7, 2) },
    ];
    const groups = groupEntriesByMonth(entries);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].key, '2026-07');
    assert.equal(groups[0].label, 'July 2026');
    assert.deepEqual(groups[0].entries.map(e => e.id), ['a', 'b', 'c']);
  });

  it('splits on a month boundary and keeps groups newest-first', () => {
    const groups = groupEntriesByMonth([
      { id: 'a', timestamp: at(2026, 7, 1) },
      { id: 'b', timestamp: at(2026, 6, 30) },
    ]);
    assert.deepEqual(groups.map(g => g.key), ['2026-07', '2026-06']);
    assert.deepEqual(groups.map(g => g.entries.length), [1, 1]);
  });

  it('splits on a year boundary', () => {
    const groups = groupEntriesByMonth([
      { id: 'a', timestamp: at(2026, 1, 1) },
      { id: 'b', timestamp: at(2025, 12, 31) },
    ]);
    assert.deepEqual(groups.map(g => g.key), ['2026-01', '2025-12']);
    assert.deepEqual(groups.map(g => g.label), ['January 2026', 'December 2025']);
  });

  it('accepts Firestore Timestamp, ISO string, and Date shapes', () => {
    const groups = groupEntriesByMonth([
      { id: 'ts', timestamp: { toDate: () => at(2026, 5, 10) } },
      { id: 'iso', timestamp: at(2026, 5, 4).toISOString() },
      { id: 'date', timestamp: at(2026, 5, 1) },
    ]);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].entries.map(e => e.id), ['ts', 'iso', 'date']);
  });

  it('falls back to createdAt when timestamp is missing', () => {
    const groups = groupEntriesByMonth([
      { id: 'a', createdAt: at(2026, 3, 9) },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].key, '2026-03');
  });

  it('collects undated entries into a trailing group instead of dropping them', () => {
    const groups = groupEntriesByMonth([
      { id: 'a', timestamp: at(2026, 7, 21) },
      { id: 'bad', timestamp: 'not a date' },
      { id: 'none' },
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[1].key, 'undated');
    assert.equal(groups[1].label, 'Undated');
    assert.deepEqual(groups[1].entries.map(e => e.id), ['bad', 'none']);
  });

  it('re-uses one group when a month reappears later in the list', () => {
    const groups = groupEntriesByMonth([
      { id: 'a', timestamp: at(2026, 7, 21) },
      { id: 'b', timestamp: at(2026, 6, 30) },
      { id: 'c', timestamp: at(2026, 7, 3) },
    ]);
    assert.deepEqual(groups.map(g => g.key), ['2026-07', '2026-06']);
    assert.deepEqual(groups[0].entries.map(e => e.id), ['a', 'c']);
  });

  it('exposes numeric year/month for dated groups', () => {
    const [group] = groupEntriesByMonth([{ id: 'a', timestamp: at(2026, 2, 15) }]);
    assert.equal(group.year, 2026);
    assert.equal(group.month, 1);
  });
});
