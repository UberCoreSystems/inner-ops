/**
 * Finding 12 remediation: shared cross-module field-name constants.
 *
 * Synthesis, Oracle behavioral context, drift detection, and evasion
 * detection all consume the same underlying Firestore shapes. One rename
 * used to break four modules silently. Centralizing the keys here turns
 * those renames into single-point edits.
 */

// Firestore collection names (top-level and user-scoped alike — both layouts
// use the same names today).
export const COLLECTIONS = Object.freeze({
  JOURNAL_ENTRIES: 'journalEntries',
  KILL_TARGETS: 'killTargets',
  HARD_LESSONS: 'hardLessons',
  BLACK_MIRROR_ENTRIES: 'blackMirrorEntries',
  RELAPSE_ENTRIES: 'relapseEntries',
  USER_SETTINGS: 'userSettings',
  SYNTHESES: 'syntheses',
});

// Relapse-entry fields consumed cross-module.
export const RELAPSE_FIELDS = Object.freeze({
  ARCHETYPE: 'selectedSelf',            // dominant-archetype key
  PRECURSORS: 'precursorConditions',    // array of detected precursor strings
  CONTEXT_SHIFT: 'precursorContext',    // non-empty string indicates routine disruption
  REFLECTION: 'reflection',             // free-form user text
});

// Kill-target fields consumed cross-module.
export const KILL_TARGET_FIELDS = Object.freeze({
  STATUS: 'status',
  STREAK: 'streak',
  ESCAPES: 'escapeData',
  TITLE: 'title',
});

// Hard-lesson fields consumed cross-module.
export const HARD_LESSON_FIELDS = Object.freeze({
  IS_VIOLATION: 'isRuleViolation',
  IS_FINALIZED: 'isFinalized',
  RULE: 'ruleGoingForward',
  LESSON: 'extractedLesson',
});

// Journal-entry fields consumed cross-module.
export const JOURNAL_FIELDS = Object.freeze({
  MOOD: 'mood',
  MOOD_ALT: 'selectedMood', // legacy alias, still present in older docs
});

// Black Mirror entry fields.
export const BLACK_MIRROR_FIELDS = Object.freeze({
  INDEX: 'blackMirrorIndex',
});

// User-settings fields.
export const USER_SETTINGS_FIELDS = Object.freeze({
  IDENTITY_DIRECTION: 'identityDirection',
  // Rolling 14-entry window of recent daily-prompt IDs — used by the
  // selector to avoid back-to-back repeats. Appended to only when a NEW
  // daily pick is committed (once per day), never on every mount.
  RECENTLY_SHOWN_DAILY_PROMPT_IDS: 'recentlyShownDailyPromptIds',
  // Today's committed daily prompt: the pool ID, the date it was committed
  // (UTC YYYY-MM-DD), and the timestamp when the user answered it. While
  // these three fields describe the current day, DailyPrompt replays the
  // same pick across page loads instead of re-rolling.
  DAILY_PROMPT_CURRENT_ID: 'dailyPromptCurrentId',
  DAILY_PROMPT_CURRENT_DATE: 'dailyPromptCurrentDate',
  DAILY_PROMPT_ANSWERED_AT: 'dailyPromptAnsweredAt',
});

// Oracle-related fields. The Oracle Cloud Function now returns a structured
// `closingQuestion` extracted from the response prose; persist it on every
// entry that already saves Oracle feedback so the Dashboard's Today's
// Reflection rotation can read across modules without re-extracting from
// prose every page load.
export const ORACLE_FIELDS = Object.freeze({
  // Universal field added by this change. Captures the closing question
  // Claude asks at the end of every Oracle response.
  CLOSING_QUESTION: 'oracleClosingQuestion',
  // Existing per-module prose fields (unchanged — listed here so renames
  // become single-point edits per Finding 12).
  JOURNAL_PROSE: 'oracleJudgment',
  LESSON_PROSE: 'oracleWisdom',
  RELAPSE_PROSE: 'oracleFeedback',
  KILL_CLOSURE_RESPONSE: 'closureOracleResponse',
  KILL_ESCAPE_RESPONSE: 'escapeOracleResponse',
  // Synthesis briefing — already structured and queryable.
  SYNTHESIS_QUESTION: 'confrontationQuestion',
});
