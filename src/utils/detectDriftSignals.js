/**
 * detectDriftSignals — rules-based behavioral drift detection
 *
 * Analyzes relapse entries and kill target escapes to surface early warning signals.
 * Uses persistence-based (streak-gated) detection: a pattern must appear across
 * N consecutive calendar-day periods before a drift signal fires. A pattern
 * appearing multiple times within a single week but not on consecutive days does
 * not indicate true drift and will not trigger.
 *
 * @param {Array} relapseEntries - user's relapse log entries
 * @param {Array} killTargets - user's kill list targets (with escapeData)
 * @param {number} streakThreshold - consecutive periods required to trigger signal (default: 3)
 * @returns {Array<DriftSignal>}
 */
export function detectDriftSignals(relapseEntries = [], killTargets = [], streakThreshold = 3) {
  const signals = [];

  // Extract timestamp in ms from a relapse entry
  function getTime(entry) {
    return entry.createdAt?.toDate?.()?.getTime() ?? entry.timestamp ?? 0;
  }

  // Map a ms timestamp to a UTC calendar-day string (YYYY-MM-DD)
  function dayKey(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  // Returns the longest run of consecutive calendar days from an array of day strings
  function longestConsecutiveStreak(dayKeys) {
    if (dayKeys.length === 0) return 0;
    const sorted = [...new Set(dayKeys)].sort();
    let maxStreak = 1;
    let current = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]).getTime();
      const curr = new Date(sorted[i]).getTime();
      if (curr - prev === 24 * 60 * 60 * 1000) {
        current++;
        if (current > maxStreak) maxStreak = current;
      } else {
        current = 1;
      }
    }
    return maxStreak;
  }

  // Trigger 1 — Archetype Streak: same archetype on N+ consecutive days
  const archetypeDays = {};
  relapseEntries.forEach(e => {
    const t = getTime(e);
    if (!t || !e.selectedSelf) return;
    const day = dayKey(t);
    if (!archetypeDays[e.selectedSelf]) archetypeDays[e.selectedSelf] = [];
    archetypeDays[e.selectedSelf].push(day);
  });
  Object.entries(archetypeDays).forEach(([archetype, days]) => {
    const streak = longestConsecutiveStreak(days);
    if (streak >= streakThreshold) {
      signals.push({
        type: 'archetype_frequency',
        description: `Drift signal: ${archetype} active`,
        detail: `${streak} consecutive days`,
        severity: 'warning',
        archetype,
        streak,
      });
    }
  });

  // Trigger 2 — Precursor Streak: same precursor condition on N+ consecutive days
  const precursorDays = {};
  relapseEntries.forEach(e => {
    const t = getTime(e);
    if (!t) return;
    const day = dayKey(t);
    (e.precursorConditions || []).forEach(p => {
      if (!precursorDays[p]) precursorDays[p] = [];
      precursorDays[p].push(day);
    });
  });
  Object.entries(precursorDays).forEach(([condition, days]) => {
    const streak = longestConsecutiveStreak(days);
    if (streak >= streakThreshold) {
      signals.push({
        type: 'precursor_pattern',
        description: `Recurring condition: ${condition} present before ${streak} consecutive days of relapses`,
        severity: 'warning',
        condition,
        streak,
      });
    }
  });

  // Trigger 3 — Correlated Escape: Kill List escape + Relapse entry within 48h (unchanged)
  const windowMs48 = 48 * 60 * 60 * 1000;
  const seen48 = new Set();

  killTargets.forEach(target => {
    (target.escapeData || []).forEach(escape => {
      if (!escape.date) return;
      const escapeTime = new Date(escape.date).getTime();

      relapseEntries.forEach(entry => {
        const entryTime = getTime(entry);
        if (Math.abs(entryTime - escapeTime) < windowMs48) {
          const key = `${target.id}-${escape.date}-${entry.id}`;
          if (!seen48.has(key)) {
            seen48.add(key);
            signals.push({
              type: 'correlated_escape',
              description: `Kill List escape and relapse entry within 48h`,
              detail: `Target: ${target.title}${entry.selectedSelf ? ` · Archetype: ${entry.selectedSelf}` : ''}`,
              severity: 'signal',
              targetTitle: target.title,
              targetId: target.id,
              entryArchetype: entry.selectedSelf,
            });
          }
        }
      });
    });
  });

  // Trigger 4 — Life Transition: routine disruption state on N+ consecutive days
  // Fires when user reports a context shift (non-empty precursorContext) on consecutive
  // calendar days. Keys on routine disruption STATE, not biographical event category.
  // Any context shift reported across N consecutive days indicates sustained disruption.
  const contextShiftDays = new Set();
  relapseEntries.forEach(e => {
    const t = getTime(e);
    if (!t || !e.precursorContext) return;
    contextShiftDays.add(dayKey(t));
  });
  const contextShiftStreak = longestConsecutiveStreak([...contextShiftDays]);
  if (contextShiftStreak >= streakThreshold) {
    signals.push({
      type: 'life_transition',
      description: 'Routine disruption state detected',
      detail: `Context shift reported across ${contextShiftStreak} consecutive days`,
      severity: 'warning',
      streak: contextShiftStreak,
    });
  }

  return signals;
}
