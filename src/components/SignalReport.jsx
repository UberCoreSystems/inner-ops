import React, { useEffect, useState } from 'react';
import { composeSignalReport } from '../utils/clarityScore';
import { formatDriftSignalText } from '../utils/relapseTaxonomy';
import logger from '../utils/logger';

/**
 * SignalReport — prose-only rendering of the structured report from
 * composeSignalReport. No numeric composite, no rank, no color-coded bars,
 * no rings, no charts. Intentional replacement for the former clarity score
 * UI: measurement as truth, not reward.
 *
 * Each read line carries a trajectory delta vs. the prior 14-day window when
 * prior-window data exists. The delta is prose only — no arrows, no color,
 * no icons. Direction is carried by "up from" / "down from" / "previously".
 *
 * If `report` is passed in (e.g. from a parent that already composed), the
 * component renders it directly. Otherwise it composes itself from userId.
 */

/**
 * Format a prose trajectory-delta clause.
 *
 * Returns an empty string (caller omits the clause) when:
 *   - priorValue is null/undefined (no prior-window data)
 *   - priorValue === currentValue (no-op; "unchanged" is clutter)
 *   - metricType is 'percentage' and priorPercentage is null (prior window
 *     had no instrumented Oracle interactions)
 *
 * @param {number} currentValue
 * @param {number|null|undefined} priorValue
 * @param {'percentage'|'count'|'fraction'} metricType
 * @param {{ improvementIsDown?: boolean, priorDenominator?: number }} opts
 *   - improvementIsDown: when true (violations, drift signals), a lower
 *     current value is the "improvement" direction and we render "down from".
 *     Default false (higher current = improvement; e.g. confrontation rate).
 *   - priorDenominator: for 'fraction', the prior-window denominator. If
 *     omitted we fall back to the current denominator.
 * @returns {string} prose clause such as "up from 48%" or "" (omit)
 */
export function formatDeltaClause(currentValue, priorValue, metricType, opts = {}) {
  if (priorValue == null) return '';
  if (currentValue == null) return '';
  if (currentValue === priorValue) return '';

  const improvementIsDown = opts.improvementIsDown === true;
  const currentIsLower = currentValue < priorValue;
  // "Improvement" vs. "regression" only affects which verb we use with a
  // fraction/count. For percentages and counts the phrasing rules in the
  // spec use "up from" / "down from" on both improvement and regression —
  // the word matches the numeric direction, not a moral direction.
  const directionWord = currentIsLower ? 'down from' : 'up from';

  if (metricType === 'percentage') {
    return `${directionWord} ${priorValue}%`;
  }

  if (metricType === 'fraction') {
    const denom = opts.priorDenominator ?? opts.currentDenominator;
    if (denom == null) return '';
    return `${directionWord} ${priorValue} of ${denom} prior`;
  }

  // 'count' — use "previously N" regardless of direction. The numeric
  // comparison carries the direction.
  void improvementIsDown;
  return `previously ${priorValue}`;
}

function SignalReport({ report: reportProp, userId }) {
  const [report, setReport] = useState(reportProp || null);
  const [loading, setLoading] = useState(!reportProp);

  useEffect(() => {
    if (reportProp) {
      setReport(reportProp);
      setLoading(false);
      return;
    }
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await composeSignalReport(userId);
        if (!cancelled) setReport(r);
      } catch (err) {
        logger.warn('SignalReport: compose failed', err?.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId, reportProp]);

  if (loading) {
    return <p className="text-[#858585] text-sm">Loading signal report…</p>;
  }

  if (!report) {
    return <p className="text-[#858585] text-sm">Signal report unavailable.</p>;
  }

  const { confrontationRate, driftSignals, priorDriftSignalCount, ruleIntegrity } = report;

  // ─── Confrontation rate line ────────────────────────────────────────────────
  let confrontationLine;
  if (confrontationRate?.percentage == null) {
    confrontationLine = 'Confrontation rate: not yet instrumented.';
  } else {
    const priorPct = confrontationRate?.prior?.percentage;
    const delta = formatDeltaClause(confrontationRate.percentage, priorPct, 'percentage');
    confrontationLine = delta
      ? `Confrontation rate 14-day: ${confrontationRate.percentage}% (${delta}).`
      : `Confrontation rate 14-day: ${confrontationRate.percentage}%.`;
  }

  // ─── Rule integrity line ────────────────────────────────────────────────────
  let ruleLine;
  if (!ruleIntegrity?.finalizedRuleCount) {
    ruleLine = 'Rule integrity: no finalized rules yet.';
  } else {
    const current = ruleIntegrity.violatedInWindow;
    const prior = ruleIntegrity.priorViolatedInWindow;
    const denom = ruleIntegrity.finalizedRuleCount;
    const delta = formatDeltaClause(current, prior, 'fraction', {
      improvementIsDown: true,
      currentDenominator: denom,
      priorDenominator: denom,
    });
    // Reformat the fraction delta: "vs. N of D prior" reads more naturally
    // than "up from N of D prior" inside the target copy.
    let deltaText = '';
    if (delta) {
      const [, priorN] = delta.match(/(\d+) of \d+ prior$/) || [];
      if (priorN != null) deltaText = `vs. ${priorN} of ${denom} prior`;
    }
    ruleLine = deltaText
      ? `Rule integrity: ${current} of ${denom} rules violated this window (${deltaText}).`
      : `Rule integrity: ${current} of ${denom} rules violated this window.`;
  }

  // ─── Drift signals line ─────────────────────────────────────────────────────
  // Active signal count + trajectory. When signals are active we still list
  // their prose descriptors (kept from the prior implementation) on a second
  // inline clause so the user sees the archetype, not just a count.
  const driftCount = (driftSignals || []).length;
  const driftDelta = formatDeltaClause(driftCount, priorDriftSignalCount, 'count', {
    improvementIsDown: true,
  });
  let driftLine;
  if (driftCount === 0) {
    driftLine = driftDelta
      ? `Active drift signals: 0 (${driftDelta}).`
      : 'Active drift signals: 0.';
  } else {
    const descriptors = driftSignals.map(formatDriftSignalText).filter(Boolean).join('; ');
    const head = driftDelta
      ? `Active drift signals: ${driftCount} (${driftDelta}).`
      : `Active drift signals: ${driftCount}.`;
    driftLine = descriptors ? `${head} ${descriptors}.` : head;
  }

  return (
    <div className="space-y-2 text-sm leading-relaxed text-white">
      <p>{confrontationLine}</p>
      <p>{ruleLine}</p>
      <p>{driftLine}</p>
    </div>
  );
}

export default React.memo(SignalReport);
