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
  CONFRONTATIONS: 'confrontations',
});

// Relapse-entry fields consumed cross-module.
export const RELAPSE_FIELDS = Object.freeze({
  ARCHETYPE: 'selectedSelf',            // dominant-archetype key
  PRECURSORS: 'precursorConditions',    // array of detected precursor strings
  CONTEXT_SHIFT: 'precursorContext',    // non-empty string indicates routine disruption
  REFLECTION: 'reflection',             // free-form user text
  ENTRY_TYPE: 'entryType',              // 'signal' (precursor) | 'relapse' (actual relapse event)
});

// Allowed values for RELAPSE_FIELDS.ENTRY_TYPE. Entries written before this
// field existed are interpreted as RELAPSE_ENTRY_TYPES.SIGNAL by readers.
export const RELAPSE_ENTRY_TYPES = Object.freeze({
  SIGNAL: 'signal',
  RELAPSE: 'relapse',
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
  // Per-rule violation log. Each entry: { date: ISO, note?: string, source: 'direct' | 'weekly_review' }.
  // Written by the in-the-moment "Rule broken" button on the Hard Lessons
  // page and by the weekly rule review on the Dashboard. Read by the Mirror
  // tile / Pattern Confrontation card via getRuleIntegrityStatus.
  VIOLATIONS: 'violations',
  LAST_VIOLATED_AT: 'lastViolatedAt',
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

// Pattern-confrontation fields. Each doc in COLLECTIONS.CONFRONTATIONS
// represents one Confront tap on the Dashboard's PatternConfrontationCard.
// Powers the inline archive, the 24h dedupe, and the Confrontation Rate
// metric in clarityScore.
export const CONFRONTATION_FIELDS = Object.freeze({
  CREATED_AT: 'createdAt',          // ISO string at write time
  SIGNAL_KEY: 'signalKey',           // matches PatternConfrontationCard.signalKey for dedupe
  SIGNAL_TYPE: 'signalType',         // 'drift' | 'rule_violation'
  SIGNAL_SNAPSHOT: 'signalSnapshot', // captured signal payload at time of confrontation
  PROMPT: 'prompt',                  // entry text sent to the Oracle
  ORACLE_RESPONSE: 'oracleResponse', // Oracle's response prose
  REACTION: 'reaction',              // null | 'landed' | 'disagree' | 'sit_with' | 'missed'
  FOLLOW_UP_RESPONSE: 'followUpResponse', // optional Oracle follow-up text from "Go deeper"
  ORACLE_ENGAGED: 'oracleEngaged',   // always true on these docs; explicit for the engagement reader
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
  // ISO-week stamp ("YYYY-Www") of the most recently submitted weekly rule
  // review. The WeeklyRuleReview card on the Dashboard hides until the
  // current ISO week differs from this value.
  LAST_WEEKLY_RULE_REVIEW_WEEK: 'lastWeeklyRuleReviewWeek',
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
