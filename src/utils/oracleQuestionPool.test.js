import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatRelativeDate, pickTodaysOracleQuestion, questionFromJournal } from './oracleQuestionPool.js';

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

describe('oracleQuestionPool.questionFromJournal', () => {
  it('prefers a dialogue question he left open, flagged for the picker', () => {
    const doc = {
      oracleClosingQuestion: 'Reading question?',
      oracleFollowUpQuestion: 'Which night?',
      oracleFollowUpSurfacedAt: null,
    };
    assert.deepEqual(questionFromJournal(doc), { question: 'Which night?', unanswered: true, surfacedAt: null });
    assert.deepEqual(
      questionFromJournal({ ...doc, oracleFollowUpOutcome: 'unanswered', oracleFollowUpSurfacedAt: '2026-10-16T12:00:00.000Z' }),
      { question: 'Which night?', unanswered: true, surfacedAt: '2026-10-16T12:00:00.000Z' }
    );
  });

  it('falls back to the reading once the arc was answered, evaded, or never happened', () => {
    assert.equal(
      questionFromJournal({
        oracleClosingQuestion: 'Reading question?',
        oracleFollowUpQuestion: 'Which night?',
        userFollowUpAnswer: 'Tuesday',
        oracleFollowUpOutcome: 'answered',
      }),
      'Reading question?'
    );
    assert.equal(
      questionFromJournal({
        oracleClosingQuestion: 'Reading question?',
        oracleFollowUpQuestion: 'Which night?',
        userFollowUpAnswer: 'Isn\'t the build my training?',
        oracleFollowUpOutcome: 'evaded',
      }),
      'Reading question?'
    );
    assert.equal(questionFromJournal({ oracleClosingQuestion: 'Reading question?' }), 'Reading question?');
  });

  it('falls back to the reading when the open question is not a question the pool admits', () => {
    assert.equal(
      questionFromJournal({ oracleClosingQuestion: 'Reading question?', oracleFollowUpQuestion: 'Name the night.' }),
      'Reading question?'
    );
  });
});

describe('oracleQuestionPool.pickTodaysOracleQuestion', () => {
  const day = (d) => new Date(2026, 9, d, 12).toISOString();
  const pool = [
    { id: 'journalEntries/a', question: 'A?', eventOccurredAt: day(1) },
    { id: 'journalEntries/b', question: 'B?', eventOccurredAt: day(10), unanswered: true, surfacedAt: null },
    { id: 'journalEntries/c', question: 'C?', eventOccurredAt: day(12), unanswered: true, surfacedAt: null },
    { id: 'journalEntries/d', question: 'D?', eventOccurredAt: day(14), unanswered: true, surfacedAt: day(15) },
  ];
  const now = new Date(2026, 9, 16, 12);

  it('an open, unsurfaced dialogue question wins — the most recent one', () => {
    assert.equal(pickTodaysOracleQuestion(pool, [], '2026-10-16', { now }).id, 'journalEntries/c');
  });

  it('one shown recently is skipped like any other recently shown prompt', () => {
    assert.equal(pickTodaysOracleQuestion(pool, ['journalEntries/c'], '2026-10-16', { now }).id, 'journalEntries/b');
  });

  it('once surfaced it competes in the weighted draw, which stays deterministic for the day', () => {
    const rest = pool.filter((p) => p.id === 'journalEntries/a' || p.id === 'journalEntries/d');
    const first = pickTodaysOracleQuestion(rest, [], '2026-10-16', { now });
    assert.ok(['journalEntries/a', 'journalEntries/d'].includes(first.id));
    assert.equal(pickTodaysOracleQuestion(rest, [], '2026-10-16', { now }).id, first.id);
  });

  it('an empty pool still yields null', () => {
    assert.equal(pickTodaysOracleQuestion([], [], '2026-10-16', { now }), null);
  });
});
