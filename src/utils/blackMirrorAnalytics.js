/**
 * blackMirrorAnalytics.js
 * Black Mirror — Pattern Recognition & Identity Reflection Engine
 *
 * Layer 1: Data normalization (audit helpers for cross-module aggregation)
 * Layer 2: Rule-based pattern detection (no ML, deterministic)
 * Layer 3: Insight generation (data-derived only, no assumptions)
 *
 * Public API:
 *   aggregateCrossModuleData() → CrossModuleData
 *   runPatternDetection(data)  → PatternResult[]
 *   generateInsights(patterns, data) → InsightReport
 *   getAnalyticsReport()       → { data, patterns, insights }
 */

import { readUserData } from './firebaseUtils';
import logger from './logger';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  MIN_BM_ENTRIES: 3,
  MIN_JOURNAL_ENTRIES: 3,
  MIN_RELAPSE_ENTRIES: 2,
  MIN_CROSS_MODULE: 5,
  CYCLE_MIN_OCCURRENCES: 2,
  DISTRACTION_HIGH_THRESHOLD: 20,
  JOURNAL_DROPOFF_WINDOW_DAYS: 7,
};

// 24h time windows. LATE_NIGHT uses adjusted hours (0–4 → 24–28) to span midnight.
const TIME_WINDOWS = {
  EARLY_MORNING: { start: 5,  end: 8,  label: 'early morning' },
  MORNING:       { start: 8,  end: 12, label: 'morning' },
  AFTERNOON:     { start: 12, end: 17, label: 'afternoon' },
  POST_WORK:     { start: 17, end: 21, label: 'post-work evening' },
  LATE_NIGHT:    { start: 21, end: 29, label: 'late night' }, // covers 21–23 and 0–4
};

// Journal moods (from Journal.jsx)
const ENERGIZED_MOODS = new Set(['electric', 'light', 'radiant', 'triumphant']);

// ─── LAYER 1: DATA NORMALIZATION ──────────────────────────────────────────────

/**
 * Normalizes a Black Mirror entry to a consistent shape.
 * Coerces string numbers to numeric types; fills missing fields with safe defaults.
 */
const normalizeBMEntry = (entry) => ({
  id: entry.id || null,
  screenTime:       typeof entry.screenTime === 'number'       ? entry.screenTime       : parseFloat(entry.screenTime) || 0,
  blackMirrorIndex: typeof entry.blackMirrorIndex === 'number' ? entry.blackMirrorIndex : parseInt(entry.blackMirrorIndex, 10) || 0,
  mentalFog:        typeof entry.mentalFog === 'number'        ? entry.mentalFog        : parseInt(entry.mentalFog, 10) || 5,
  interactionLevel: typeof entry.interactionLevel === 'number' ? entry.interactionLevel : parseInt(entry.interactionLevel, 10) || 5,
  unconsciousCheck: Boolean(entry.unconsciousCheck),
  reflection:       typeof entry.reflection === 'string' ? entry.reflection : '',
  createdAt:        entry.createdAt || entry.timestamp?.toDate?.().toISOString() || null,
});

/**
 * Normalizes a journal entry to the fields needed for cross-module analysis.
 */
const normalizeJournalEntry = (entry) => ({
  id:        entry.id || null,
  mood:      typeof entry.mood === 'string' ? entry.mood : null,
  intensity: typeof entry.intensity === 'number' ? entry.intensity : parseInt(entry.intensity, 10) || null,
  category:  typeof entry.category === 'string' ? entry.category : null,
  wordCount: entry.wordCount
    || (typeof entry.content === 'string' ? entry.content.split(/\s+/).filter(Boolean).length : 0),
  createdAt: entry.createdAt || entry.timestamp?.toDate?.().toISOString() || null,
});

/**
 * Normalizes a relapse entry.
 */
const normalizeRelapseEntry = (entry) => ({
  id:             entry.id || null,
  selectedSelf:   typeof entry.selectedSelf === 'string' ? entry.selectedSelf : null,
  selectedHabits: Array.isArray(entry.selectedHabits) ? entry.selectedHabits : [],
  substanceUse:   Array.isArray(entry.substanceUse)   ? entry.substanceUse   : [],
  createdAt:      entry.createdAt || entry.timestamp?.toDate?.().toISOString() || null,
});

// ─── DATE UTILITIES ───────────────────────────────────────────────────────────

const parseDate = (createdAt) => {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  return isNaN(d.getTime()) ? null : d;
};

