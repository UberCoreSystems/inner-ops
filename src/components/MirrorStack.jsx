import React from 'react';
import { RELAPSE_FIELDS, RELAPSE_ENTRY_TYPES, KILL_TARGET_FIELDS } from '../utils/schema.js';
import { resolveArchetypeLabel } from '../utils/relapseTaxonomy.js';

const DAY_MS = 86400000;
const TITLE_MAX = 40; // keeps the "holding X for Yd" line readable when titles run long

const getEntryTimestamp = (entry) =>
  entry?.createdAt?.toDate?.()?.getTime() ?? entry?.timestamp ?? null;

const truncateTitle = (s) => {
  const str = String(s || '').trim();
  if (str.length <= TITLE_MAX) return str;
  return str.slice(0, TITLE_MAX - 1).trimEnd() + '…';
};

function MirrorStack({ killTargets = [], hardLessons = [], relapseEntries = [], signalReport }) {
  const finalizedCount = (hardLessons || []).filter(
    l => l?.isFinalized && (l?.ruleGoingForward || '').trim().length > 0
  ).length;
  const violatedInWindow = signalReport?.ruleIntegrity?.violatedInWindow ?? 0;
  const priorViolated = signalReport?.ruleIntegrity?.priorViolatedInWindow;

  const allTargets = killTargets || [];
  const activeTargets = allTargets.filter(t => t?.[KILL_TARGET_FIELDS.STATUS] === 'active');
  const activeCount = activeTargets.length;

  const weekAgoMs = Date.now() - 7 * DAY_MS;
  const isWithinWeek = (dateLike) => {
    if (!dateLike) return false;
    const ts = dateLike?.toDate ? dateLike.toDate().getTime() : new Date(dateLike).getTime();
    return Number.isFinite(ts) && ts > weekAgoMs;
  };

  // Held / untouched are state-of-the-contract metrics — only meaningful for
  // active targets. A target the user is still trying to hold is either being
  // checked in (held) or being neglected (untouched).
  let held = 0;
  let untouched = 0;
  activeTargets.forEach(t => {
    const recent = (t.checkIns || []).filter(c => isWithinWeek(c.date));
    if (recent.length === 0) untouched += 1;
    else if (recent.every(c => c.held)) held += 1;
    // active targets with a recent held=false check-in are counted under
    // `escaped` below (the autopsy may or may not be submitted yet).
  });

  // Escaped count: any target (active OR escaped status) with a recent escape
  // signal in the past 7 days. Reads from escapeData[].date — the canonical
  // record set when the autopsy is submitted — and falls back to a
  // checkIns[].held === false entry on still-active targets to capture the
  // window between "It got me" being clicked and the autopsy form being
  // submitted. Counts unique targets (a target with both signals counts once).
  const escaped = allTargets.filter(t => {
    const recentAutopsy = (t.escapeData || []).some(e => isWithinWeek(e.date));
    if (recentAutopsy) return true;
    return (t.checkIns || []).some(c => isWithinWeek(c.date) && c.held === false);
  }).length;

  const driftCount = (signalReport?.driftSignals || []).length;
  const priorDrift = signalReport?.priorDriftSignalCount;

  // Trajectory weighting: rule-violation deltas count 2x drift-signal deltas.
  // A finalized rule the user wrote and then broke is a heavier signal than
  // a single drift detection — drift is a forward-looking warning; violation
  // is a confirmed breach of stated commitment.
  const VIOLATION_WEIGHT = 2;
  const DRIFT_WEIGHT = 1;
  let trajectoryText = 'not yet measured';
  const hasDriftPrior = typeof priorDrift === 'number';
  const hasViolationPrior = typeof priorViolated === 'number';
  if (hasDriftPrior || hasViolationPrior) {
    const driftDelta = hasDriftPrior ? driftCount - priorDrift : 0;
    const violationDelta = hasViolationPrior ? violatedInWindow - priorViolated : 0;
    const combined = driftDelta * DRIFT_WEIGHT + violationDelta * VIOLATION_WEIGHT;
    if (combined > 0) trajectoryText = 'deteriorating';
    else if (combined < 0) trajectoryText = 'improving';
    else trajectoryText = 'stable';
  }

  // --- Direction row inputs ---
  // Mirror uses the strict definition of "relapse": only entries explicitly
  // marked entryType === 'relapse'. Legacy entries (no entryType) are treated
  // as signals per schema.js. This keeps "days since last confirmed relapse"
  // a meaningful clean-streak number and surfaces signals as a separate count
  // so the user doesn't see "no events" when they just logged a signal.
  const allRelapses = relapseEntries || [];
  const confirmedRelapses = allRelapses.filter(
    e => e?.[RELAPSE_FIELDS.ENTRY_TYPE] === RELAPSE_ENTRY_TYPES.RELAPSE
  );
  let daysSinceLastConfirmedRelapse = null;
  if (confirmedRelapses.length > 0) {
    const latestTs = confirmedRelapses
      .map(getEntryTimestamp)
      .filter(t => Number.isFinite(t))
      .reduce((max, t) => (t > max ? t : max), 0);
    if (latestTs > 0) {
      daysSinceLastConfirmedRelapse = Math.max(0, Math.floor((Date.now() - latestTs) / DAY_MS));
    }
  }

  // Dominant archetype across last-14d entries — matches getBehavioralContext
  // convention: counts all relapse entries (signals + confirmed), not just
  // confirmed events. The "selectedSelf" field stores the ID; we resolve it
  // to the behavioral-descriptor label per UXR-002 Spec 4.
  const fourteenDaysAgo = Date.now() - 14 * DAY_MS;
  const recent14d = allRelapses.filter(e => {
    const ts = getEntryTimestamp(e);
    return Number.isFinite(ts) && ts > fourteenDaysAgo;
  });
  const signalCount14d = recent14d.filter(
    e => e?.[RELAPSE_FIELDS.ENTRY_TYPE] !== RELAPSE_ENTRY_TYPES.RELAPSE
  ).length;
  const archetypeCounts = {};
  recent14d.forEach(e => {
    const a = e?.[RELAPSE_FIELDS.ARCHETYPE];
    if (a) archetypeCounts[a] = (archetypeCounts[a] || 0) + 1;
  });
  const dominantArchetypeId =
    Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const dominantArchetypeLabel = dominantArchetypeId
    ? resolveArchetypeLabel(dominantArchetypeId)
    : null;

  // Longest active hold across kill targets. Uses target.streak (the canonical
  // consecutive-day counter maintained by KillList check-ins). Threshold of 3
  // keeps noise out — a 1- or 2-day streak isn't yet a self-command marker.
  let longestHold = null;
  activeTargets.forEach(t => {
    const s = typeof t?.[KILL_TARGET_FIELDS.STREAK] === 'number' ? t[KILL_TARGET_FIELDS.STREAK] : 0;
    if (s >= 3 && (!longestHold || s > longestHold.streak)) {
      longestHold = { title: t?.[KILL_TARGET_FIELDS.TITLE] || 'target', streak: s };
    }
  });

  const hasRelapseData = allRelapses.length > 0;
  const hasHoldStreak = longestHold !== null;
  const showDirection = hasRelapseData || hasHoldStreak;

  if (finalizedCount === 0 && activeCount === 0) return null;

  return (
    <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.06s' }}>
      <div className="oura-card p-6">
        <h3 className="text-[#858585] text-xs uppercase tracking-widest mb-5">Mirror</h3>
        <div className="grid grid-cols-2 gap-6 divide-x divide-[#00d4aa]/20">
          <div className="pr-6">
            <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-3">Declared</p>
            <div className="space-y-3">
              <p className="text-white text-sm">
                <span className="font-light text-2xl tabular-nums text-[#00d4aa]/90">{finalizedCount}</span>
                <span className="text-[#858585] ml-2">finalized rule{finalizedCount !== 1 ? 's' : ''}</span>
              </p>
              <p className="text-white text-sm">
                <span className="font-light text-2xl tabular-nums text-[#00d4aa]/90">{activeCount}</span>
                <span className="text-[#858585] ml-2">active kill contract{activeCount !== 1 ? 's' : ''}</span>
              </p>
            </div>
          </div>
          <div className="pl-6">
            <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-3">Observed</p>
            <div className="space-y-3">
              <p className="text-white text-sm">
                {finalizedCount > 0 ? (
                  <>
                    <span className={`font-light text-2xl tabular-nums ${violatedInWindow > 0 ? 'text-[#b45309]' : 'text-[#ababab]'}`}>{violatedInWindow}</span>
                    <span className="text-[#858585] ml-2">violated in 14d</span>
                  </>
                ) : (
                  <span className="text-[#858585]">no rules to measure</span>
                )}
              </p>
              <p className="text-white text-sm">
                {activeCount > 0 ? (
                  <span className="text-[#ababab]">
                    {held} held · {escaped} escaped · {untouched} untouched in 7d
                  </span>
                ) : (
                  <span className="text-[#858585]">no contracts to measure</span>
                )}
              </p>
            </div>
          </div>
        </div>
        {showDirection && (
          <div className="mt-5 pt-4 border-t border-[#1a1a1a]">
            <p className="text-[#858585] text-[10px] uppercase tracking-widest mb-3">Direction</p>
            <div className="space-y-2">
              {hasRelapseData && (
                <>
                  <p className="text-white text-sm">
                    {dominantArchetypeLabel ? (
                      <>
                        <span className="text-[#a855f7]">{dominantArchetypeLabel}</span>
                        <span className="text-[#858585]"> dominant in 14d</span>
                      </>
                    ) : (
                      <span className="text-[#858585]">no dominant pattern in 14d</span>
                    )}
                  </p>
                  <p className="text-white text-sm">
                    {daysSinceLastConfirmedRelapse !== null ? (
                      <>
                        <span className="font-light tabular-nums text-[#00d4aa]/90">{daysSinceLastConfirmedRelapse}</span>
                        <span className="text-[#858585]">d since last confirmed relapse</span>
                      </>
                    ) : (
                      <span className="text-[#858585]">no confirmed relapses</span>
                    )}
                    <span className="text-[#858585]"> · </span>
                    {signalCount14d > 0 ? (
                      <>
                        <span className="font-light tabular-nums text-[#00d4aa]/90">{signalCount14d}</span>
                        <span className="text-[#858585]"> signal{signalCount14d !== 1 ? 's' : ''} in 14d</span>
                      </>
                    ) : (
                      <span className="text-[#858585]">no signals in 14d</span>
                    )}
                  </p>
                </>
              )}
              {hasHoldStreak && (
                <p className="text-white text-sm">
                  <span className="text-[#858585]">holding </span>
                  <span className="text-[#ababab]" title={longestHold.title}>{truncateTitle(longestHold.title)}</span>
                  <span className="text-[#858585]"> for </span>
                  <span className="font-light tabular-nums text-[#00d4aa]/90">{longestHold.streak}</span>
                  <span className="text-[#858585]">d</span>
                </p>
              )}
            </div>
          </div>
        )}
        <p className="text-[#858585] text-xs mt-5 pt-4 border-t border-[#1a1a1a]">
          Trajectory: <span className={
            trajectoryText === 'improving' ? 'text-[#00d4aa]' :
            trajectoryText === 'deteriorating' ? 'text-[#b45309]' :
            'text-[#ababab]'
          }>{trajectoryText}</span>.
        </p>
      </div>
    </section>
  );
}

export default React.memo(MirrorStack);
