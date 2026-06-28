/**
 * composeConvergenceCountdown — the forward PROJECTION on top of a fired relapse
 * forecast. computeRelapseForecast answers "which antecedents of past relapses
 * are active now?"; this answers "based on when each actually occurred and its
 * historical lead time, when does the relapse window open?"
 *
 * Pure + deterministic. No reads, no UI, no Oracle call. Every number is derived
 * solely from the forecast's own validated correlation data (lag medians measured
 * from the user's real event history) — nothing is invented.
 *
 * Honesty guards (never cry wolf, never predict destiny):
 *   - returns { status: 'inactive' } unless the forecast fired. The countdown
 *     never fires on its own — it inherits the forecast's cry-wolf gates.
 *   - projections are history-based WINDOWS, not appointments. Consuming copy
 *     must say "the window opens in ~D days" / "the window is open now", never
 *     "you will relapse on <date>".
 *   - a window whose projected open time has already passed reads as "open now"
 *     (daysUntilWindow <= 0), not as a missed/false prediction.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

function lagMs(antecedent) {
  const n = Number(antecedent?.lagMedian) || 0;
  return antecedent?.lagUnit === 'hours' ? n * MS_PER_HOUR : n * MS_PER_DAY;
}

/**
 * @param {Object} forecast  the result of computeRelapseForecast
 * @param {Object} [opts]
 * @param {number} [opts.now=Date.now()]
 * @returns {{
 *   status: 'active'|'inactive',
 *   items: Array<{ type, lagMedian, lagUnit, daysUntilWindow, windowOpen }>,
 *   soonestDays: number|null,   // min daysUntilWindow; <= 0 means already open
 *   windowOpenNow: boolean,     // any antecedent's projected window has opened
 *   activeCount: number,        // M — antecedents converging now
 *   knownCount: number|null,    // K — distinct relapse antecedents the engine knows
 * }}
 */
export function composeConvergenceCountdown(forecast, { now = Date.now() } = {}) {
  const inactive = {
    status: 'inactive',
    items: [],
    soonestDays: null,
    windowOpenNow: false,
    activeCount: 0,
    knownCount: null,
  };

  if (!forecast || !forecast.fired || !Array.isArray(forecast.activeAntecedents) || forecast.activeAntecedents.length === 0) {
    return inactive;
  }

  const items = forecast.activeAntecedents.map((a) => {
    // Projected window = when the antecedent actually last occurred + its typical
    // lead time. Falls back to `now` if the timestamp is missing (degrades to a
    // pure lead-time projection rather than throwing).
    const last = Number(a.lastOccurredAt);
    const base = Number.isFinite(last) ? last : now;
    const projectedAt = base + lagMs(a);
    const daysUntilWindow = Math.round((projectedAt - now) / MS_PER_DAY);
    return {
      type: a.type,
      lagMedian: Number(a.lagMedian) || 0,
      lagUnit: a.lagUnit === 'hours' ? 'hours' : 'days',
      daysUntilWindow,
      windowOpen: projectedAt - now <= 0,
    };
  });

  const soonestDays = Math.min(...items.map((i) => i.daysUntilWindow));
  const knownCount = Number.isFinite(forecast.knownRelapseAntecedents)
    ? forecast.knownRelapseAntecedents
    : null;

  return {
    status: 'active',
    items,
    soonestDays,
    windowOpenNow: items.some((i) => i.windowOpen),
    activeCount: items.length,
    knownCount,
  };
}

/**
 * One-line, history-framed summary of the countdown for display + for embedding
 * in the Oracle confrontation entry (the relapse_forecast posture requires any
 * numbers it cites to be present in the entry text). Returns '' when inactive.
 */
export function countdownLine(countdown) {
  if (!countdown || countdown.status !== 'active') return '';
  const ofKnown =
    countdown.knownCount && countdown.knownCount >= countdown.activeCount
      ? ` ${countdown.activeCount} of ${countdown.knownCount} known antecedents are active.`
      : '';
  if (countdown.windowOpenNow) {
    return `Based on your record, the window has already opened.${ofKnown}`;
  }
  const d = countdown.soonestDays;
  const days = `${d} ${d === 1 ? 'day' : 'days'}`;
  return `Based on your record, the window opens in ~${days}.${ofKnown}`;
}

export default composeConvergenceCountdown;
