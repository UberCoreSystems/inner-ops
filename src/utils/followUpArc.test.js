import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  journalArcPatch,
  confrontationArcPatch,
  JOURNAL_ARC_CLEARED,
  CONFRONTATION_ARC_CLEARED,
  isQuestionUnanswered,
  arcOutcomeBadge,
  arcText,
  ARC_OUTCOME,
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

describe('journalArcPatch', () => {
  it('turn 1 writes the pushback, reply and question and nulls everything later — the question key is present even when null', () => {
    const patch = journalArcPatch(
      { pushback: 'P', reply: 'R', question: null, answer: null, close: null, commitment: null, outcome: null },
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
    });
    assert.ok('oracleFollowUpQuestion' in patch, 'an arc is told from a legacy follow-up by this key');
  });

  it('turn 2 stamps createdAt on the commitment and records the verdict', () => {
    const patch = journalArcPatch(
      { pushback: 'P', reply: 'R', question: 'Q?', answer: 'A', close: 'C', commitment, outcome: 'evaded' },
      NOW
    );
    assert.deepEqual(patch[ORACLE_FIELDS.COMMITMENT], { ...commitment, createdAt: NOW });
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_OUTCOME], ARC_OUTCOME.EVADED);
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_QUESTION], 'Q?');
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_ANSWER], 'A');
    assert.equal(patch[ORACLE_FIELDS.FOLLOW_UP_CLOSE], 'C');
  });

  it('leaving writes unanswered; an unknown outcome, blank text and a commitment without text become null', () => {
    const left = journalArcPatch({ pushback: 'P', reply: 'R', question: 'Q?', outcome: 'unanswered' }, NOW);
    assert.equal(left[ORACLE_FIELDS.FOLLOW_UP_OUTCOME], ARC_OUTCOME.UNANSWERED);
    assert.equal(left[ORACLE_FIELDS.FOLLOW_UP_ANSWER], null);
    const odd = journalArcPatch({ pushback: '   ', outcome: 'whatever', commitment: { pattern: 'no text' } }, NOW);
    assert.equal(odd[ORACLE_FIELDS.FOLLOW_UP_PUSHBACK], null);
    assert.equal(odd[ORACLE_FIELDS.FOLLOW_UP_OUTCOME], null);
    assert.equal(odd[ORACLE_FIELDS.COMMITMENT], null);
    assert.doesNotThrow(() => journalArcPatch());
  });

  it('never touches the dashboard stamp', () => {
    assert.ok(!(ORACLE_FIELDS.FOLLOW_UP_SURFACED_AT in journalArcPatch({ pushback: 'P' }, NOW)));
  });
});

describe('confrontationArcPatch', () => {
  it('maps the arc onto the confrontation field names, the reply in followUpResponse', () => {
    const patch = confrontationArcPatch(
      { pushback: 'P', reply: 'R', question: 'Q?', answer: 'A', close: 'C', commitment, outcome: 'answered' },
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
  it('null every arc field, including the dashboard stamp on journal entries', () => {
    assert.deepEqual(Object.keys(JOURNAL_ARC_CLEARED).sort(), [
      'oracleCommitment',
      'oracleFollowUp',
      'oracleFollowUpClose',
      'oracleFollowUpOutcome',
      'oracleFollowUpQuestion',
      'oracleFollowUpSurfacedAt',
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