const getTimeWindow = (date) => {
  const h = date.getHours();
  // Shift midnight–4am into the LATE_NIGHT range (24–28)
  const adjustedH = h < 5 ? h + 24 : h;
  for (const [key, win] of Object.entries(TIME_WINDOWS)) {
    if (adjustedH >= win.start && adjustedH < win.end) return key;
  }
  return 'MORNING'; // fallback for any unmatched hour
};

const getDayOfWeek = (date) =>
  ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][date.getDay()];

const toDateKey = (date) => date.toISOString().split('T')[0]; // YYYY-MM-DD

// ─── LAYER 2: PATTERN DETECTION RULES ─────────────────────────────────────────

/**
 * Rule: REPEATED_DISTRACTION_CYCLE
 * Detects high-index BM entries clustering in the same time windows on multiple occasions.
 */
const detectRepeatedDistractionCycle = (bmEntries) => {
  const rule = 'REPEATED_DISTRACTION_CYCLE';

  if (bmEntries.length < THRESHOLDS.MIN_BM_ENTRIES) {
    return {
      rule, detected: false, skipped: true,
      skipReason: `Insufficient data: ${bmEntries.length} Black Mirror entries (minimum ${THRESHOLDS.MIN_BM_ENTRIES})`,
    };
  }

  const highEntries = bmEntries.filter(e => e.blackMirrorIndex >= THRESHOLDS.DISTRACTION_HIGH_THRESHOLD);

  if (highEntries.length < THRESHOLDS.CYCLE_MIN_OCCURRENCES) {
    return { rule, detected: false, skipped: false, evidence: null };
  }

  const windowCounts = {};
  const windowDays   = {};

  for (const entry of highEntries) {
    const date = parseDate(entry.createdAt);
    if (!date) continue;
    const win = getTimeWindow(date);
    const day = getDayOfWeek(date);
    windowCounts[win] = (windowCounts[win] || 0) + 1;
    if (!windowDays[win]) windowDays[win] = new Set();
    windowDays[win].add(day);
  }

  const triggeredWindows = Object.entries(windowCounts)
    .filter(([, count]) => count >= THRESHOLDS.CYCLE_MIN_OCCURRENCES)
    .map(([win, count]) => ({
      window: win,
      label: TIME_WINDOWS[win]?.label || win,
      occurrences: count,
      days: Array.from(windowDays[win] || []),
    }));

  if (triggeredWindows.length === 0) {
    return { rule, detected: false, skipped: false, evidence: null };
  }

  return { rule, detected: true, skipped: false, evidence: { windows: triggeredWindows } };
};

/**
 * Rule: TIME_BASED_BEHAVIOR_CLUSTER
 * Identifies the time window that concentrates the most logged screen time.
 */
const detectTimeBehaviorCluster = (bmEntries) => {
  const rule = 'TIME_BASED_BEHAVIOR_CLUSTER';

  if (bmEntries.length < THRESHOLDS.MIN_BM_ENTRIES) {
    return {
      rule, detected: false, skipped: true,
      skipReason: `Insufficient data: ${bmEntries.length} Black Mirror entries (minimum ${THRESHOLDS.MIN_BM_ENTRIES})`,
    };
  }

  const windowScreenTime = {};
  const windowCounts     = {};

  for (const entry of bmEntries) {
    const date = parseDate(entry.createdAt);
    if (!date) continue;
    const win = getTimeWindow(date);
    windowScreenTime[win] = (windowScreenTime[win] || 0) + entry.screenTime;
    windowCounts[win]     = (windowCounts[win]     || 0) + 1;
  }

  const windows = Object.entries(windowScreenTime)
    .map(([win, totalHours]) => ({
      window:     win,
      label:      TIME_WINDOWS[win]?.label || win,
      totalHours: Math.round(totalHours * 10) / 10,
      count:      windowCounts[win] || 0,
    }))
    .sort((a, b) => b.totalHours - a.totalHours);

  if (windows.length === 0 || windows[0].count < 2) {
    return { rule, detected: false, skipped: false, evidence: null };
  }

  return {
    rule, detected: true, skipped: false,
    evidence: { dominantWindow: windows[0], allWindows: windows },
  };
};

/**
 * Rule: JOURNAL_DROPOFF_DISTRACTION_SPIKE
 * Detects if distraction spikes (high BM index) occur after journaling gaps.
 */
