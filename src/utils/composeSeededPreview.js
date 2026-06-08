/**
 * composeSeededPreview — pure function that builds an HONEST day-one preview
 * of the Mirror / Synthesis from the user's onboarding answers, for the cold-
 * start case where no module data exists yet.
 *
 * The point: a new user's strongest feature (the cross-module mirror) is empty
 * on day one. Rather than a blank surface, show what the mirror WILL read once
 * they log — anchored to what they actually declared at onboarding.
 *
 * Honesty rules (non-negotiable):
 *   - Reflect ONLY real, user-stated profile fields. Never fabricate a metric
 *     (no invented escapes, relapses, violations, streaks, counts, or "this
 *     week"). This surface describes intent, not observed behavior.
 *   - Deterministic given input — no AI calls, no randomness.
 *   - Declarative voice. No motivation, no wellness framing.
 *
 * Reads from the userProfiles doc: focusStatement, primaryDriver,
 * confrontationCriteria[], knownTriggers[], activeSituations[].
 */

import { resolveArchetypeLabel } from './relapseTaxonomy.js';

// Client-side driver labels (second person). Mirrors functions/index.js
// DRIVER_LABELS; kept local so the client never imports from functions/.
const DRIVER_LABELS = {
  addiction: 'breaking an addiction or compulsive pattern',
  loss: 'processing a loss, betrayal, or painful experience',
  clarity: 'building mental clarity and discipline',
  elimination: 'eliminating behaviors that are costing you',
  becoming: 'becoming someone specific — not just fixing problems',
};

const cleanStr = (s) => (typeof s === 'string' ? s.trim() : '');
const cleanList = (arr) =>
  Array.isArray(arr) ? arr.map((x) => cleanStr(x)).filter(Boolean) : [];

/**
 * @param {object|null} profile — the userProfiles doc (or null if missing).
 * @returns {{
 *   status: 'seeded'|'partial'|'empty',
 *   direction: string|null,
 *   driverLine: string|null,
 *   watchFor: string[],
 *   situations: string[],
 *   firstQuestion: string|null,
 *   lines: string[],
 *   routeHint: {label: string, to: string}|null,
 * }}
 */
export function composeSeededPreview(profile) {
  const p = profile || {};

  const direction = cleanStr(p.focusStatement) || null;

  const driverKey = cleanStr(p.primaryDriver);
  const driverLabel = DRIVER_LABELS[driverKey] || null;
  const driverLine = driverLabel ? `Here to: ${driverLabel}.` : null;

  const watchFor = cleanList(p.knownTriggers);
  const situations = cleanList(p.activeSituations);

  const criteria = Array.isArray(p.confrontationCriteria) ? p.confrontationCriteria : [];
  const firstCriterion = criteria.find((c) => c && cleanStr(c.question)) || null;
  const firstQuestion = firstCriterion ? cleanStr(firstCriterion.question) : null;
  const watchArchetype =
    firstCriterion && cleanStr(firstCriterion.archetypeName)
      ? resolveArchetypeLabel(cleanStr(firstCriterion.archetypeName))
      : null;

  // Nothing to seed → honest "start here", never fabricated data.
  const hasAnything =
    !!direction || !!driverLabel || watchFor.length > 0 || situations.length > 0 || !!firstQuestion;
  if (!hasAnything) {
    return {
      status: 'empty',
      direction: null,
      driverLine: null,
      watchFor: [],
      situations: [],
      firstQuestion: null,
      lines: ['Nothing declared yet. Start with one contract or one focus statement.'],
      routeHint: { label: 'Name your first target', to: '/ledger' },
    };
  }

  // Compose "what the mirror will read" lines — descriptive of intent only.
  const lines = [];
  if (driverLine) lines.push(driverLine);
  if (situations.length > 0) {
    lines.push(`Currently navigating: ${situations.join('; ')}.`);
  }
  if (watchFor.length > 0) {
    lines.push(`The mirror will watch the points you named: ${watchFor.join('; ')}.`);
  }
  if (watchArchetype) {
    lines.push(`You asked to be confronted when "${watchArchetype}" recurs.`);
  }
  lines.push('Log a contract, a lesson, or a signal and this surface starts reading across them.');

  // 'seeded' once a real direction exists; otherwise 'partial'.
  const status = direction ? 'seeded' : 'partial';

  return {
    status,
    direction,
    driverLine,
    watchFor,
    situations,
    firstQuestion,
    lines,
    routeHint: null,
  };
}

export default composeSeededPreview;
