import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  buildColdCaseEntryText,
  buildReengagePrefill,
  engagementLineageLabel,
} from './coldCase.js';

const NOW = new Date('2026-10-14T12:00:00');

const fullKill = {
  title: 'Using avoidance to delay a tough talk',
  category: 'fear',
  killedAt: '2026-07-25T12:00:00',
  activeDuration: 53,
  streak: 30,
  consecutiveDaysRequired: 30,
  closureNote: 'Held the talk instead of postponing it.',
  closureTags: ['identity_shifted'],
  implementationIntention: { trigger: 'I want to avoid a hard call', response: 'dial it before I sit back down' },
  escapeData: [
    { date: '2026-06-10', context: 'Late night', rationalization: 'just being practical', prevention: 'schedule the call in the morning', streakAtEscape: 8 },
    { date: '2026-06-20', context: 'Busy week', rationalization: 'not the right moment', prevention: 'send the first sentence anyway', streakAtEscape: 9 },
  ],
  engagementCount: undefined,
};

describe('buildColdCaseEntryText', () => {
  it('embeds the file: header, closure, intention, escapes, report, task line', () => {
    const text = buildColdCaseEntryText(fullKill, 'Caught myself rescheduling the same conversation twice.', NOW);
    assert.match(text, /Cold case reopened: "Using avoidance to delay a tough talk" — a Fear\/Anxiety\./);
    assert.match(text, /Killed Jul 25, 2026 after 53 days under contract; final streak 30\./);
    assert.match(text, /in the user's words at the time: "Held the talk instead of postponing it\."/);
    assert.match(text, /Closure framing: identity shifted\./);
    assert.match(text, /Pre-committed clause: when I want to avoid a hard call, I will dial it before I sit back down\./);
    assert.match(text, /Breached 2 times before the kill:/);
    assert.match(text, /the user reports movement: "Caught myself rescheduling the same conversation twice\."/);
    assert.match(text, /same pattern resurfacing or a new target wearing its clothes/);
  });

  it('quotes rationalizations verbatim', () => {
    const text = buildColdCaseEntryText(fullKill, 'report', NOW);
    assert.match(text, /Told themselves: "just being practical"\./);
    assert.match(text, /Told themselves: "not the right moment"\./);
  });

  it('states days since the kill', () => {
    const text = buildColdCaseEntryText(fullKill, 'report', NOW);
    assert.match(text, /Today, 81 days after the kill, the user reports movement/);
  });

  it('caps escapes at the last 6 and states the total', () => {
    const escapes = Array.from({ length: 9 }, (_, i) => ({
      date: `2026-05-0${(i % 9) + 1}`,
      rationalization: `excuse ${i + 1}`,
      streakAtEscape: i,
    }));
    const text = buildColdCaseEntryText({ ...fullKill, escapeData: escapes }, 'report', NOW);
    assert.match(text, /Breached 9 times before the kill \(showing last 6\):/);
    assert.doesNotMatch(text, /excuse 3"/);
    assert.match(text, /excuse 4/);
    assert.match(text, /excuse 9/);
  });

  it('tolerates a sparse record (no closure, no intention, no escapes)', () => {
    const text = buildColdCaseEntryText(
      { title: 'Doomscrolling', category: 'bad-habit', killedAt: '2026-07-01T12:00:00' },
      'It is back.',
      NOW,
    );
    assert.match(text, /Cold case reopened: "Doomscrolling" — a Bad Habit\./);
    assert.doesNotMatch(text, /What ended it/);
    assert.doesNotMatch(text, /Pre-committed clause/);
    assert.doesNotMatch(text, /Breached/);
    assert.match(text, /the user reports movement: "It is back\."/);
  });

  it('handles killedAt as a Firestore Timestamp-like object', () => {
    const kill = { ...fullKill, killedAt: { toDate: () => new Date('2026-07-25T12:00:00') } };
    const text = buildColdCaseEntryText(kill, 'report', NOW);
    assert.match(text, /Killed Jul 25, 2026/);
    assert.match(text, /81 days after the kill/);
  });
});

describe('buildReengagePrefill', () => {
  it('seeds response from the last escape prevention over the original intention', () => {
    const prefill = buildReengagePrefill(fullKill);
    assert.equal(prefill.title, fullKill.title);
    assert.equal(prefill.category, 'fear');
    assert.equal(prefill.days, 30);
    assert.equal(prefill.intention.trigger, 'I want to avoid a hard call');
    assert.equal(prefill.intention.response, 'send the first sentence anyway');
    assert.equal(prefill.description, 'send the first sentence anyway');
  });

  it('falls back to the original intention when there are no escapes', () => {
    const prefill = buildReengagePrefill({ ...fullKill, escapeData: [] });
    assert.equal(prefill.intention.response, 'dial it before I sit back down');
    assert.equal(prefill.description, null);
  });

  it('increments engagementCount from absent (→2) and carried-forward (2→3)', () => {
    assert.equal(buildReengagePrefill(fullKill).engagementCount, 2);
    assert.equal(buildReengagePrefill({ ...fullKill, engagementCount: 2 }).engagementCount, 3);
  });

  it('denormalizes prior kill facts and normalizes killedAt to ISO', () => {
    const prefill = buildReengagePrefill(fullKill);
    assert.equal(prefill.priorKillDays, 53);
    assert.equal(new Date(prefill.priorKilledAt).toDateString(), new Date('2026-07-25T12:00:00').toDateString());

    const fromTimestamp = buildReengagePrefill({
      ...fullKill,
      killedAt: { toDate: () => new Date('2026-07-25T12:00:00') },
    });
    assert.equal(typeof fromTimestamp.priorKilledAt, 'string');
  });
});

describe('engagementLineageLabel', () => {
  it('returns null for first engagements', () => {
    assert.equal(engagementLineageLabel({}), null);
    assert.equal(engagementLineageLabel({ engagementCount: 1 }), null);
    assert.equal(engagementLineageLabel({ engagementCount: 'nope' }), null);
  });

  it('labels the second engagement with the first kill', () => {
    const label = engagementLineageLabel({
      engagementCount: 2, priorKillDays: 53, priorKilledAt: '2026-07-25T12:00:00',
    });
    assert.equal(label.ordinal, 'SECOND ENGAGEMENT');
    assert.equal(label.detail, 'first kill: 53 days, Jul 25, 2026');
  });

  it('labels the third engagement with the last kill', () => {
    const label = engagementLineageLabel({
      engagementCount: 3, priorKillDays: 40, priorKilledAt: '2026-09-01T12:00:00',
    });
    assert.equal(label.ordinal, 'THIRD ENGAGEMENT');
    assert.equal(label.detail, 'last kill: 40 days, Sep 1, 2026');
  });

  it('falls back to numeric form past TENTH', () => {
    assert.equal(engagementLineageLabel({ engagementCount: 11 }).ordinal, 'ENGAGEMENT #11');
  });

  it('returns a null detail when prior kill facts are missing', () => {
    assert.equal(engagementLineageLabel({ engagementCount: 2 }).detail, null);
  });
});