const detectJournalDropoffDistractionSpike = (bmEntries, journalEntries) => {
  const rule = 'JOURNAL_DROPOFF_DISTRACTION_SPIKE';

  if (bmEntries.length < THRESHOLDS.MIN_BM_ENTRIES) {
    return {
      rule, detected: false, skipped: true,
      skipReason: `Insufficient Black Mirror data: ${bmEntries.length} entries (minimum ${THRESHOLDS.MIN_BM_ENTRIES})`,
    };
  }
  if (journalEntries.length < THRESHOLDS.MIN_JOURNAL_ENTRIES) {
    return {
      rule, detected: false, skipped: true,
      skipReason: `Insufficient journal data: ${journalEntries.length} entries (minimum ${THRESHOLDS.MIN_JOURNAL_ENTRIES})`,
    };
  }

  const journalDateSet = new Set(
    journalEntries.map(e => parseDate(e.createdAt)).filter(Boolean).map(toDateKey)
  );

  const spikesDuringDropoff = [];

  for (const bm of bmEntries) {
    if (bm.blackMirrorIndex < THRESHOLDS.DISTRACTION_HIGH_THRESHOLD) continue;
    const bmDate = parseDate(bm.createdAt);
    if (!bmDate) continue;

    // Count journal days in the 7-day window before this BM entry
    let journalDaysInWindow = 0;
    for (let i = 1; i <= THRESHOLDS.JOURNAL_DROPOFF_WINDOW_DAYS; i++) {
      const check = new Date(bmDate);
      check.setDate(check.getDate() - i);
      if (journalDateSet.has(toDateKey(check))) journalDaysInWindow++;
    }

    if (journalDaysInWindow === 0) {
      spikesDuringDropoff.push({
        bmIndex: bm.blackMirrorIndex,
        date: toDateKey(bmDate),
        journalGapDays: THRESHOLDS.JOURNAL_DROPOFF_WINDOW_DAYS,
      });
    }
  }

  if (spikesDuringDropoff.length < THRESHOLDS.CYCLE_MIN_OCCURRENCES) {
    return { rule, detected: false, skipped: false, evidence: null };
  }

  return {
    rule, detected: true, skipped: false,
    evidence: {
      occurrences: spikesDuringDropoff.length,
      examples: spikesDuringDropoff.slice(0, 3),
    },
  };
};

/**
 * Rule: AVOIDANCE_PATTERN_TRIGGER_LINK
 * Detects if elevated screen time follows relapse events within a 3-day window.
 */
const detectAvoidancePatternTriggerLink = (bmEntries, relapseEntries) => {
  const rule = 'AVOIDANCE_PATTERN_TRIGGER_LINK';

  if (bmEntries.length < THRESHOLDS.MIN_BM_ENTRIES) {
    return {
      rule, detected: false, skipped: true,
      skipReason: `Insufficient Black Mirror data: ${bmEntries.length} entries (minimum ${THRESHOLDS.MIN_BM_ENTRIES})`,
    };
  }
  if (relapseEntries.length < THRESHOLDS.MIN_RELAPSE_ENTRIES) {
    return {
      rule, detected: false, skipped: true,
      skipReason: `Insufficient relapse data: ${relapseEntries.length} entries (minimum ${THRESHOLDS.MIN_RELAPSE_ENTRIES})`,
    };
  }

  const linkedEvents = [];

  for (const relapse of relapseEntries) {
    const relapseDate = parseDate(relapse.createdAt);
    if (!relapseDate) continue;

    const elevatedBM = bmEntries.filter(bm => {
      const bmDate = parseDate(bm.createdAt);
      if (!bmDate) return false;
      const diffDays = (bmDate - relapseDate) / (1000 * 60 * 60 * 24);
      return diffDays >= 0 && diffDays <= 3
        && bm.blackMirrorIndex >= THRESHOLDS.DISTRACTION_HIGH_THRESHOLD;
    });

    if (elevatedBM.length > 0) {
      const daysAfter = Math.min(...elevatedBM.map(bm => {
        const bmDate = parseDate(bm.createdAt);
        return Math.round((bmDate - relapseDate) / (1000 * 60 * 60 * 24));
      }));
      linkedEvents.push({
        relapseDate:      toDateKey(relapseDate),
        relapseArchetype: relapse.selectedSelf,
        followingBMIndex: Math.max(...elevatedBM.map(e => e.blackMirrorIndex)),
        daysAfter,
      });
    }
  }

  if (linkedEvents.length < THRESHOLDS.CYCLE_MIN_OCCURRENCES) {
    return { rule, detected: false, skipped: false, evidence: null };
  }

  return {
    rule, detected: true, skipped: false,
    evidence: {
      occurrences: linkedEvents.length,
      examples: linkedEvents.slice(0, 3),
    },
  };
};

// ─── LAYER 2: MAIN RUNNER ─────────────────────────────────────────────────────

