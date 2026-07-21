/**
 * Signal Report — de-gamified replacement for the former Clarity Score.
 *
 * Inner Ops measures truth, not reward. This module no longer returns a numeric
 * composite, a rank, a streak bonus, or any completion multiplier. It reads
 * three behavioral signals from Firestore and composes them into a prose-ready
 * structured report.
 *
 * Specification: see /SCORING.md at the repo root for the canonical signal
 * definitions, window sizes, and what is intentionally NOT measured.
 *
 * Readers:
 *   - getConfrontationRate      — did the user engage with Oracle feedback,
 *                                 or dismiss it, over the recent window?
 *   - getActiveDriftSignals     — thin wrapper around detectDriftSignals.
 *   - getRuleIntegrityStatus    — how many finalized Hard Lessons rules are
 *                                 being violated inside the window?
 *
 * Composer:
 *   - composeSignalReport       — runs all three and returns a report object
 *                                 keyed for the SignalReport component.
 *
 * Design notes:
 *   - No numeric score. No rank. No color-coded output.
 *   - No completion multiplier (formerly 1.2x/1.5x at 60%/80% kill-list
 *     completion). Removed by product directive — rewarding completion is
 *     gameable and contradicts "measurement as truth, not reward."
 *   - Firestore and drift-detector dependencies are injected (default to the
 *     real implementations) so tests can drive readers with in-memory fixtures
 *     without ESM module-mock flags.
 *   - Each reader optionally computes a prior-window comparison (trajectory
 *     delta). Opt in via `compareToPrior: true`. This is intrinsic feedback —
 *     a factual comparison to the immediately preceding window, not a score.
 */

import logger from './logger.js';
import { MS_PER_DAY, toMs } from './dateUtils.js';

