import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  journalArcPatch,
  confrontationArcPatch,
  journalSitPatch,
  nextSit,
  sitRecordOf,
  sitStateOf,
  sitLine,
  setAsideLine,
  sitBeforeLine,
  arcChipLabel,
  summarizeReadingResponses,
  JOURNAL_ARC_CLEARED,
  CONFRONTATION_ARC_CLEARED,
  isQuestionUnanswered,
  arcOutcomeBadge,
  arcText,
  ARC_OUTCOME,
  ARC_INTENT,
  SIT_DAYS,
} from './followUpArc.js';
import { ORACLE_FIELDS, CONFRONTATION_FIELDS } from './schema.js';

const commitment = {
  text: 'When a meeting runs past 6pm, I will train at 7am next day. Checked by the Ledger check-in.',
  pattern: 'Gym skipped for work',
  trigger: 'a meeting runs past 6pm',
  action: 'train at 7am next day',
  check: 'the Ledger check-in',
};
const NOW = '2026-10-20T00:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('journalArcPatch', () => {
  it('turn 1 writes the intent, pushback, reply and question and nulls everything later — the question key is present even when null', () => {
    const patch = journalArcPatch(
      { intent: 'push_back', pushback: 'P', reply: 'R', question: null, answer: null, close: null, commitment: null, outcome: null },
      NOW
    );
    assert.deepEqual(patch, {
      userResponse: 'P',
      oracleFollowUp: 'R',
      oracleFollowUpQuestion: null,
      userFollowUpAnswer: null,
      oracleFollowUpClose: null,
      oracleCommitment: null,
      oracleFollowUpOutcome: null,
      oracleFollowUpIntent: 'push_back',
      oracleSitUntil: null,
      oracleFollowUpSurfacedAt: null,
    });
    assert.ok('oracleFollowUpQuestion' in patch, 'an arc is told from a legacy follow-up by this key');
  });

  it('turn 2 stamps createdAt on the commitment and records the verdict', () => {
    const patch = journalArcPatch(
      { intent: 'go_further', pushback: 'P', reply: 'R', question: 'Q?', answer: 'A', close: 'C', commitment, outcome: 'evaded' },
      NOW
    );
    assert.deepEqual(patch[ORACLE_FIELDS.COMMITMENT], { ...commitment, createdAt: NOW });
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_OUTCOME], ARC_OUTCOME.EVADED);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_INTENT], ARC_INTENT.GO_FURTHER);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_QUESTION], 'Q?');
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_ANSWER], 'A');
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_CLOSE], 'C');
  });

  it('a landed turn writes the receipt as the reply with the commitment and no question', () => {
    const patch = journalArcPatch({ intent: 'landed', reply: 'Receipt.', commitment }, NOW);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_INTENT], ARC_INTENT.LANDED);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_REPLY], 'Receipt.');
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_QUESTION], null);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_OUTCOME], null);
    assert.deepEqual(patch[ORACLE_FIELDS.COMMITMENT], { ...commitment, createdAt: NOW });
    assert.equal(isQuestionUnanswered(patch), false, 'a landed reading is never an open question');
  });

  it('leaving writes unanswered; an unknown outcome or intent, blank text and a commitment without text become null', () => {
    const left = journalArcPatch({ intent: 'push_back', pushback: 'P', reply: 'R', question: 'Q?', outcome: 'unanswered' }, NOW);
    assert.equal(left[ORACLE_FIELDS.FOLLOW_UP_OUTCOME], ARC_OUTCOME.UNANSWERED);
    assert.equal(left[ORACLE_FIELDS.FOLLOW_UP_ANSWER], null);
    const odd = journalArcPatch({ intent: 'whatever', pushback: '   ', outcome: 'whatever', commitment: { pattern: 'no text' } }, NOW);
    assert.equal(odd[ORACLE_FIELDS.FOLLOW_UP_INTENT], null);
    assert.equal(odd[ORACLE_FIELDS.FOLLOW_UP_PUSHBACK], null);
    assert.equal(odd[ORACLE_FIELDS.FOLLOW_UP_OUTCOME], null);
    assert.equal(odd[ORACLE_FIELDS.COMMITMENT], null);
    assert.doesNotThrow(() => journalArcPatch());
  });

  it('resets the dashboard stamp and the pending sit, never the sit count', () => {
    const patch = journalArcPatch({ intent: 'push_back', pushback: 'P' }, NOW);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_SURFACED_AT], null);
    assert.equal(patch[ORACLE_FIELDS.SIT_UNTIL], null);
    assert.ok(!(ORACLE_FIELDS.SIT_COUNT in patch));
  });
});

