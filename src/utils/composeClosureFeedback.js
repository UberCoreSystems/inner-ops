/**
 * composeClosureFeedback — pure helper for the Kill List closure flow.
 *
 * `generateAIFeedback` returns a structured object
 * `{ text, metacognitiveDepth, closingQuestion }` on every code path.
 * The Dashboard closure flow needs flat string fields to persist to
 * Firestore (`closureOracleResponse`) and render in the modal — this
 * helper does the extraction with a mode-specific fallback when Oracle
 * fails or returns empty prose.
 *
 * Also coerces legacy map-shaped values (older confirmed-kill records
 * written before the producer was fixed) into the same string shape, so
 * read sites can use this helper for past records too.
 */

const KILL_FALLBACK = 'Contract closed. Logged to archive.';
const ESCAPE_FALLBACK = 'Breach logged. Regroup.';

const pickFallback = (mode) => (mode === 'kill' ? KILL_FALLBACK : ESCAPE_FALLBACK);

/**
 * @param {*} feedback — the resolved value from `generateAIFeedback(...)`,
 *   or a value already in Firestore (string from the legacy/correct path,
 *   map from the buggy path).
 * @param {'kill' | 'escape'} mode
 * @returns {{ oracleResponse: string, oracleClosingQuestion: string | null }}
 */
export function composeClosureFeedback(feedback, mode) {
  const fallback = pickFallback(mode);

  if (feedback == null) {
    return { oracleResponse: fallback, oracleClosingQuestion: null };
  }

  if (typeof feedback === 'string') {
    const trimmed = feedback.trim();
    return {
      oracleResponse: trimmed || fallback,
      oracleClosingQuestion: null,
    };
  }

  if (typeof feedback === 'object') {
    const text = typeof feedback.text === 'string' ? feedback.text.trim() : '';
    const closingQuestion =
      typeof feedback.closingQuestion === 'string' && feedback.closingQuestion.trim()
        ? feedback.closingQuestion.trim()
        : null;
    return {
      oracleResponse: text || fallback,
      oracleClosingQuestion: closingQuestion,
    };
  }

  return { oracleResponse: fallback, oracleClosingQuestion: null };
}

/**
 * Read-time coercion for surfaces that render `closureOracleResponse`
 * directly. Tolerates the legacy map shape silently.
 *
 * @param {*} value — Firestore field value (string, map, or missing).
 * @returns {string} safe for rendering as a React child.
 */
export function coerceClosureResponseText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.text === 'string') {
    return value.text;
  }
  return '';
}

export default composeClosureFeedback;