/**
 * Runs all four pattern detection rules against aggregated cross-module data.
 * Each rule result includes: rule, detected, skipped, skipReason?, evidence?
 *
 * @param {CrossModuleData} data
 * @returns {PatternResult[]}
 */
export const runPatternDetection = (data) => {
  const { blackMirror = [], journal = [], relapse = [] } = data;
  return [
    detectRepeatedDistractionCycle(blackMirror),
    detectTimeBehaviorCluster(blackMirror),
    detectJournalDropoffDistractionSpike(blackMirror, journal),
    detectAvoidancePatternTriggerLink(blackMirror, relapse),
  ];
};

// ─── LAYER 3: INSIGHT GENERATORS ──────────────────────────────────────────────

const buildBehavioralPatterns = (patterns) => {
  const insights = [];

  const cycle = patterns.find(p => p.rule === 'REPEATED_DISTRACTION_CYCLE');
  if (cycle?.detected) {
    for (const w of cycle.evidence.windows) {
      insights.push(
        `User shows repeated high-distraction activity during ${w.label} hours` +
        ` (${w.occurrences} occurrences across ${w.days.length} day type(s): ${w.days.join(', ')}).`
      );
    }
  }

  const cluster = patterns.find(p => p.rule === 'TIME_BASED_BEHAVIOR_CLUSTER');
  if (cluster?.detected) {
    const d = cluster.evidence.dominantWindow;
    insights.push(
      `Screen time concentrates in the ${d.label} window` +
      ` (${d.totalHours}h total across ${d.count} logged entries).`
    );
  }

  return insights;
};

const buildAvoidancePatterns = (patterns, data) => {
  const insights = [];

  const dropoff = patterns.find(p => p.rule === 'JOURNAL_DROPOFF_DISTRACTION_SPIKE');
  if (dropoff?.detected) {
    insights.push(
      `Distraction spikes (Black Mirror Index ≥ ${THRESHOLDS.DISTRACTION_HIGH_THRESHOLD}) occurred on` +
      ` ${dropoff.evidence.occurrences} occasion(s) following a ${THRESHOLDS.JOURNAL_DROPOFF_WINDOW_DAYS}-day journaling gap.`
    );
  }

  const avoidance = patterns.find(p => p.rule === 'AVOIDANCE_PATTERN_TRIGGER_LINK');
  if (avoidance?.detected) {
    insights.push(
      `Elevated screen time followed ${avoidance.evidence.occurrences} relapse event(s) within a 3-day window.`
    );
  }

  // Low interaction + high BM — derived directly from raw data, no separate rule
  const lowInteractionHighBM = data.blackMirror.filter(
    e => e.interactionLevel <= 3 && e.blackMirrorIndex >= THRESHOLDS.DISTRACTION_HIGH_THRESHOLD
  );
  if (lowInteractionHighBM.length >= THRESHOLDS.CYCLE_MIN_OCCURRENCES) {
    insights.push(
      `High distraction index co-occurs with low real-world interaction on ${lowInteractionHighBM.length} logged day(s).`
    );
  }

  return insights;
};

const buildIdentityBehaviorGaps = (patterns, data) => {
  const insights = [];
  const { blackMirror, journal, relapse } = data;

  const totalEntries = blackMirror.length + journal.length + relapse.length;
  if (totalEntries < THRESHOLDS.MIN_CROSS_MODULE) return insights;

  // Gap 1: Energized mood journal entry on same day or prior day as distraction spike
  const journalByDate = {};
  for (const j of journal) {
    const d = parseDate(j.createdAt);
    if (d) journalByDate[toDateKey(d)] = j;
  }

  let energizedBeforeSpike = 0;
  for (const bm of blackMirror) {
    if (bm.blackMirrorIndex < THRESHOLDS.DISTRACTION_HIGH_THRESHOLD) continue;
    const bmDate = parseDate(bm.createdAt);
    if (!bmDate) continue;
    for (let i = 0; i <= 1; i++) {
      const check = new Date(bmDate);
      check.setDate(check.getDate() - i);
      const j = journalByDate[toDateKey(check)];
      if (j?.mood && ENERGIZED_MOODS.has(j.mood)) {
        energizedBeforeSpike++;
        break;
      }
    }
  }

  if (energizedBeforeSpike >= THRESHOLDS.CYCLE_MIN_OCCURRENCES) {
    insights.push(
      `On ${energizedBeforeSpike} occasion(s), high distraction was logged on the same day or after` +
      ` a journal entry recording an energized mood state.`
    );
  }

  // Gap 2: Repeated relapse archetype (≥ 3 times) with no recorded decrease
  if (relapse.length >= 3) {
    const archetypeCounts = {};
    for (const r of relapse) {
      if (r.selectedSelf) {
        archetypeCounts[r.selectedSelf] = (archetypeCounts[r.selectedSelf] || 0) + 1;
      }
    }
    for (const [archetype, count] of Object.entries(archetypeCounts)) {
      if (count >= 3) {
        insights.push(
          `"${archetype}" archetype has been logged ${count} times across relapse entries without a recorded decrease.`
        );
      }
    }
  }

  return insights;
};

