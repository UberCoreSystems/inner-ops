/**
 * The Oracle follow-up arc ("Go deeper"), as stored — the one place that knows
 * how an arc snapshot from OracleModal lands on a journal entry or a
 * confrontation doc, how to read whether its question was left open, and the
 * words the exchange is labeled with.
 *
 * Snapshot: { pushback, reply, question, answer, close, commitment, outcome }.
 * Every turn writes the whole arc so far with the later fields null, so a
 * turn-2 write repairs a turn-1 write that failed, and a replaced reading
 * clears the exchange that answered it (the *_ARC_CLEARED patches).
 */
import { ORACLE_FIELDS, CONFRONTATION_FIELDS } from './schema.js';

export const ARC_OUTCOME = Object.freeze({
  ANSWERED: 'answered',
  EVADED: 'evaded',
  UNANSWERED: 'unanswered',
});

// Product language for the exchange — one home, three renderers.
export const ARC_COPY = Object.freeze({
  challenge: 'Your challenge',
  reflection: 'Oracle — Reflection',
  answer: 'Your answer',
  closingRead: 'Oracle — Closing read',
  commitment: 'Commitment',
  leftUnanswered: 'Left unanswered.',
});

// The tag beside a closing read. Only a verdict gets one; a question left open
// is said in words, where it happened.
export function arcOutcomeBadge(outcome) {
  if (outcome === ARC_OUTCOME.ANSWERED) return { label: 'Answered', color: '#858585' };
  if (outcome === ARC_OUTCOME.EVADED) return { label: 'Evaded', color: '#f59e0b' };
  return null;
}

// A stored arc field: a non-empty string, else null.
export const arcText = (value) => (typeof value === 'string' && value.trim() ? value : null);
const outcomeOf = (value) => (Object.values(ARC_OUTCOME).includes(value) ? value : null);

function arcPatch(fields, snapshot = {}, nowIso = new Date().toISOString()) {
  const commitment = snapshot.commitment && arcText(snapshot.commitment.text) ? snapshot.commitment : null;
  return {
    [fields.FOLLOW_UP_PUSHBACK]: arcText(snapshot.pushback),
    [fields.FOLLOW_UP_REPLY]: arcText(snapshot.reply),
    [fields.FOLLOW_UP_QUESTION]: arcText(snapshot.question),
    [fields.FOLLOW_UP_ANSWER]: arcText(snapshot.answer),
    [fields.FOLLOW_UP_CLOSE]: arcText(snapshot.close),
    [fields.COMMITMENT]: commitment ? { ...commitment, createdAt: nowIso } : null,
    [fields.FOLLOW_UP_OUTCOME]: outcomeOf(snapshot.outcome),
  };
}

export const journalArcPatch = (snapshot, nowIso) => arcPatch(ORACLE_FIELDS, snapshot, nowIso);
export const confrontationArcPatch = (snapshot, nowIso) => arcPatch(CONFRONTATION_FIELDS, snapshot, nowIso);

export const JOURNAL_ARC_CLEARED = Object.freeze({
  ...arcPatch(ORACLE_FIELDS),
  [ORACLE_FIELDS.FOLLOW_UP_SURFACED_AT]: null,
});
export const CONFRONTATION_ARC_CLEARED = Object.freeze(arcPatch(CONFRONTATION_FIELDS));

/**
 * Whether the arc's question is still open: he left it (outcome 'unanswered'),
 * or the tab closed before anything else was written (a question, no answer,
 * no outcome). Pass CONFRONTATION_FIELDS to read a confrontation doc.
 */
export function isQuestionUnanswered(doc, fields = ORACLE_FIELDS) {
  if (!doc || !arcText(doc[fields.FOLLOW_UP_QUESTION])) return false;
  const outcome = doc[fields.FOLLOW_UP_OUTCOME];
  if (outcome === ARC_OUTCOME.UNANSWERED) return true;
  if (outcome) return false;
  return !arcText(doc[fields.FOLLOW_UP_ANSWER]);
}