describe('confrontationArcPatch', () => {
  it('maps the arc onto the confrontation field names, the reply in followUpResponse, and carries no intent', () => {
    const patch = confrontationArcPatch(
      { intent: 'push_back', pushback: 'P', reply: 'R', question: 'Q?', answer: 'A', close: 'C', commitment, outcome: 'answered' },
      NOW
    );
    assert.deepEqual(patch, {
      followUpPushback: 'P',
      followUpResponse: 'R',
      followUpQuestion: 'Q?',
      followUpAnswer: 'A',
      followUpClose: 'C',
      commitment: { ...commitment, createdAt: NOW },
      followUpOutcome: 'answered',
    });
  });
});

describe('cleared constants', () => {
  it('null every arc field, the intent, the pending sit and the dashboard stamp on journal entries — not the sit count', () => {
    assert.deepEqual(Object.keys(JOURNAL_ARC_CLEARED).sort(), [
      'oracleCommitment',
      'oracleFollowUp',
      'oracleFollowUpClose',
      'oracleFollowUpIntent',
      'oracleFollowUpOutcome',
      'oracleFollowUpQuestion',
      'oracleFollowUpSurfacedAt',
      'oracleSitUntil',
      'userFollowUpAnswer',
      'userResponse',
    ]);
    assert.ok(Object.values(JOURNAL_ARC_CLEARED).every((v) => v === null));
    assert.deepEqual(Object.keys(CONFRONTATION_ARC_CLEARED).sort(), [
      'commitment',
      'followUpAnswer',
      'followUpClose',
      'followUpOutcome',
      'followUpPushback',
      'followUpQuestion',
      'followUpResponse',
    ]);
    assert.ok(Object.values(CONFRONTATION_ARC_CLEARED).every((v) => v === null));
  });
});

describe('isQuestionUnanswered', () => {
  it('is true for an explicit leave and for an open question with no answer and no outcome', () => {
    assert.equal(isQuestionUnanswered({ oracleFollowUpQuestion: 'Q?', oracleFollowUpOutcome: 'unanswered' }), true);
    assert.equal(isQuestionUnanswered({ oracleFollowUpQuestion: 'Q?' }), true, 'a closed tab writes no outcome');
  });

  it('is false once answered or evaded, when the verdict was not recorded, and when there is no arc question', () => {
    assert.equal(isQuestionUnanswered({ oracleFollowUpQuestion: 'Q?', userFollowUpAnswer: 'A', oracleFollowUpOutcome: 'answered' }), false);
    assert.equal(isQuestionUnanswered({ oracleFollowUpQuestion: 'Q?', userFollowUpAnswer: 'A', oracleFollowUpOutcome: 'evaded' }), false);
    assert.equal(isQuestionUnanswered({ oracleFollowUpQuestion: 'Q?', userFollowUpAnswer: 'A' }), false);
    assert.equal(isQuestionUnanswered({ oracleFollowUp: 'legacy single-turn reply' }), false);
    assert.equal(isQuestionUnanswered({ oracleFollowUpQuestion: null, oracleFollowUpOutcome: 'unanswered' }), false);
    assert.equal(isQuestionUnanswered(null), false);
  });

  it('reads confrontation docs with their own field names', () => {
    assert.equal(isQuestionUnanswered({ followUpQuestion: 'Q?' }, CONFRONTATION_FIELDS), true);
    assert.equal(isQuestionUnanswered({ followUpQuestion: 'Q?', followUpOutcome: 'answered' }, CONFRONTATION_FIELDS), false);
  });
});