// ─── LAYER 3: MAIN RUNNER ─────────────────────────────────────────────────────

/**
 * Generates structured insights from pattern results and raw data.
 * Outputs exactly three categories. Each category falls back to
 * "Insufficient data to generate insight" if no insights can be derived.
 *
 * Rules:
 *  - Outputs derived only from actual stored data
 *  - No assumptions, no motivational language
 *  - Short, direct, explainable
 *
 * @param {PatternResult[]} patterns
 * @param {CrossModuleData} data
 * @returns {InsightReport}
 */
export const generateInsights = (patterns, data) => {
  const behavioral = buildBehavioralPatterns(patterns);
  const avoidance  = buildAvoidancePatterns(patterns, data);
  const gaps       = buildIdentityBehaviorGaps(patterns, data);

  return {
    behavioral_patterns:       behavioral.length > 0 ? behavioral : ['Insufficient data to generate insight'],
    avoidance_patterns:        avoidance.length  > 0 ? avoidance  : ['Insufficient data to generate insight'],
    identity_vs_behavior_gaps: gaps.length       > 0 ? gaps       : ['Insufficient data to generate insight'],
    patterns_detected: patterns.filter(p => p.detected).length,
    patterns_skipped:  patterns.filter(p => p.skipped).length,
    generated_at: new Date().toISOString(),
  };
};

// ─── CROSS-MODULE DATA AGGREGATION ────────────────────────────────────────────

/**
 * Fetches and normalizes data from all three source modules in parallel.
 * Never throws — failed fetches produce empty arrays and are logged as warnings.
 *
 * @returns {Promise<CrossModuleData>}
 */
export const aggregateCrossModuleData = async () => {
  const [bmResult, journalResult, relapseResult] = await Promise.allSettled([
    readUserData('blackMirrorEntries'),
    readUserData('journalEntries'),
    readUserData('relapseEntries'),
  ]);

  if (bmResult.status      === 'rejected') logger.warn('blackMirrorAnalytics: blackMirrorEntries fetch failed', bmResult.reason);
  if (journalResult.status === 'rejected') logger.warn('blackMirrorAnalytics: journalEntries fetch failed', journalResult.reason);
  if (relapseResult.status === 'rejected') logger.warn('blackMirrorAnalytics: relapseEntries fetch failed', relapseResult.reason);

  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const withinLookback = (entry) => {
    const d = entry.createdAt ? new Date(entry.createdAt) : null;
    return d && d >= cutoff;
  };

  const blackMirror = (bmResult.status      === 'fulfilled' ? bmResult.value      || [] : []).map(normalizeBMEntry).filter(withinLookback);
  const journal     = (journalResult.status === 'fulfilled' ? journalResult.value || [] : []).map(normalizeJournalEntry).filter(withinLookback);
  const relapse     = (relapseResult.status === 'fulfilled' ? relapseResult.value || [] : []).map(normalizeRelapseEntry).filter(withinLookback);

  return {
    blackMirror,
    journal,
    relapse,
    meta: {
      fetchedAt: new Date().toISOString(),
      counts: { blackMirror: blackMirror.length, journal: journal.length, relapse: relapse.length },
    },
  };
};

// ─── TOP-LEVEL API ─────────────────────────────────────────────────────────────

/**
 * Main entry point. Fetches cross-module data, runs all pattern detection rules,
 * and generates the identity reflection report.
 *
 * Returns:
 * {
 *   data:     CrossModuleData    — normalized raw data from all three modules
 *   patterns: PatternResult[]   — one result per rule (detected | skipped | not detected)
 *   insights: InsightReport     — behavioral, avoidance, and identity gap insights
 * }
 *
 * @returns {Promise<AnalyticsReport>}
 */
export const getAnalyticsReport = async () => {
  const data     = await aggregateCrossModuleData();
  const patterns = runPatternDetection(data);
  const insights = generateInsights(patterns, data);
  return { data, patterns, insights };
};
