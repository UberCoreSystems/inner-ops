/**
 * relapseForecast — forward-looking pre-failure signal for Relapse Radar.
 *
 * Builds on crossModuleCorrelation: of the learned associations whose CONSEQUENT
 * is a relapse, which ANTECEDENTS are active in the current window? When enough
 * converge, the radar can confront the user BEFORE the relapse, not after.
 *
 * Pure + deterministic. No reads, no UI, no Oracle call — the caller decides
 * whether to surface the result and fire the (rate-limited) confrontation.
 *
 * Guards (never cry wolf):
 *   - insufficient-signal (engine trust gate) → nothing fires.
 *   - support>=minSupport and lift>1 already enforced by the engine.
 *   - an already-occurred relapse inside the lead window suppresses the forecast
 *     (the prediction would be post-hoc).
 *   - an 'improving' synthesis signalDelta downgrades the weaker multi-signal
 *     path, requiring a single strong antecedent to fire.
 */

import { extractEvents, computeCorrelations, DEFAULT_WINDOW_DAYS } from './crossModuleCorrelation.js';

export const FORECAST_MIN_ACTIVE_ANTECEDENTS = 2;
export const FORECAST_SINGLE_STRONG_CONFIDENCE = 0.7;

const RELAPSE_CONSEQUENT = 'relapse:relapse';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

// Lead window for an antecedent, in ms: its typical lead time (median lag) plus
// a one-day buffer, clamped to [1 day, engine window W]. The antecedent is
// "active" if its most recent occurrence falls inside [now - lead, now].
function leadWindowMs(correlation, windowDays) {
  const unit = correlation.lagDistribution?.unit;
  const median = Number(correlation.lagDistribution?.median) || 0;
  const medianMs = unit === 'hours' ? median * MS_PER_HOUR : median * MS_PER_DAY;
  const buffered = medianMs + MS_PER_DAY;
  const cap = windowDays * MS_PER_DAY;
  return Math.min(Math.max(buffered, MS_PER_DAY), cap);
}

/**
 * @param {Object} input
 * @param {Array}  input.killTargets
 * @param {Array}  input.relapseEntries
 * @param {Array}  input.hardLessons
 * @param {Array}  input.journalEntries
 * @param {number} [input.now=Date.now()]
 * @param {string|null} [input.signalDelta]  reused from the latest synthesis briefing
 * @param {number} [input.windowDays]
 * @returns {{ status, fired, activeAntecedents, convergenceScore, signalKey, suppressedBy? }}
 */
export function computeRelapseForecast({
  killTargets = [],
  relapseEntries = [],
  hardLessons = [],
  journalEntries = [],
  now = Date.now(),
  signalDelta = null,
  windowDays = DEFAULT_WINDOW_DAYS,
} = {}) {
  const entryCount =
    killTargets.length + relapseEntries.length + hardLessons.length + journalEntries.length;

  const events = extractEvents({ killTargets, relapseEntries, hardLessons, journalEntries });
  const { correlations, status } = computeCorrelations(events, { entryCount, windowDays });

  if (status !== 'ok') {
    return { status, fired: false, activeAntecedents: [], convergenceScore: 0, signalKey: null };
  }

  // Most-recent event per type (events are time-sorted ascending).
  const lastByType = new Map();
  for (const e of events) lastByType.set(e.type, e);

  // Of relapse antecedents, which are active in their lead window right now?
  const active = [];
  for (const c of correlations) {
    if (c.consequent !== RELAPSE_CONSEQUENT) continue;
    const last = lastByType.get(c.antecedent);
    if (!last) continue;
    const lead = leadWindowMs(c, windowDays);
    const age = now - last.tMs;
    if (age >= 0 && age <= lead) {
      active.push({
        type: c.antecedent,
        confidence: c.confidence,
        support: c.support,
        resolution: c.resolution,
        lagMedian: Number(c.lagDistribution?.median) || 0,
        lagUnit: c.lagDistribution?.unit || 'days',
        lastOccurredAt: last.tMs,
        leadWindowMs: lead,
        triggeringDayIndex: last.dayIndex,
      });
    }
  }

  if (active.length === 0) {
    return { status: 'ok', fired: false, activeAntecedents: [], convergenceScore: 0, signalKey: null };
  }

  // False-positive guard: a relapse already happened inside the lead window —
  // the forecast would be post-hoc, so suppress it.
  const maxLead = Math.max(...active.map((a) => a.leadWindowMs));
  const lastRelapse = lastByType.get(RELAPSE_CONSEQUENT);
  if (lastRelapse && now - lastRelapse.tMs >= 0 && now - lastRelapse.tMs <= maxLead) {
    return {
      status: 'ok',
      fired: false,
      activeAntecedents: active,
      convergenceScore: 0,
      signalKey: null,
      suppressedBy: 'recent-relapse',
    };
  }

  const convergenceScore = active.reduce((s, a) => s + a.confidence, 0);
  const strongest = Math.max(...active.map((a) => a.confidence));
  const hasStrongSingle = strongest >= FORECAST_SINGLE_STRONG_CONFIDENCE;
  const hasMultiple = active.length >= FORECAST_MIN_ACTIVE_ANTECEDENTS;

  // During an improving trend, only a single strong antecedent fires — converging
  // weak signals against an improving delta are treated as lower confidence.
  const fired = signalDelta === 'improving' ? hasStrongSingle : hasMultiple || hasStrongSingle;

  if (!fired) {
    return { status: 'ok', fired: false, activeAntecedents: active, convergenceScore, signalKey: null };
  }

  // Episode-specific dedupe key: the active antecedent set + each one's
  // triggering day. Same convergence on the same render → same key (deduped);
  // a new antecedent, or the same one re-firing on a later day → new key.
  const signalKey =
    'forecast_' +
    active.map((a) => `${a.type}:${a.triggeringDayIndex}`).sort().join('|');

  return { status: 'ok', fired: true, activeAntecedents: active, convergenceScore, signalKey };
}
