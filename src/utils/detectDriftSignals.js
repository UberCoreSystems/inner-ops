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
 * @param {number} streakThreshold - consecutive periods required to trigger signal (default: DRIFT_STREAK_THRESHOLD)
 * @returns {{ signals: Array<DriftSignal>, skippedCount: number }}
 */
import logger from './logger.js';
import { RELAPSE_FIELDS, KILL_TARGET_FIELDS } from './schema.js';
import { localDateKey } from './dateUtils.js';

// Finding 22 remediation: magic threshold promoted to a named constant.
// Three consecutive calendar days of the same archetype / precursor state is
// the persistence threshold below which we treat occurrences as noise.
export const DRIFT_STREAK_THRESHOLD = 3;

export function detectDriftSignals(relapseEntries = [], killTargets = [], streakThreshold = DRIFT_STREAK_THRESHOLD) {
  const signals = [];
  // Finding 14: entries skipped due to missing required fields. Surfaced in
  // the return value so consumers can warn when the detector is blind to data.
  let skippedCount = 0;

  // Extract timestamp in ms from a relapse entry
  function getTime(entry) {
    return entry.createdAt?.toDate?.()?.getTime() ?? entry.timestamp ?? 0;
  }

  // Map a ms timestamp to a LOCAL calendar-day string (YYYY-MM-DD). Uses the
  // shared helper so consecutive-day drift detection agrees with the rest of
  // the app's "today" logic (see dateUtils.localDateKey).
  function dayKey(ms) {
    return localDateKey(ms);
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
    const archetype = e[RELAPSE_FIELDS.ARCHETYPE];
    // Finding 14: guard missing archetype and surface the skip.
    if (!archetype) {
      logger.debug?.('drift: skipped entry without selectedSelf', { id: e.id });
      skippedCount += 1;
      return;
    }
    if (!t) return;
    const day = dayKey(t);
    if (!archetypeDays[archetype]) archetypeDays[archetype] = [];
    archetypeDays[archetype].push(day);
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
    (e[RELAPSE_FIELDS.PRECURSORS] || []).forEach(p => {
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
    (target[KILL_TARGET_FIELDS.ESCAPES] || []).forEach(escape => {
      if (!escape.date) return;
      const escapeTime = new Date(escape.date).getTime();

      relapseEntries.forEach(entry => {
        const entryTime = getTime(entry);
        const entryArchetype = entry[RELAPSE_FIELDS.ARCHETYPE];
        if (Math.abs(entryTime - escapeTime) < windowMs48) {
          const key = `${target.id}-${escape.date}-${entry.id}`;
          if (!seen48.has(key)) {
            seen48.add(key);
            signals.push({
              type: 'correlated_escape',
              description: `Ledger escape and relapse entry within 48h`,
              detail: `Target: ${target[KILL_TARGET_FIELDS.TITLE]}${entryArchetype ? ` · Archetype: ${entryArchetype}` : ''}`,
              severity: 'signal',
              targetTitle: target[KILL_TARGET_FIELDS.TITLE],
              targetId: target.id,
              entryArchetype,
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
    if (!t || !e[RELAPSE_FIELDS.CONTEXT_SHIFT]) return;
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

  return { signals, skippedCount };
}
