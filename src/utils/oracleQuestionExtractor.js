/**
 * Oracle closing-question extractor.
 *
 * Used in two places:
 *   1. Pool aggregator backfill — when an entry has Oracle prose
 *      (oracleJudgment, oracleWisdom, oracleFeedback, closure/escape one-liners)
 *      but no structured `oracleClosingQuestion` field, we extract the
 *      question from the prose so older entries still feed the rotation.
 *   2. Cloud Function fallback — if Claude omits the
 *      <closing_question>...</closing_question> tags, the same heuristic runs
 *      server-side on the raw prose.
 *
 * Heuristic: walk sentences from the end, return the last sentence that ends
 * with '?'. Stop at the first hit. Skip rhetorical hedges and questions
 * inside quoted material.
 */

const QUESTION_TAG_REGEX = /<closing_question>\s*([\s\S]*?)\s*<\/closing_question>/i;

const SENTENCE_END_REGEX = /(?<=[.!?])\s+(?=[A-Z"'‘“(])/g;

const RHETORICAL_PREFIXES = [
  /^or\s*[:,]/i,
  /^maybe\s+/i,
  /^perhaps\s+/i,
];

function stripQuotedQuestion(sentence) {
  // Strip surrounding straight or smart quotes.
  return sentence
    .replace(/^[\s"'‘“]+/, '')
    .replace(/[\s"'’”]+$/, '')
    .trim();
}

function isRhetoricalHedge(sentence) {
  return RHETORICAL_PREFIXES.some((re) => re.test(sentence.trim()));
}

/**
 * Extract a `<closing_question>...</closing_question>` block if present.
 * Returns the inner text, or null when no tag is found.
 */
export function extractTaggedQuestion(prose) {
  if (typeof prose !== 'string' || !prose) return null;
  const match = prose.match(QUESTION_TAG_REGEX);
  if (!match) return null;
  const inner = (match[1] || '').trim();
  return inner || null;
}

/**
 * Strip closing-question tags from prose (preserving the inner question text
 * so the modal still renders the full Oracle response).
 */
export function stripQuestionTags(prose) {
  if (typeof prose !== 'string' || !prose) return prose;
  return prose.replace(QUESTION_TAG_REGEX, (_full, inner) => (inner || '').trim());
}

/**
 * Heuristic extractor — finds the last sentence ending in '?'.
 * Returns null when no sensible question is found, the prose is empty, or
 * the candidate is purely rhetorical hedging.
 */
export function extractClosingQuestion(prose) {
  if (typeof prose !== 'string') return null;
  const trimmed = prose.trim();
  if (!trimmed) return null;

  // 1. Prefer a tagged question if the prose still has one.
  const tagged = extractTaggedQuestion(trimmed);
  if (tagged) return tagged;

  // 2. Walk sentences from the end and return the last sentence ending in '?'.
  // Use a regex split that tries to respect sentence boundaries.
  const cleaned = trimmed.replace(/\s+/g, ' ').trim();
  const sentences = cleaned.split(SENTENCE_END_REGEX).map((s) => s.trim()).filter(Boolean);

  for (let i = sentences.length - 1; i >= 0; i -= 1) {
    const candidate = stripQuotedQuestion(sentences[i]);
    if (!candidate.endsWith('?')) continue;
    if (isRhetoricalHedge(candidate)) continue;
    if (candidate.length < 6) continue;
    return candidate;
  }

  // 3. Last-ditch: if the entire prose is a single short question (one-liners
  // from Kill List closure/escape often are), return it as-is. Only when
  // there is exactly one sentence — multi-sentence prose where every
  // candidate already failed should not be salvaged here.
  if (sentences.length === 1 && cleaned.endsWith('?') && cleaned.length < 280 && cleaned.length >= 6) {
    return cleaned;
  }

  return null;
}
