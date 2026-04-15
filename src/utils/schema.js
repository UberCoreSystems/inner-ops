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
});
