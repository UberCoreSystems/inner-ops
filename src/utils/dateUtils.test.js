import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MS_PER_DAY, toMs, getEntryTimestamp, parseDate } from './dateUtils.js';

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
