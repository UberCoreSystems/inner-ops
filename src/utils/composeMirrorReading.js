/**
 * composeMirrorReading — pure function that builds the Dashboard MIRROR
 * section's content from current cross-module state.
 *
 * Selects tension lines, a synthesis statement, and an optional closing
 * question from a fixed line library. Conditional rendering rules:
 *   - DIRECTION renders only when identityDirection is set
 *   - PRECURSOR ALERT renders only when a drift precursor fires
 *   - SYNTHESIS / QUESTION skipped on cold-start
 *
 * Voice rules (non-negotiable):
 *   - Declarative, not exhortative. Observations, not commands.
 *   - No motivational language, no wellness framing.
 *   - Deterministic given input — no AI calls.
 */

import { RELAPSE_FIELDS, RELAPSE_ENTRY_TYPES, KILL_TARGET_FIELDS } from './schema.js';
import { resolveArchetypeLabel } from './relapseTaxonomy.js';

const DAY_MS = 86400000;
const TITLE_MAX = 40;
const HOLD_STREAK_THRESHOLD = 3;
const SIGNIFICANT_HOLD_DAYS = 21;
const VIOLATION_WINDOW_DAYS = 14;
const ARCHETYPE_WINDOW_DAYS = 14;
const ORACLE_WINDOW_DAYS = 14;
const ORACLE_MIN_FOR_LINE = 5;
const CONFRONTATION_LOW_PCT = 40;
const CONFRONTATION_HIGH_PCT = 80;

const truncateTitle = (s) => {
  const str = String(s || '').trim();
  if (str.length <= TITLE_MAX) return str;
  return str.slice(0, TITLE_MAX - 1).trimEnd() + '…';
};

const getEntryTimestamp = (entry) =>
  entry?.createdAt?.toDate?.()?.getTime() ?? entry?.timestamp ?? null;