describe('sit with this', () => {
  const now = new Date(NOW);
  const due = new Date(now.getTime() + SIT_DAYS * DAY_MS).toISOString();

  it('schedules the return SIT_DAYS out and counts from the entry', () => {
    assert.deepEqual(nextSit({}, now), { count: 1, until: due });
    assert.deepEqual(nextSit({ oracleSitCount: 2 }, now), { count: 3, until: due });
    assert.deepEqual(nextSit({ oracleSitCount: 'junk' }, now), { count: 1, until: due });
  });

  it('the sit patch records the intent, the date and the count, clears the exchange and resets the stamp', () => {
    const patch = journalSitPatch({ oracleSitCount: 1, oracleFollowUpSurfacedAt: '2026-10-19T00:00:00.000Z' }, now);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_INTENT], ARC_INTENT.SIT);
    assert.equal(patch[ORACLE_FIELDS.SIT_UNTIL], due);
    assert.equal(patch[ORACLE_FIELDS.SIT_COUNT], 2);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_SURFACED_AT], null);
    for (const key of ['userResponse', 'oracleFollowUp', 'oracleFollowUpQuestion', 'userFollowUpAnswer', 'oracleFollowUpClose', 'oracleCommitment', 'oracleFollowUpOutcome']) {
      assert.equal(patch[key], null, key);
    }
  });

  it('reads the sit back, and knows pending from due — a sit with no date is due now', () => {
    const sitting = { oracleFollowUpIntent: 'sit', oracleSitUntil: due, oracleSitCount: 1 };
    assert.deepEqual(sitRecordOf(sitting), { count: 1, until: due });
    assert.equal(sitRecordOf({ oracleFollowUpIntent: 'push_back', oracleSitCount: 1 }), null);
    assert.equal(sitRecordOf(null), null);
    assert.equal(sitStateOf(sitting, now), 'pending');
    assert.equal(sitStateOf(sitting, new Date(now.getTime() + SIT_DAYS * DAY_MS - 1)), 'pending');
    assert.equal(sitStateOf(sitting, new Date(due)), 'due');
    assert.equal(sitStateOf({ oracleFollowUpIntent: 'sit' }, now), 'due');
    assert.equal(sitStateOf({ oracleFollowUpIntent: 'landed' }, now), null);
  });

  it('says what happens next and nothing else', () => {
    const until = new Date(2026, 9, 24, 12).toISOString();
    assert.equal(sitLine({ count: 1, until }), 'Sitting with it. It comes back on the dashboard on Oct 24.');
    assert.equal(sitLine({ count: 2, until }), 'Sitting with it a second time. It comes back on the dashboard on Oct 24.');
    assert.equal(sitLine({ count: 6, until }), 'Sitting with it a 6th time. It comes back on the dashboard on Oct 24.');
    assert.equal(sitLine({ count: 1, until: null }), 'Sitting with it.');
    assert.equal(setAsideLine({ count: 1, until }), 'Set aside on Oct 17.');
    assert.equal(setAsideLine({ count: 2, until }), 'Set aside twice, last on Oct 17.');
    assert.equal(setAsideLine({ count: 3, until: null }), 'Set aside three times.');
    assert.equal(sitBeforeLine(1), 'Set aside once before responding.');
    assert.equal(sitBeforeLine(4), 'Set aside 4 times before responding.');
    for (const line of [sitLine({ count: 1, until }), setAsideLine({ count: 1, until }), sitBeforeLine(1)]) {
      assert.ok(!/take your time|no rush|patience|avoid|heavy/i.test(line), line);
    }
  });
});

describe('arcChipLabel', () => {
  it('shows the intent with its outcome', () => {
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'push_back', oracleFollowUpQuestion: 'Q?', userFollowUpAnswer: 'A', oracleFollowUpOutcome: 'answered' }), { label: 'Pushed back · answered', tone: 'neutral' });
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'push_back', oracleFollowUpQuestion: 'Q?', userFollowUpAnswer: 'A', oracleFollowUpOutcome: 'evaded' }), { label: 'Pushed back · evaded', tone: 'evaded' });
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'go_further', oracleFollowUpQuestion: 'Q?', oracleFollowUpOutcome: 'unanswered' }), { label: 'Went further · left', tone: 'neutral' });
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'go_further', oracleFollowUpQuestion: 'Q?' }), { label: 'Went further · left', tone: 'neutral' }, 'a closed tab leaves the question open');
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'push_back' }), { label: 'Pushed back', tone: 'neutral' }, 'turn 1 still in flight');
  });

  it('shows landed with its contract, and sitting with its count', () => {
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'landed' }), { label: 'It landed', tone: 'neutral' });
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'landed', oracleCommitment: { text: 'C', contractId: 'k1' } }), { label: 'It landed · contracted', tone: 'contracted' });
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'sit', oracleSitCount: 1 }), { label: 'Sitting with it', tone: 'neutral' });
    assert.deepEqual(arcChipLabel({ oracleFollowUpIntent: 'sit', oracleSitCount: 2 }), { label: 'Sitting with it · ×2', tone: 'neutral' });
  });

  it('keeps the legacy chip when there is no intent, and nothing otherwise', () => {
    assert.deepEqual(arcChipLabel({ oracleReaction: 'landed' }), { label: 'Landed', tone: 'landed' });
    assert.deepEqual(arcChipLabel({ oracleReaction: 'disagree' }), { label: 'Disagreed', tone: 'disagree' });
    assert.deepEqual(arcChipLabel({ oracleReaction: 'sit' }), { label: 'Sitting', tone: 'sit' });
    assert.deepEqual(arcChipLabel({ oracleReaction: 'missed' }), { label: 'Missed', tone: 'missed' });
    assert.deepEqual(arcChipLabel({ oracleReaction: 'landed', oracleFollowUpIntent: 'sit', oracleSitCount: 1 }), { label: 'Sitting with it', tone: 'neutral' }, 'the intent wins over a legacy reaction');
    assert.equal(arcChipLabel({ oracleReaction: 'other' }), null);
    assert.equal(arcChipLabel({ oracleFollowUpIntent: 'junk' }), null);
    assert.equal(arcChipLabel({}), null);
    assert.equal(arcChipLabel(null), null);
  });
});

