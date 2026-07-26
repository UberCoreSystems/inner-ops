/**
 * computeBehavioralRecord — a pure, effort-weighted census of the real work a
 * user has produced, read across every module. It is the authoritative tally
 * at the center of the Oracle card: not raw totals (the Stats grid already
 * shows those), not a score, not a rank — a count of artifacts that each cost
 * genuine effort to create.
 *
 * PURE BY DESIGN. It takes already-fetched arrays and returns counts, with no
 * I/O of its own. That is the deliberate correction over the previous version,
 * which was an async reader whose unit tests passed against fixtures the app
 * never actually wrote — hiding that three of its six counters read the wrong
 * collection or non-existent fields. Every field read here is verified against
 * the real write paths; a pure function lets the tests use real-shaped docs.
 *
 * Two field-level truths this encodes, both easy to get wrong:
 *
 *   - Confirmed kills live in the `confirmedKills` collection, NOT in
 *     `killTargets` with `status:'killed'` (that status is never written). And
 *     `activeDuration` on a kill is calendar age, not days held — so held-tier
 *     counts use the realized `streak`, falling back to the completed
 *     threshold, never `activeDuration`.
 *
 *   - Journal depth is the `metacognitiveDepth` field ('Surface'|'Pattern'|
 *     'Identity'), not the unrelated `classification` (cross-module extraction)
 *     and certainly not `event`/`attribution`, which journal docs never store.
 */

import { isFinalizedRule, getHeldStreakDays } from './ruleState.js';
import { RELAPSE_ENTRY_TYPES } from './schema.js';
import { getConsecutiveDaysRequired as resolveThreshold } from './killTargetThreshold.js';
import { toMs } from './dateUtils.js';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Days a confirmed kill was actually held: the realized consecutive streak at
// kill time. A kill only fires when streak >= threshold (>= 21), so a valid
// streak is authoritative. When the streak is 0/absent, the completed-threshold
// fallback is honored ONLY if the contract's calendar age at kill time could
// have contained that streak — a quick-kill minutes after creation held
// nothing and must not census as held ≥ threshold. When the age is shorter,
// the age itself (capped at threshold) is the ceiling. Docs with no dates at
// all (pure legacy) keep the threshold fallback. Never activeDuration alone
// (calendar age, overstates).
const heldDays = (kill) => {
  const s = Number(kill?.streak);
  if (Number.isFinite(s) && s > 0) return Math.floor(s);
  const threshold = resolveThreshold(kill);
  const killedMs = toMs(kill?.killedAt) || toMs(kill?.archivedAt) || toMs(kill?.timestamp);
  const createdMs = toMs(kill?.createdAt);
  if (killedMs && createdMs) {
    const ageDays = Math.floor((killedMs - createdMs) / MS_PER_DAY);
    return Math.max(0, Math.min(ageDays, threshold));
  }
  return threshold;
};

// Escape autopsies on a set of targets: entries carrying any written analysis.
// escapeData rides with a target into confirmedKills, so counting both live
// and confirmed targets covers escaped-then-killed patterns without double
// counting (the atomic move deletes the source).
const escapeAutopsies = (targets) =>
  targets.reduce((sum, t) => {
    const escapes = Array.isArray(t?.escapeData) ? t.escapeData : [];
    return sum + escapes.filter(
      (e) => (e?.context || '').trim() ||
             (e?.rationalization || '').trim() ||
             (e?.prevention || '').trim(),
    ).length;
  }, 0);

/**
 * @param {{
 *   killTargets?: object[], hardLessons?: object[], journalEntries?: object[],
 *   relapseEntries?: object[], confirmedKills?: object[], syntheses?: object[]
 * }} data  already-fetched module arrays
 * @param {number} [now]  injectable clock for deterministic tests
 * @returns {{ execution: object, intelligence: object, isEmpty: boolean }}
 */
export function computeBehavioralRecord(data = {}, now = Date.now()) {
  const {
    killTargets = [],
    hardLessons = [],
    journalEntries = [],
    relapseEntries = [],
    confirmedKills = [],
    syntheses = [],
  } = data;

  // ── Execution — hard-won artifacts, all-time (un-pruned collections) ──

  // Every confirmed kill was held to at least its threshold (>= 21). The >=60
  // tier is a strict subset the component renders on its own line.
  const kills21 = confirmedKills.filter((k) => heldDays(k) >= 21).length;
  const kills60 = confirmedKills.filter((k) => heldDays(k) >= 60).length;

  // Forensic writing: escape autopsies across live + confirmed targets, plus
  // written relapse post-mortems (an actual relapse with a reflection).
  const relapseAnalyses = relapseEntries.filter(
    (e) => e?.entryType === RELAPSE_ENTRY_TYPES.RELAPSE && (e?.reflection || '').trim(),
  ).length;
  const autopsies = escapeAutopsies(killTargets) + escapeAutopsies(confirmedKills) + relapseAnalyses;

  // Finalized rules currently held — held excludes under-review rules
  // (getHeldStreakDays returns 0 while a rule's most-recent break is
  // unresolved). The held complement to SignalReport's "rules violated".
  const rulesHeld = hardLessons.filter(
    (l) => isFinalizedRule(l) && getHeldStreakDays(l, now) > 0,
  ).length;

  // Entries the Oracle classified at genuine depth. All-time count, distinct
  // from the card's 30-day depth distribution.
  const deepEntries = journalEntries.filter(
    (e) => e?.metacognitiveDepth === 'Pattern' || e?.metacognitiveDepth === 'Identity',
  ).length;

  // ── Intelligence — synthesis engagement (on record; syntheses is pruned to
  // ~24 newest, so these are current-record counts, not strict lifetime) ──

  const reckoningDocs = syntheses.filter((d) => d?.type === 'reckoning');
  // Briefings write no `type` field; absence means synthesis.
  const briefings = syntheses.filter((d) => (d?.type || 'synthesis') !== 'reckoning').length;
  const reckonings = reckoningDocs.length;
  const contradictions = reckoningDocs.reduce(
    (sum, d) => sum + (Number(d?.meta?.contradictionCount) || 0),
    0,
  );

  // Cadence health — days since the most recent briefing or reckoning. Always
  // accurate regardless of the prune cap. Null when nothing has run.
  const latestMs = syntheses.reduce((max, d) => {
    const ms = Date.parse(d?.generatedAt);
    return Number.isFinite(ms) && ms > max ? ms : max;
  }, -Infinity);
  const daysSinceLastBriefing = latestMs > -Infinity
    ? Math.max(0, Math.floor((now - latestMs) / MS_PER_DAY))
    : null;

  const execution = { kills21, kills60, autopsies, rulesHeld, deepEntries };
  const intelligence = { briefings, reckonings, contradictions, daysSinceLastBriefing };

  const isEmpty =
    kills21 === 0 && autopsies === 0 && rulesHeld === 0 && deepEntries === 0 &&
    briefings === 0 && reckonings === 0 && contradictions === 0 &&
    daysSinceLastBriefing === null;

  return { execution, intelligence, isEmpty };
}

export default computeBehavioralRecord;
