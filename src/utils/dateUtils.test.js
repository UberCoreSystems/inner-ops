import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MS_PER_DAY, toMs, getEntryTimestamp, parseDate, localDateKey } from './dateUtils.js';

describe('dateUtils.MS_PER_DAY', () => {
  it('equals 86_400_000', () => {
    assert.equal(MS_PER_DAY, 86_400_000);
  });
});

describe('dateUtils.toMs', () => {
  it('returns 0 for null/undefined/empty', () => {
    assert.equal(toMs(null), 0);
    assert.equal(toMs(undefined), 0);
    assert.equal(toMs(''), 0);
  });

  it('passes through a number unchanged', () => {
    assert.equal(toMs(1700000000000), 1700000000000);
  });

  it('parses an ISO string', () => {
    const iso = '2026-04-01T12:00:00.000Z';
    assert.equal(toMs(iso), Date.parse(iso));
  });

  it('parses a Date object', () => {
    const d = new Date('2026-04-01T12:00:00.000Z');
    assert.equal(toMs(d), d.getTime());
  });

  it('uses Firestore Timestamp.toDate() when present', () => {
    const fakeTs = { toDate: () => new Date(1700000000000) };
    assert.equal(toMs(fakeTs), 1700000000000);
  });

  it('returns 0 for unparseable input', () => {
    assert.equal(toMs('not a date'), 0);
    assert.equal(toMs({}), 0);
  });
});

describe('dateUtils.getEntryTimestamp', () => {
  it('prefers entry.createdAt over entry.timestamp', () => {
    const entry = { createdAt: '2026-04-01T00:00:00.000Z', timestamp: 1 };
    assert.equal(getEntryTimestamp(entry), Date.parse('2026-04-01T00:00:00.000Z'));
  });

  it('falls back to entry.timestamp when createdAt is missing', () => {
    assert.equal(getEntryTimestamp({ timestamp: 1700000000000 }), 1700000000000);
  });

  it('falls back to entry.timestamp when createdAt is unparseable', () => {
    assert.equal(getEntryTimestamp({ createdAt: 'garbage', timestamp: 42 }), 42);
  });

  it('returns 0 for empty entry', () => {
    assert.equal(getEntryTimestamp({}), 0);
    assert.equal(getEntryTimestamp(null), 0);
    assert.equal(getEntryTimestamp(undefined), 0);
  });

  it('handles Firestore Timestamp on createdAt', () => {
    const entry = { createdAt: { toDate: () => new Date(99) }, timestamp: 7 };
    assert.equal(getEntryTimestamp(entry), 99);
  });
});

describe('dateUtils.parseDate', () => {
  it('returns null for null/undefined/empty', () => {
    assert.equal(parseDate(null), null);
    assert.equal(parseDate(undefined), null);
    assert.equal(parseDate(''), null);
  });

  it('returns a Date object for a valid ISO string', () => {
    const d = parseDate('2026-04-01T12:00:00.000Z');
    assert.ok(d instanceof Date);
    assert.equal(d.getTime(), Date.parse('2026-04-01T12:00:00.000Z'));
  });

  it('returns null for unparseable input', () => {
    assert.equal(parseDate('garbage'), null);
  });

  it('handles Firestore Timestamp.toDate()', () => {
    const fakeTs = { toDate: () => new Date('2026-04-01T00:00:00.000Z') };
    const d = parseDate(fakeTs);
    assert.ok(d instanceof Date);
    assert.equal(d.toISOString(), '2026-04-01T00:00:00.000Z');
  });
});

describe('dateUtils.localDateKey', () => {
  it('formats a Date as zero-padded local YYYY-MM-DD', () => {
    // Construct via local-time components so the assertion is TZ-independent.
    const d = new Date(2026, 0, 5, 23, 30, 0); // Jan 5 2026, local
    assert.equal(localDateKey(d), '2026-01-05');
  });

  it('uses LOCAL date components (not UTC)', () => {
    const d = new Date(2026, 2, 9, 1, 15, 0); // Mar 9 2026 01:15 local
    const expected = `2026-03-09`;
    assert.equal(localDateKey(d), expected);
    // It must equal the local getDate-derived key, which can differ from the
    // UTC slice for the same instant — that divergence is the bug this fixes.
    assert.equal(localDateKey(d), `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  });

  it('accepts a Firestore Timestamp, ISO string, and ms number', () => {
    const ms = new Date(2026, 5, 8, 12, 0, 0).getTime();
    const expected = localDateKey(new Date(ms));
    assert.equal(localDateKey(ms), expected);
    assert.equal(localDateKey({ toDate: () => new Date(ms) }), expected);
  });

  it('falls back to today for unparseable input', () => {
    const today = localDateKey(new Date());
    assert.equal(localDateKey('garbage'), today);
    assert.equal(localDateKey(null), today);
  });
});