describe('summarizeReadingResponses', () => {
  const now = Date.parse(NOW);
  const at = (daysAgo) => now - daysAgo * DAY_MS;
  const entries = [
    { timestamp: at(1), oracleFollowUpIntent: 'push_back', oracleFollowUpOutcome: 'evaded' },
    { timestamp: at(2), oracleFollowUpIntent: 'push_back', oracleSitCount: 1 },
    { timestamp: at(3), oracleFollowUpIntent: 'go_further' },
    { timestamp: at(4), oracleFollowUpIntent: 'landed', oracleCommitment: { text: 'C', contractId: 'k1' } },
    { timestamp: at(5), oracleFollowUpIntent: 'landed', oracleCommitment: { text: 'C' } },
    { timestamp: at(6), oracleFollowUpIntent: 'sit', oracleSitCount: 1 },
    { timestamp: at(7), oracleFollowUpIntent: 'sit', oracleSitCount: 2 },
    { timestamp: at(8), oracleReaction: 'landed' },
    { timestamp: at(31), oracleFollowUpIntent: 'push_back' },
    { timestamp: now + DAY_MS, oracleFollowUpIntent: 'landed' },
    { createdAt: new Date(at(9)).toISOString(), oracleFollowUpIntent: 'landed', oracleSitCount: 2 },
  ];

  it('counts per current intent over the window, the contracts, the resolved sits and the repeated ones', () => {
    assert.deepEqual(summarizeReadingResponses(entries, { windowDays: 30, now }), {
      windowDays: 30,
      pushBack: 2,
      goFurther: 1,
      landed: 3,
      sit: 2,
      landedContracted: 1,
      sitsReturnedResolved: 2,
      sitsDeferredAgain: 1,
      total: 8,
    });
  });

  it('a narrower window drops older entries; nothing in the window is null', () => {
    assert.equal(summarizeReadingResponses(entries, { windowDays: 1, now }).total, 1);
    assert.equal(summarizeReadingResponses(entries.filter((e) => !e.oracleFollowUpIntent), { now }), null);
    assert.equal(summarizeReadingResponses([], { now }), null);
    assert.equal(summarizeReadingResponses(null, { now }), null);
  });
});

describe('arcOutcomeBadge', () => {
  it('tags a verdict and nothing else', () => {
    assert.deepEqual(arcOutcomeBadge(ARC_OUTCOME.ANSWERED), { label: 'Answered', color: '#858585' });
    assert.deepEqual(arcOutcomeBadge(ARC_OUTCOME.EVADED), { label: 'Evaded', color: '#f59e0b' });
    assert.equal(arcOutcomeBadge(ARC_OUTCOME.UNANSWERED), null);
    assert.equal(arcOutcomeBadge(null), null);
  });
});

describe('arcText', () => {
  it('keeps a non-empty string and nulls everything else', () => {
    assert.equal(arcText('x'), 'x');
    assert.equal(arcText('   '), null);
    assert.equal(arcText(42), null);
    assert.equal(arcText(undefined), null);
  });
});
