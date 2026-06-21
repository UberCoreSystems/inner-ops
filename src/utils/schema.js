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
  RELAPSE_ENTRIES: 'relapseEntries',
  USER_SETTINGS: 'userSettings',
  SYNTHESES: 'syntheses',
  CONFRONTATIONS: 'confrontations',
});

// Pattern-trust gate (BER-194): minimum total behavioral entries before
// cross-module pattern claims (relapse archetypes, temporal correlations) are
// meaningful. Below this, surfaces use non-pattern framing or return an
// explicit insufficient-signal state. Single source of truth — consumed by
// aiFeedback and crossModuleCorrelation.
export const PATTERN_TRUST_MIN_ENTRIES = 21;

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
  // Per-rule violation log. Each entry:
  //   { date: ISO, source: 'direct' | 'weekly_review',
  //     note?: string,                      // legacy free-text (pre after-action)
  //     cause?: string, correction?: string, resolvedAt?: ISO }  // after-action
  // Written by the in-the-moment "Rule broken" button on the Hard Lessons page
  // and by the weekly rule review on the Dashboard. An unresolved most-recent
  // break (no resolvedAt / note) means the rule is "under review"; completing
  // the after-action review stamps resolvedAt and re-affirms the rule. State is
  // derived in src/utils/ruleState.js — the single reader for every module.
  VIOLATIONS: 'violations',
  LAST_VIOLATED_AT: 'lastViolatedAt',
  // After-action review fields on each violations[] entry.
  VIOLATION_RESOLVED_AT: 'resolvedAt',
  VIOLATION_CAUSE: 'cause',
  VIOLATION_CORRECTION: 'correction',
});

// Journal-entry fields consumed cross-module.
export const JOURNAL_FIELDS = Object.freeze({
  MOOD: 'mood',
  MOOD_ALT: 'selectedMood', // legacy alias, still present in older docs
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
  // review. Vestigial — kept for historical data on existing user docs but
  // no longer read by any active code. The Sunday-anchored model below
  // superseded it.
  LAST_WEEKLY_RULE_REVIEW_WEEK: 'lastWeeklyRuleReviewWeek',
  // YYYY-MM-DD (local date) of the Sunday whose weekly rule review the user
  // most recently submitted or skipped. WeeklyRuleReview renders on Sun-Wed
  // and hides for the rest of the week once this stamp matches the current
  // Sunday anchor.
  LAST_REVIEWED_SUNDAY: 'lastReviewedSunday',
  // Engagement banner system.
  // notificationPreferences: { [triggerId]: { enabled: boolean } }
  // bannerDismissals: { [triggerId]: ISO timestamp } — last-dismissed; the
  // trigger evaluator re-fires only when the underlying condition re-asserts.
  NOTIFICATION_PREFERENCES: 'notificationPreferences',
  BANNER_DISMISSALS: 'bannerDismissals',
});

// User-profile fields. Lives on userProfiles/{uid}, written by Onboarding,
// Profile, and Settings. Read by Oracle for context.
export const USER_PROFILE_FIELDS = Object.freeze({
  // Onboarding state — written by Onboarding wizard on completion or skip.
  ONBOARDING_COMPLETED_AT: 'onboardingCompletedAt',
  ONBOARDING_SKIPPED: 'onboardingSkipped',
  // Personal context (Section 2.5 of the onboarding/engagement plan). All
  // optional. Drives banner copy enrichment (pre-deploy) and personalized
  // Daily Prompt rotation (v1.1).
  ACTIVE_SITUATIONS: 'activeSituations',     // string[] (up to 3 short statements)
  KNOWN_TRIGGERS: 'knownTriggers',           // string[] (up to 5 short statements)
  OPERATING_CONTEXT: 'operatingContext',     // string (single paragraph)
});

// Engagement-trigger registry. Keys are stable IDs persisted in
// notificationPreferences and bannerDismissals. Adding a trigger here
// requires a corresponding evaluator in src/utils/engagementTriggers/.
export const ENGAGEMENT_TRIGGERS = Object.freeze({
  JOURNAL_STALENESS: 'journalStaleness',
  KILL_LIST_CHECK_IN: 'killListCheckIn',
  SYNTHESIS_READY: 'synthesisReady',
  IDENTITY_DIRECTION_REVIEW: 'identityDirectionReview',
});

// Default notification preferences for new accounts. Journal-staleness (the
// input layer) and synthesis-ready (the cross-module readout, low frequency)
// are ON by default; other modules are recap or user-owned action that does
// not warrant a prompt.
export const DEFAULT_NOTIFICATION_PREFERENCES = Object.freeze({
  [ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS]: { enabled: true },
  [ENGAGEMENT_TRIGGERS.KILL_LIST_CHECK_IN]: { enabled: false },
  [ENGAGEMENT_TRIGGERS.SYNTHESIS_READY]: { enabled: true },
  [ENGAGEMENT_TRIGGERS.IDENTITY_DIRECTION_REVIEW]: { enabled: false },
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
