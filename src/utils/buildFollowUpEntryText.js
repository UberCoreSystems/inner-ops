/**
 * Entry text for an Oracle follow-up ("Go deeper").
 *
 * The follow-up template (functions/index.js, oracle_challenge) reads three
 * labeled sections: the original entry, the Oracle's own prior reading, and
 * the user's pushback. Without the prior reading the Oracle cannot hold or
 * concede on the record — it never sees what it said.
 *
 * Budget: the cloud function rejects entry text longer than
 * ORACLE_MAX_ENTRY_TEXT_CHARS (functions/config.js, 20000). The pushback is
 * never cut (it is the turn), the reading is capped, and the entry takes the
 * remainder. The labels count toward the total.
 */
export const FOLLOW_UP_MAX_CHARS = 20000;
export const FOLLOW_UP_READING_MAX_CHARS = 4000;
export const NO_READING_RECORDED = '(none recorded)';

const ENTRY_LABEL = 'ORIGINAL ENTRY:\n';
const READING_LABEL = '\n\nYOUR PRIOR READING:\n';
const PUSHBACK_LABEL = '\n\nHIS PUSHBACK:\n';

export function buildFollowUpEntryText({ entryText, priorReading, pushback } = {}, maxChars = FOLLOW_UP_MAX_CHARS) {
  const pb = String(pushback ?? '').trim();
  const labelsLength = ENTRY_LABEL.length + READING_LABEL.length + PUSHBACK_LABEL.length;
  let budget = Math.max(0, maxChars - labelsLength - pb.length);

  const readingRaw = String(priorReading ?? '').trim();
  const reading = readingRaw
    ? readingRaw.slice(0, Math.min(FOLLOW_UP_READING_MAX_CHARS, budget))
    : NO_READING_RECORDED;
  budget = Math.max(0, budget - reading.length);

  const entry = String(entryText ?? '').trim().slice(0, budget);

  return `${ENTRY_LABEL}${entry}${READING_LABEL}${reading}${PUSHBACK_LABEL}${pb}`;
}