// Firestore/detector imports are resolved lazily so tests that inject a fake
// `readUserData`/`detectDriftSignals` never pull the Firebase SDK (or any
// transitive module with unresolvable bare imports) into the module graph.
// Callers in the app pay a one-time dynamic-import cost on first use.
const loadDefaults = async () => {
  const [firebaseUtils, driftMod] = await Promise.all([
    import('./firebaseUtils.js'),
    import('./detectDriftSignals.js'),
  ]);
  return {
    defaultReadUserData: firebaseUtils.readUserData,
    defaultDetectDriftSignals: driftMod.detectDriftSignals,
  };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const withinWindow = (value, windowDays) => {
  const ms = toMs(value);
  if (!ms) return false;
  return Date.now() - ms <= windowDays * MS_PER_DAY;
};

// Returns true when `value` falls inside the window [now - (offsetDays+windowDays), now - offsetDays].
// offsetDays = 0 → same as withinWindow. offsetDays = windowDays → the window
// immediately preceding the current one.
const withinOffsetWindow = (value, windowDays, offsetDays) => {
  const ms = toMs(value);
  if (!ms) return false;
  const now = Date.now();
  const start = now - (offsetDays + windowDays) * MS_PER_DAY;
  const end = now - offsetDays * MS_PER_DAY;
  return ms > start && ms <= end;
};

// ─── Confrontation Rate ───────────────────────────────────────────────────────

/**
 * Measure the user's engagement with Oracle feedback over the recent window.
 *
 * An "engaged" entry is one that has an `oracleFeedback` (or `oracleEngaged`)
 * field present and was created within the window. A "dismissed" entry is one
 * from the same period where Oracle feedback was generated but the user took
 * no follow-up action on it (`oracleDismissed === true`).
 *
 * Pattern Confrontation Card writes to the `confrontations` collection on
 * every confront tap (oracleEngaged: true) and on every manual dismiss
 * (oracleDismissed: true), so the metric now reflects the Dashboard's
 * Confront flow. Other modules (Journal, Kill List, Hard Lessons, Relapse)
 * still rely on legacy `oracleFeedback` presence; their write
 * paths can later add explicit `oracleEngaged` / `oracleDismissed` flags for
 * tighter accounting, but they're already covered by the fallback.
 *
 * @param {string} userId — kept for signature parity; reads are already
 *   user-scoped through readUserData.
 * @param {number} windowDays — default 14.
 * @param {{ readUserData?: Function, compareToPrior?: boolean }} deps — for tests.
 * @returns {Promise<{
 *   engagedCount: number,
 *   dismissedCount: number,
 *   percentage: number|null,
 *   prior?: { engagedCount: number, dismissedCount: number, percentage: number|null }
 * }>}
 */
export async function getConfrontationRate(userId, windowDays = 14, deps = {}) {
  const readUserData = deps.readUserData || (await loadDefaults()).defaultReadUserData;
  const compareToPrior = deps.compareToPrior === true;
  try {
    const [journal, killTargets, hardLessons, relapse, confrontations] = await Promise.all([
      readUserData('journalEntries'),
      readUserData('killTargets'),
      readUserData('hardLessons'),
      readUserData('relapseEntries'),
      readUserData('confrontations'),
    ]);

    const all = [
      ...(journal || []),
      ...(killTargets || []),
      ...(hardLessons || []),
      ...(relapse || []),
      ...(confrontations || []),
    ];

    // Reduce a set of entries to { engagedCount, dismissedCount, percentage }.
    // Shared across current and prior windows so both use identical logic.
    const tally = (entries) => {
      const withOracle = entries.filter(
        e => e.oracleFeedback || e.oracleEngaged === true || e.oracleDismissed === true
      );
      if (withOracle.length === 0) {
        return { engagedCount: 0, dismissedCount: 0, percentage: null };
      }
      const engagedCount = withOracle.filter(
        e => e.oracleEngaged === true || (e.oracleFeedback && e.oracleDismissed !== true)
      ).length;
      const dismissedCount = withOracle.filter(e => e.oracleDismissed === true).length;
      const total = engagedCount + dismissedCount;
      const percentage = total > 0 ? Math.round((engagedCount / total) * 100) : null;
      return { engagedCount, dismissedCount, percentage };
    };

    const current = tally(all.filter(e => withinWindow(e.createdAt, windowDays)));

    if (!compareToPrior) return current;

    // Prior window: the `windowDays` period immediately preceding the current one.
    // Computed in-memory from the same fetched entries — no second Firestore query.
    const priorEntries = all.filter(e => withinOffsetWindow(e.createdAt, windowDays, windowDays));
    const prior = tally(priorEntries);
    return { ...current, prior };
  } catch (err) {
    logger.warn('getConfrontationRate: read failed', err?.message);
    const fallback = { engagedCount: 0, dismissedCount: 0, percentage: null };
    return compareToPrior ? { ...fallback, prior: { ...fallback } } : fallback;
  }
}

// ─── Drift Signals ────────────────────────────────────────────────────────────

/**
 * Thin wrapper around detectDriftSignals. Returns the signals array (current
 * point-in-time detector output) and, when `compareToPrior: true`, a count of
 * signals that would have fired against the prior window's data.
 *
 * Prior-window approximation:
 *   detectDriftSignals is a point-in-time detector that reads the full
 *   relapse/kill-target history. To approximate "how many signals were active
 *   during the previous window," we re-run the detector against only the
 *   entries whose timestamps fall inside the prior window. This is a
 *   principled reuse of the same rules engine, not a new heuristic — it asks
 *   "given only the data the user had produced in those 14 days, would the
 *   drift rules have fired?" Kill-target escapes are filtered by escape.date;
 *   relapse entries by their createdAt/timestamp.
 *
 * @param {string} userId
 * @param {{
 *   readUserData?: Function,
 *   detectDriftSignals?: Function,
 *   compareToPrior?: boolean,
 *   windowDays?: number
 * }} deps
 * @returns {Promise<Array<object>> | Promise<{ signals: Array<object>, priorSignalCount: number }>}
 */
export async function getActiveDriftSignals(userId, deps = {}) {
  let readUserData = deps.readUserData;
  let detectDriftSignals = deps.detectDriftSignals;
  if (!readUserData || !detectDriftSignals) {
    const d = await loadDefaults();
    readUserData = readUserData || d.defaultReadUserData;
    detectDriftSignals = detectDriftSignals || d.defaultDetectDriftSignals;
  }
  const compareToPrior = deps.compareToPrior === true;
  const windowDays = deps.windowDays ?? 14;
  try {
    const [relapse, killTargets] = await Promise.all([
      readUserData('relapseEntries'),
      readUserData('killTargets'),
    ]);
    const relapseArr = relapse || [];
    const killArr = killTargets || [];
    const { signals } = detectDriftSignals(relapseArr, killArr);
    const currentSignals = signals || [];

    if (!compareToPrior) return currentSignals;

    // Prior window: filter raw data by timestamp, then re-run the same detector.
    // Matches detectDriftSignals' own time extraction: createdAt.toDate() or
    // timestamp for relapse entries; escape.date for kill-target escapes.
    const relapseTime = (e) => e.createdAt?.toDate?.()?.getTime?.() ?? e.timestamp ?? 0;
    const priorRelapse = relapseArr.filter(e => {
      const t = relapseTime(e);
      return t && withinOffsetWindow(t, windowDays, windowDays);
    });
    const priorKillTargets = killArr
      .map(target => {
        const escapes = Array.isArray(target.escapes) ? target.escapes : [];
        const priorEscapes = escapes.filter(esc =>
          esc?.date && withinOffsetWindow(esc.date, windowDays, windowDays)
        );
        return { ...target, escapes: priorEscapes };
      })
      .filter(target => (target.escapes || []).length > 0);

    const priorResult = detectDriftSignals(priorRelapse, priorKillTargets);
    const priorSignalCount = (priorResult?.signals || []).length;

    return { signals: currentSignals, priorSignalCount };
  } catch (err) {
    logger.warn('getActiveDriftSignals: read failed', err?.message);
    return compareToPrior ? { signals: [], priorSignalCount: 0 } : [];
  }
}

// ─── Rule Integrity ───────────────────────────────────────────────────────────

/**
 * Count finalized Hard Lessons rules and how many were violated inside the
 * window. A "finalized rule" is a Hard Lesson with `isFinalized === true` and
 * a non-empty `ruleGoingForward`. A violation is recorded when the same lesson
 * carries a `violations` array entry whose timestamp falls inside the window,
 * or a `lastViolatedAt` inside the window.
 *
 * @param {string} userId
 * @param {number} windowDays — default 30.
 * @param {{ readUserData?: Function, compareToPrior?: boolean }} deps — for tests.
 * @returns {Promise<{
 *   finalizedRuleCount: number,
 *   violatedInWindow: number,
 *   priorViolatedInWindow?: number
 * }>}
 */
export async function getRuleIntegrityStatus(userId, windowDays = 30, deps = {}) {
  const readUserData = deps.readUserData || (await loadDefaults()).defaultReadUserData;
  const compareToPrior = deps.compareToPrior === true;
  try {
    const hardLessons = (await readUserData('hardLessons')) || [];
    const finalized = hardLessons.filter(
      l => l.isFinalized === true && (l.ruleGoingForward || '').trim().length > 0
    );

    // Shared counter so current and prior windows use identical logic.
    const countViolations = (predicate) => finalized.reduce((count, lesson) => {
      const violations = Array.isArray(lesson.violations) ? lesson.violations : [];
      const hitInArray = violations.some(v => predicate(v?.date || v?.timestamp || v));
      const hitLastViolated = predicate(lesson.lastViolatedAt);
      return count + (hitInArray || hitLastViolated ? 1 : 0);
    }, 0);

    const violatedInWindow = countViolations(v => withinWindow(v, windowDays));

    if (!compareToPrior) {
      return { finalizedRuleCount: finalized.length, violatedInWindow };
    }

    const priorViolatedInWindow = countViolations(
      v => withinOffsetWindow(v, windowDays, windowDays)
    );

    return {
      finalizedRuleCount: finalized.length,
      violatedInWindow,
      priorViolatedInWindow,
    };
  } catch (err) {
    logger.warn('getRuleIntegrityStatus: read failed', err?.message);
    const fallback = { finalizedRuleCount: 0, violatedInWindow: 0 };
    return compareToPrior ? { ...fallback, priorViolatedInWindow: 0 } : fallback;
  }
}

// ─── Composer ─────────────────────────────────────────────────────────────────

/**
 * Compose the three readers into a single structured report. No numeric
 * composite. Consumers (e.g. SignalReport.jsx) format this into prose.
 *
 * Dashboard opts in to prior-window trajectory deltas by default. Callers that
 * want the plain current-window report can pass `compareToPrior: false`.
 *
 * @param {string} userId
 * @param {{
 *   readUserData?: Function,
 *   detectDriftSignals?: Function,
 *   compareToPrior?: boolean
 * }} deps
 * @returns {Promise<object>}
 */
export async function composeSignalReport(userId, deps = {}) {
  const compareToPrior = deps.compareToPrior !== false; // default true
  const readerDeps = { ...deps, compareToPrior };

  const [confrontationRate, driftSignalsResult, ruleIntegrity] = await Promise.all([
    getConfrontationRate(userId, 14, readerDeps),
    getActiveDriftSignals(userId, { ...readerDeps, windowDays: 14 }),
    getRuleIntegrityStatus(userId, 30, readerDeps),
  ]);

  // Normalize the drift-signal return shape: with compareToPrior we get
  // { signals, priorSignalCount }; without, we get a bare array.
  const driftSignals = Array.isArray(driftSignalsResult)
    ? driftSignalsResult
    : (driftSignalsResult?.signals || []);
  const priorDriftSignalCount = Array.isArray(driftSignalsResult)
    ? undefined
    : driftSignalsResult?.priorSignalCount;

  return {
    confrontationRate,
    driftSignals,
    priorDriftSignalCount,
    ruleIntegrity,
    generatedAt: new Date().toISOString(),
  };
}

// Legacy compatibility: the Dashboard and any remaining callers previously
// imported `clarityScoreUtils` from this module. We keep the name so imports
// don't break mid-migration, but every surface it exposes returns the
// structured Signal Report — never a numeric score, never a rank.
export const clarityScoreUtils = {
  composeSignalReport,
  getConfrontationRate,
  getActiveDriftSignals,
  getRuleIntegrityStatus,
};
