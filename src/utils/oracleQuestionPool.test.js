import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatRelativeDate } from './oracleQuestionPool.js';

// All dates are built from LOCAL components so assertions hold in any timezone.
describe('oracleQuestionPool.formatRelativeDate', () => {
  it('returns empty string for missing/unparseable input', () => {
    assert.equal(formatRelativeDate(null), '');
    assert.equal(formatRelativeDate('garbage'), '');
  });

  it('same local day is "today" even late in the evening', () => {
    // 23:45 local sits on the next UTC day for zones west of UTC — the old
    // UTC-boundary math could disagree with the local calendar here.
    const event = new Date(2026, 6, 24, 23, 45, 0);
    const now = new Date(2026, 6, 24, 23, 59, 0);
    assert.equal(formatRelativeDate(event, now), 'today');
  });

  it('crossing local midnight is "yesterday" regardless of UTC day', () => {
    const event = new Date(2026, 6, 23, 23, 30, 0);
    const now = new Date(2026, 6, 24, 0, 30, 0);
    assert.equal(formatRelativeDate(event, now), 'yesterday');
  });

  it('counts whole local days for 2–13 days', () => {
    const event = new Date(2026, 6, 19, 22, 0, 0);
    const now = new Date(2026, 6, 24, 8, 0, 0);
    assert.equal(formatRelativeDate(event, now), '5 days ago');
  });

  it('falls back to an "on Mon DD" label at 14+ days', () => {
    const event = new Date(2026, 5, 1, 12, 0, 0);
    const now = new Date(2026, 6, 24, 12, 0, 0);
    assert.match(formatRelativeDate(event, now), /^on /);
  });

  it('future events clamp to "today"', () => {
    const event = new Date(2026, 6, 25, 9, 0, 0);
    const now = new Date(2026, 6, 24, 9, 0, 0);
    assert.equal(formatRelativeDate(event, now), 'today');
  });
});
