/**
 * Rule-state derivation — the single definition of "violated / under review /
 * held-streak" for finalized Hard Lessons rules.
 *
 * A "rule" is a finalized Hard Lesson doc with non-empty `ruleGoingForward`.
 * A "break" is an entry in that doc's `violations[]` array
 * ({ date, source, note?, cause?, correction?, resolvedAt? }) — written by the
 * in-the-moment "Rule broken" button and the Weekly Rule Review. The LEGACY
 * model recorded a break as a SEPARATE lesson doc tagged `isRuleViolation: true`
 * (optionally pointing at a rule via `violatedRuleId`). `getViolatedRules`
 * folds both in so every reader — Synthesis, Oracle behavioral context, the
 * Pattern Confrontation card, the clarity score — agrees on what counts as
 * violated. Two writers with disagreeing readers is exactly the split this
 * module exists to close.
 *
 * State is DERIVED from timestamps + the per-break after-action payload — there
 * is deliberately no stored `underReview` flag and no cached `heldStreakDays`.
 * An append-only violation log as the sole source of truth is what prevents the
 * desync; a cached streak would also be freezable/gameable.
 *
 * Pure and Firebase-free (like composeMirrorReading.js) so React components and
 * the node:test suites share one definition.
 */

import { toMs, MS_PER_DAY, getEntryTimestamp } from './dateUtils.js';

export const RULE_GRADUATION_DAYS = 28;

const ruleText = (lesson) => (lesson?.ruleGoingForward || '').trim();
const breakDate = (v) => v?.date || v?.timestamp || null;
const withinWindow = (ms, windowDays, now) =>
  ms > 0 && now - ms <= windowDays * MS_PER_DAY;

export function isFinalizedRule(lesson) {
  return lesson?.isFinalized === true && ruleText(lesson).length > 0;
}

/**
 * Newest break for a rule from its OWN doc. Reads `violations[]` and, for old
 * docs that only ever set `lastViolatedAt`, synthesizes a pseudo-break so the
 * rule still registers. Returns null if the rule was never broken.
 */
export function getMostRecentBreak(lesson) {
  const violations = Array.isArray(lesson?.violations) ? lesson.violations : [];
  let newest = null;
  let newestMs = -Infinity;
  for (const v of violations) {
    const ms = toMs(breakDate(v));
    if (ms > newestMs) { newestMs = ms; newest = v; }
  }
  const lastMs = toMs(lesson?.lastViolatedAt);
  if (lastMs > 0 && lastMs > newestMs) return { date: lesson.lastViolatedAt };
  return newest;
}

/**
 * A rule is under review when its most-recent break is unresolved — no
 * after-action (`resolvedAt`) and no legacy free-text `note`. New breaks never
 * carry `note`, so a legacy note counts as an informal resolution (back-compat).
 */
export function isUnderReview(lesson) {
  const b = getMostRecentBreak(lesson);
  if (!b) return false;
  return !b.resolvedAt && !(b.note && String(b.note).trim());
}

/**
 * Days the rule has been honored since its streak anchor — the later of
 * finalization and the most-recent re-affirmation (after-action `resolvedAt`).
 * Returns 0 while under review: the streak is broken until the rule is
 * re-affirmed.
 */
export function getHeldStreakDays(lesson, now = Date.now()) {
  if (!isFinalizedRule(lesson)) return 0;
  if (isUnderReview(lesson)) return 0;
  const violations = Array.isArray(lesson?.violations) ? lesson.violations : [];
  let anchorMs = toMs(lesson?.finalizedAt) || toMs(lesson?.createdAt);
  for (const v of violations) {
    const rMs = toMs(v?.resolvedAt);
    if (rMs > anchorMs) anchorMs = rMs;
  }
  if (!anchorMs) return 0;
  return Math.max(0, Math.floor((now - anchorMs) / MS_PER_DAY));
}

/**
 * Whether the rule has a break on its OWN doc within `windowDays` — any
 * `violations[]` entry OR `lastViolatedAt`. A RESOLVED break still counts:
 * after-action clears the operational under-review state, never the historical
 * violation (anti-gaming). Used by the clarity score's rule-integrity counter.
 */
export function isViolatedInWindow(lesson, windowDays, now = Date.now()) {
  const violations = Array.isArray(lesson?.violations) ? lesson.violations : [];
  if (violations.some(v => withinWindow(toMs(breakDate(v)), windowDays, now))) return true;
  return withinWindow(toMs(lesson?.lastViolatedAt), windowDays, now);
}

const projectRule = (lesson, now, lastBreakMs) => {
  const text = ruleText(lesson);
  return {
    id: lesson.id,
    ruleGoingForward: text,
    rule: text, // alias for legacy readers that key off `.rule`
    lesson,
    underReview: isUnderReview(lesson),
    heldStreakDays: getHeldStreakDays(lesson, now),
    lastBreakAt: lastBreakMs || null,
  };
};

/**
 * Every rule violated within `windowDays`, newest break first. Unifies both
 * representations and de-dupes per rule:
 *   (1) New model — a finalized rule with an in-window break on its own doc.
 *   (2) Legacy model — a doc tagged `isRuleViolation` in window; if it points
 *       at a finalized rule via `violatedRuleId`, it counts against that rule,
 *       otherwise it surfaces on its own `ruleGoingForward` text.
 *
 * @returns {Array<{ id, ruleGoingForward, rule, lesson, underReview, heldStreakDays, lastBreakAt }>}
 */
export function getViolatedRules(hardLessons, { windowDays = 28, now = Date.now() } = {}) {
  const lessons = Array.isArray(hardLessons) ? hardLessons : [];
  const out = [];
  const seen = new Set();

  // (1) New model.
  for (const l of lessons) {
    if (!isFinalizedRule(l)) continue;
    if (!isViolatedInWindow(l, windowDays, now)) continue;
    const b = getMostRecentBreak(l);
    out.push(projectRule(l, now, toMs(breakDate(b))));
    seen.add(l.id);
  }

  // (2) Legacy model.
  for (const l of lessons) {
    if (!l?.isRuleViolation) continue;
    const ms = getEntryTimestamp(l);
    if (!withinWindow(ms, windowDays, now)) continue;
    const target = l.violatedRuleId
      ? lessons.find(x => x.id === l.violatedRuleId && isFinalizedRule(x))
      : null;
    if (target) {
      if (seen.has(target.id)) continue;
      seen.add(target.id);
      out.push(projectRule(target, now, ms));
    } else if (ruleText(l)) {
      if (seen.has(l.id)) continue;
      seen.add(l.id);
      out.push(projectRule(l, now, ms));
    }
  }

  out.sort((a, b) => (b.lastBreakAt || 0) - (a.lastBreakAt || 0));
  return out;
}
