// BER-138: Evasion marker detection for Oracle prompt calibration.
// Internal use only — markers are never surfaced to the user.
//
// Linguistic basis: Pennebaker (1986) expressive writing research;
// passive voice, externalization, hedging, and low specificity are
// documented avoidance markers in reflective writing.

const PASSIVE_VOICE_RE = /\b(?:was|were|is|are|been|be|get|got)\s+\w+ed\b/gi;

const EXTERNALIZATION_RE = /\b(?:it just happened|they made me|they caused|it wasn't my|wasn't my fault|circumstances|situation forced|out of my control|not my fault|he made me|she made me|everyone else|it was just)\b/gi;

// Requires 2+ matches to avoid penalizing normal epistemic uncertainty
const HEDGING_RE = /\b(?:kind of|sort of|maybe|i guess|i suppose|perhaps|could be|might be|not sure|possibly|probably just|a bit|somewhat|not really|i don't know|hard to say)\b/gi;

// Requires 3+ matches — single vague words are not a signal
const LOW_SPECIFICITY_RE = /\b(?:stuff|things|everything|nothing|always|never|people|someone|somehow|somewhere|whatever|a lot|some things|various|certain things)\b/gi;

/**
 * Detect linguistic evasion markers in a text entry.
 * Returns an object with boolean flags per marker type and a total count.
 * Count >= 2 indicates meaningful evasion that warrants Oracle calibration.
 *
 * @param {string} text - The entry text to analyze
 * @returns {{ passiveVoice: boolean, externalization: boolean, hedging: boolean, lowSpecificity: boolean, count: number }}
 */
export function detectEvasionMarkers(text) {
  if (!text || text.length < 20) {
    return { passiveVoice: false, externalization: false, hedging: false, lowSpecificity: false, count: 0 };
  }

  const passiveVoice = PASSIVE_VOICE_RE.test(text);
  PASSIVE_VOICE_RE.lastIndex = 0;

  const externalization = EXTERNALIZATION_RE.test(text);
  EXTERNALIZATION_RE.lastIndex = 0;

  const hedgingMatches = text.match(new RegExp(HEDGING_RE.source, 'gi')) || [];
  const hedging = hedgingMatches.length >= 2;

  const specificityMatches = text.match(new RegExp(LOW_SPECIFICITY_RE.source, 'gi')) || [];
  const lowSpecificity = specificityMatches.length >= 3;

  const count = [passiveVoice, externalization, hedging, lowSpecificity].filter(Boolean).length;

  return { passiveVoice, externalization, hedging, lowSpecificity, count };
}