export function composeMirrorReading(input = {}) {
  const {
    killTargets = [],
    hardLessons = [],
    relapseEntries = [],
    signalReport = null,
    behavioralContext = null,
    now = Date.now(),
  } = input;

  // --- Compute raw state ---
  const finalizedCount = (hardLessons || []).filter(
    (l) => l?.isFinalized && (l?.ruleGoingForward || '').trim().length > 0
  ).length;
  const violatedInWindow = signalReport?.ruleIntegrity?.violatedInWindow ?? 0;

  const allTargets = killTargets || [];
  const activeTargets = allTargets.filter((t) => t?.[KILL_TARGET_FIELDS.STATUS] === 'active');
  const activeCount = activeTargets.length;

  const weekAgoMs = now - 7 * DAY_MS;
  const isWithinWeek = (dateLike) => {
    if (!dateLike) return false;
    const ts = dateLike?.toDate ? dateLike.toDate().getTime() : new Date(dateLike).getTime();
    return Number.isFinite(ts) && ts > weekAgoMs;
  };

  let held = 0;
  let untouched = 0;
  activeTargets.forEach((t) => {
    const recent = (t.checkIns || []).filter((c) => isWithinWeek(c.date));
    if (recent.length === 0) untouched += 1;
    else if (recent.every((c) => c.held)) held += 1;
  });
  const escaped = allTargets.filter((t) => {
    const recentAutopsy = (t.escapeData || []).some((e) => isWithinWeek(e.date));
    if (recentAutopsy) return true;
    return (t.checkIns || []).some((c) => isWithinWeek(c.date) && c.held === false);
  }).length;

  const untouchedRate = activeCount > 0 ? untouched / activeCount : 0;
  const heldRate = activeCount > 0 ? held / activeCount : 0;

  // Relapse / archetype
  const allRelapses = relapseEntries || [];
  const fourteenDaysAgo = now - ARCHETYPE_WINDOW_DAYS * DAY_MS;
  const recent14d = allRelapses.filter((e) => {
    const ts = getEntryTimestamp(e);
    return Number.isFinite(ts) && ts > fourteenDaysAgo;
  });
  const confirmedRelapses14d = recent14d.filter(
    (e) => e?.[RELAPSE_FIELDS.ENTRY_TYPE] === RELAPSE_ENTRY_TYPES.RELAPSE
  );
  const signalCount14d = recent14d.length - confirmedRelapses14d.length;
  const archetypeCounts = {};
  recent14d.forEach((e) => {
    const a = e?.[RELAPSE_FIELDS.ARCHETYPE];
    if (a) archetypeCounts[a] = (archetypeCounts[a] || 0) + 1;
  });
  const dominantArchetypeId =
    Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const dominantArchetypeLabel = dominantArchetypeId
    ? resolveArchetypeLabel(dominantArchetypeId)
    : null;

  // Longest active hold
  let longestHold = null;
  activeTargets.forEach((t) => {
    const s = typeof t?.[KILL_TARGET_FIELDS.STREAK] === 'number' ? t[KILL_TARGET_FIELDS.STREAK] : 0;
    if (s >= HOLD_STREAK_THRESHOLD && (!longestHold || s > longestHold.streak)) {
      longestHold = { title: t?.[KILL_TARGET_FIELDS.TITLE] || 'target', streak: s };
    }
  });

  // Confrontation rate (from signalReport)
  const conf = signalReport?.confrontationRate || null;
  const oracleCount = conf ? (conf.engagedCount || 0) + (conf.dismissedCount || 0) : 0;
  const confPercentage = conf && typeof conf.percentage === 'number' ? conf.percentage : null;

  // Behavioral-context signals
  const languagePattern = (behavioralContext?.journalLanguagePattern || '').trim() || null;
  const identityDirection = (behavioralContext?.identityDirection || '').trim() || null;

  // Drift signals — partition into "alert-worthy" precursors vs the archetype
  // signal that's already represented by the dominant-archetype line.
  const driftSignals = signalReport?.driftSignals || [];
  const precursorSignals = driftSignals.filter(
    (s) =>
      s?.type === 'precursor_pattern' ||
      s?.type === 'life_transition' ||
      s?.type === 'correlated_escape'
  );

  // --- Cold start short-circuit ---
  const isColdStart = finalizedCount === 0 && activeCount === 0 && allRelapses.length === 0;
  if (isColdStart) {
    return {
      direction: identityDirection,
      observedLines: ['Nothing declared yet. The record is blank.'],
      precursorAlert: null,
      synthesis: null,
      question: null,
    };
  }

  // --- Build observed lines (by salience) ---
  const observedLines = [];

  // Rules / violations
  if (finalizedCount > 0) {
    const rulesWord = finalizedCount === 1 ? 'rule' : 'rules';
    if (violatedInWindow === 0 && activeCount > 0 && untouchedRate < 0.3) {
      observedLines.push(
        `${finalizedCount} ${rulesWord} declared. 0 violated in ${VIOLATION_WINDOW_DAYS}d. The line is held under load.`
      );
    } else if (violatedInWindow === 0 && untouchedRate >= 0.5) {
      observedLines.push(
        `${finalizedCount} ${rulesWord} declared. 0 violated in ${VIOLATION_WINDOW_DAYS}d. The line is held — or the rules are too cautious.`
      );
    } else if (violatedInWindow === 0) {
      observedLines.push(
        `${finalizedCount} ${rulesWord} declared. 0 violated in ${VIOLATION_WINDOW_DAYS}d. Held.`
      );
    } else if (violatedInWindow === 1) {
      observedLines.push(
        `${finalizedCount} ${rulesWord} declared. 1 violated in ${VIOLATION_WINDOW_DAYS}d. The line broke once.`
      );
    } else {
      observedLines.push(
        `${finalizedCount} ${rulesWord} declared. ${violatedInWindow} violated in ${VIOLATION_WINDOW_DAYS}d. Lines breaking.`
      );
    }
  }

  // Contracts / pursuit
  if (activeCount > 0) {
    const contractsWord = activeCount === 1 ? 'contract' : 'contracts';
    if (escaped >= 1) {
      const escapedWord = escaped === 1 ? 'escape' : 'escapes';
      observedLines.push(
        `${activeCount} ${contractsWord} active. ${escaped} ${escapedWord} this week. Pressure on.`
      );
    } else if (untouched >= 2 && untouchedRate >= 0.5) {
      observedLines.push(
        `${activeCount} ${contractsWord} active. ${untouched} untouched in 7d. Declared, not pursued.`
      );
    } else if (heldRate >= 0.6 && activeCount >= 2) {
      observedLines.push(
        `${activeCount} ${contractsWord} active. ${held} held this week. Under daily contact.`
      );
    } else if (untouched > 0) {
      observedLines.push(
        `${activeCount} ${contractsWord} active. ${untouched} untouched in 7d.`
      );
    }
  }

  // Longest hold (only when significant)
  if (longestHold && longestHold.streak >= SIGNIFICANT_HOLD_DAYS) {
    const t = truncateTitle(longestHold.title);
    if (violatedInWindow === 0) {
      observedLines.push(
        `Holding '${t}' for ${longestHold.streak}d. Your strongest signal. Untested.`
      );
    } else {
      observedLines.push(
        `Holding '${t}' for ${longestHold.streak}d. Your strongest signal under load.`
      );
    }
  }

  // Dominant archetype
  if (dominantArchetypeLabel) {
    if (confirmedRelapses14d.length === 0) {
      observedLines.push(
        `Recurring archetype: '${dominantArchetypeLabel}'. Pattern surfacing without confirmed relapse.`
      );
    } else {
      observedLines.push(
        `Recurring archetype: '${dominantArchetypeLabel}'. The pattern is showing.`
      );
    }
  }

  // Confrontation rate (only when meaningful sample size)
  if (oracleCount >= ORACLE_MIN_FOR_LINE && confPercentage !== null) {
    const engaged = conf.engagedCount;
    if (confPercentage < CONFRONTATION_LOW_PCT) {
      observedLines.push(
        `Oracle reflected ${oracleCount} times in ${ORACLE_WINDOW_DAYS}d. You engaged with ${engaged}. The system speaks; you read selectively.`
      );
    } else if (confPercentage >= CONFRONTATION_HIGH_PCT) {
      observedLines.push(
        `Oracle reflected ${oracleCount} times in ${ORACLE_WINDOW_DAYS}d. You engaged with ${engaged}. Reflected and engaged. The loop closes.`
      );
    }
  }

  // Language pattern
  if (languagePattern) {
    observedLines.push(
      `This week your writing returned to: ${languagePattern}. The language tracks the work.`
    );
  }

  // --- Precursor alert ---
  let precursorAlert = null;
  if (precursorSignals.length > 0) {
    const lifeTransition = precursorSignals.find((s) => s.type === 'life_transition');
    const correlated = precursorSignals.find((s) => s.type === 'correlated_escape');
    const precursor = precursorSignals.find((s) => s.type === 'precursor_pattern');

    if (lifeTransition) {
      precursorAlert = `Routine disruption ${lifeTransition.streak} days running. The conditions for relapse are present.`;
    } else if (correlated) {
      precursorAlert = `Ledger escape and relapse landed within 48h. The two systems are leaking into each other.`;
    } else if (precursor) {
      precursorAlert = `Recurring condition: ${precursor.condition} present across ${precursor.streak} consecutive days. Watch the next 48 hours.`;
    }
  }

  // --- Synthesis ---
  const hasViolations = violatedInWindow > 0;
  const hasRecentRelapse = confirmedRelapses14d.length > 0;
  const isQuiet = !hasViolations && !hasRecentRelapse && signalCount14d === 0 && precursorSignals.length === 0;
  const isAligned =
    !hasViolations && activeCount > 0 && heldRate >= 0.6 && precursorSignals.length === 0;
  const isDeclining = hasViolations || hasRecentRelapse || precursorSignals.length >= 2;

  let synthesis = null;
  if (isDeclining) {
    if (hasViolations && hasRecentRelapse) {
      synthesis = 'Pressure on. Lines breaking in two places.';
    } else if (hasViolations) {
      synthesis = 'A rule broke. The system noticed.';
    } else if (hasRecentRelapse) {
      synthesis = 'A relapse landed. The work continues.';
    } else {
      synthesis = 'Conditions are accumulating. Watch the next 48 hours.';
    }
  } else if (isAligned && longestHold && longestHold.streak >= SIGNIFICANT_HOLD_DAYS) {
    synthesis = "Held under load. The longest line you've drawn.";
  } else if (isAligned) {
    synthesis = 'The direction holds. The work is partial.';
  } else if (isQuiet) {
    if (untouched >= 2 && untouchedRate >= 0.5) {
      synthesis = 'Quiet, with work declared and untouched. Quiet is not the same as solved.';
    } else if (longestHold && longestHold.streak >= SIGNIFICANT_HOLD_DAYS) {
      synthesis = "Held but quiet. The longest line you've drawn.";
    } else {
      synthesis = 'Quiet. Either steady, or evading.';
    }
  } else {
    synthesis = 'The record stands. Read it.';
  }

  // --- Question ---
  let question = null;
  if (untouched >= 2 && untouchedRate >= 0.5) {
    question = `${activeCount} contracts named, ${untouched} untouched. What is the system avoiding?`;
  } else if (
    longestHold &&
    longestHold.streak >= SIGNIFICANT_HOLD_DAYS &&
    violatedInWindow === 0 &&
    !hasRecentRelapse
  ) {
    question = `If '${truncateTitle(longestHold.title)}' broke today, what would break with it?`;
  } else if (hasViolations) {
    question = 'The rule broke. What did the breaking cost?';
  } else if (dominantArchetypeLabel && confirmedRelapses14d.length === 0) {
    question = 'The pattern is showing without the event. What is rehearsing itself?';
  } else if (precursorSignals.length > 0) {
    question = 'The conditions are present. What changes in the next 24 hours?';
  } else if (finalizedCount > 0 && violatedInWindow === 0 && oracleCount === 0 && activeCount === 0) {
    question = `${finalizedCount} ${finalizedCount === 1 ? 'rule' : 'rules'}, none tested. Which one did you write for the easy case?`;
  }

  // Suppress question in fully-aligned, quiet states (nothing meaningful to ask)
  if (isAligned && !question) {
    question = null;
  }

  return {
    direction: identityDirection,
    observedLines,
    precursorAlert,
    synthesis,
    question,
  };
}

export default composeMirrorReading;
