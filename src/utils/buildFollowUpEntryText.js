/**
 * Entry text for the Oracle follow-up arc.
 *
 * The follow-up templates (functions/index.js) read labeled sections. Turn 1
 * gets three: the original entry, the Oracle's own prior reading, and his
 * words — labeled HIS PUSHBACK (oracle_pushback) or HIS DIRECTION
 * (oracle_further), by intent. Turn 2 (oracle_close) adds two more: the
 * Oracle's turn-1 reply and his answer to the question it closed on. "It
 * landed" (oracle_landed) is one turn and carries no words of his, so it gets
 * the first two sections only (buildLandedEntryText). Without its own prior
 * text the Oracle cannot hold or concede on the record — it never sees what
 * it said.
 *
 * Budget: the cloud function rejects entry text longer than
 * ORACLE_MAX_ENTRY_TEXT_CHARS (functions/config.js, 20000). Priority, highest
 * first: the current turn's text is never cut (the pushback as typed; the
 * answer clamped to FOLLOW_UP_ANSWER_MAX_CHARS, which the answer box also
 * enforces); the turn-1 reply is never cut either, because the question sits
 * at its end; the pushback keeps the cap its box already enforced, so turn 2
 * judges against the same text turn 1 answered; the reading is capped; the
 * entry takes the remainder. The labels count toward the total. The
 * three-section pushback output is byte-identical to the single-turn layout
 * it replaced.
 */
import { ARC_INTENT } from './followUpArc.js';

export const FOLLOW_UP_MAX_CHARS = 20000;
export const FOLLOW_UP_READING_MAX_CHARS = 4000;
// Also the challenge box's maxLength; matches MAX_USER_RESPONSE_CHARS
// (functions/config.js).
export const FOLLOW_UP_PUSHBACK_MAX_CHARS = 8000;
export const FOLLOW_UP_ANSWER_MAX_CHARS = 2000;
export const NO_READING_RECORDED = '(none recorded)';

const ENTRY_LABEL = 'ORIGINAL ENTRY:\n';
const READING_LABEL = '\n\nYOUR PRIOR READING:\n';
const PUSHBACK_LABEL = '\n\nHIS PUSHBACK:\n';
const DIRECTION_LABEL = '\n\nHIS DIRECTION:\n';
const REPLY_LABEL = '\n\nYOUR REPLY:\n';
const ANSWER_LABEL = '\n\nHIS ANSWER:\n';

const clean = (value) => String(value ?? '').trim();

export function buildFollowUpEntryText(
  { entryText, priorReading, pushback, reply, answer, intent } = {},
  maxChars = FOLLOW_UP_MAX_CHARS
) {
  const userLabel = intent === ARC_INTENT.GO_FURTHER ? DIRECTION_LABEL : PUSHBACK_LABEL;
  const ans = clean(answer).slice(0, FOLLOW_UP_ANSWER_MAX_CHARS);
  const closing = ans.length > 0;

  let budget = maxChars - (ENTRY_LABEL.length + READING_LABEL.length + userLabel.length);
  if (closing) budget -= REPLY_LABEL.length + ANSWER_LABEL.length + ans.length;
  budget = Math.max(0, budget);

  // Turn 2: the reply closed on the question he answered, so it keeps its tail.
  let replyText = '';
  if (closing) {
    const replyRaw = clean(reply);
    replyText = replyRaw.length > budget ? replyRaw.slice(replyRaw.length - budget) : replyRaw;
    budget = Math.max(0, budget - replyText.length);
  }

  const pushbackRaw = clean(pushback);
  const pb = closing
    ? pushbackRaw.slice(0, Math.min(FOLLOW_UP_PUSHBACK_MAX_CHARS, budget))
    : pushbackRaw;
  budget = Math.max(0, budget - pb.length);

  const readingRaw = clean(priorReading);
  const reading = readingRaw
    ? readingRaw.slice(0, Math.min(FOLLOW_UP_READING_MAX_CHARS, budget))
    : NO_READING_RECORDED;
  budget = Math.max(0, budget - reading.length);

  const entry = clean(entryText).slice(0, budget);

  const head = `${ENTRY_LABEL}${entry}${READING_LABEL}${reading}${userLabel}${pb}`;
  return closing ? `${head}${REPLY_LABEL}${replyText}${ANSWER_LABEL}${ans}` : head;
}

// "It landed": the entry and the reading he accepted, nothing of his. Same
// caps as above — the reading first, the entry takes the remainder.
export function buildLandedEntryText({ entryText, priorReading } = {}, maxChars = FOLLOW_UP_MAX_CHARS) {
  let budget = Math.max(0, maxChars - (ENTRY_LABEL.length + READING_LABEL.length));
  const readingRaw = clean(priorReading);
  const reading = readingRaw
    ? readingRaw.slice(0, Math.min(FOLLOW_UP_READING_MAX_CHARS, budget))
    : NO_READING_RECORDED;
  budget = Math.max(0, budget - reading.length);
  const entry = clean(entryText).slice(0, budget);
  return `${ENTRY_LABEL}${entry}${READING_LABEL}${reading}`;
}
