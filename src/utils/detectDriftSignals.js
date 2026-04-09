/**
 * detectDriftSignals — rules-based behavioral drift detection
 *
 * Analyzes relapse entries and kill target escapes to surface early warning signals.
 * No ML, no predictions — threshold detection on the user's own data only.
 *
 * @param {Array} relapseEntries - user's relapse log entries
 * @param {Array} killTargets - user's kill list targets (with escapeData)
 * @param {number} threshold - minimum occurrences within window to trigger signal (default: 3)
 * @returns {Array<DriftSignal>}
 */
export function detectDriftSignals(relapseEntries = [], killTargets = [], threshold = 3) {
  const signals = [];
  const now = Date.now();
  const windowMs = 7 * 24 * 60 * 60 * 1000; // 7-day window

  // Entries in the last 7 days
  const recentEntries = relapseEntries.filter(e => {
    const t = e.createdAt?.toDate?.()?.getTime() ?? e.timestamp ?? 0;
    return now - t < windowMs;
  });

  // Trigger 1 — Archetype Frequency: same archetype 3+ times in 7 days
  const archetypeCounts = {};
  recentEntries.forEach(e => {
    if (e.selectedSelf) archetypeCounts[e.selectedSelf] = (archetypeCounts[e.selectedSelf] || 0) + 1;
  });
  Object.entries(archetypeCounts).forEach(([archetype, count]) => {
    if (count >= threshold) {
      signals.push({
        type: 'archetype_frequency',
        description: `Drift signal: ${archetype} active`,
        detail: `${count} entries this week`,
        severity: 'warning',
        archetype,
        count,
      });
    }
  });

  // Trigger 2 — Precursor Pattern: same precursor condition 3+ times in 7 days
  const precursorCounts = {};
  recentEntries.forEach(e => {
    (e.precursorConditions || []).forEach(p => {
      precursorCounts[p] = (precursorCounts[p] || 0) + 1;
    });
  });
  Object.entries(precursorCounts).forEach(([condition, count]) => {
    if (count >= threshold) {
      signals.push({
        type: 'precursor_pattern',
        description: `Recurring condition: ${condition} present before ${count} recent relapses`,
        severity: 'warning',
        condition,
        count,
      });
    }
  });

  // Trigger 3 — Correlated Escape: Kill List escape + Relapse entry within 48h
  const windowMs48 = 48 * 60 * 60 * 1000;
  const seen48 = new Set();

  killTargets.forEach(target => {
    (target.escapeData || []).forEach(escape => {
      if (!escape.date) return;
      const escapeTime = new Date(escape.date).getTime();

      relapseEntries.forEach(entry => {
        const entryTime = entry.createdAt?.toDate?.()?.getTime() ?? entry.timestamp ?? 0;
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

  return signals;
}
