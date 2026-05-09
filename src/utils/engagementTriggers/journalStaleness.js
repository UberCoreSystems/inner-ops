import { ENGAGEMENT_TRIGGERS } from '../schema.js';

const HOURS = 60 * 60 * 1000;
export const STALENESS_THRESHOLD_HOURS = 36;

const toMillis = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === 'function') {
    try { return value.toDate().getTime(); } catch { return null; }
  }
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
};

/**
 * Most recent createdAt/timestamp across an array of journal entries.
 * Tolerates Firestore Timestamp objects, ISO strings, and Date instances.
 */
const latestEntryMillis = (entries) => {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  let latest = null;
  for (const e of entries) {
    const ms = toMillis(e?.createdAt) ?? toMillis(e?.timestamp);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
};

/**
 * Pure trigger evaluator. Called on app-shell mount and when journalEntries
 * or userProfiles change. Returns null when the banner should not be shown,
 * or a payload object when it should.
 *
 * The dismissal contract: a user-issued dismissal records `dismissedAt` in
 * userSettings.bannerDismissals[triggerId]. We re-fire only when the latest
 * journal entry is newer than the dismissal — i.e. the user has acted on
 * the prompt — OR when the dismissal is older than the current threshold
 * window, so a stale dismissal does not silence the prompt forever.
 */
export const evaluateJournalStaleness = ({
  journalEntries,
  userProfile,
  notificationPreferences,
  bannerDismissals,
  now = Date.now(),
  thresholdHours = STALENESS_THRESHOLD_HOURS,
}) => {
  const triggerId = ENGAGEMENT_TRIGGERS.JOURNAL_STALENESS;
  const enabled = notificationPreferences?.[triggerId]?.enabled !== false;
  if (!enabled) return null;

  const thresholdMs = thresholdHours * HOURS;
  const latest = latestEntryMillis(journalEntries);

  // Hours since last entry. With no entries at all, we treat the user as
  // having infinite staleness — the banner should appear immediately so
  // they understand journaling is the input layer.
  const hoursSinceLast = latest === null ? Infinity : (now - latest) / HOURS;
  if (hoursSinceLast < thresholdHours) return null;

  // Honor user dismissal until either (a) they journal, or (b) another
  // threshold window passes. This prevents a single dismissal from
  // silencing the trigger forever.
  const dismissedAtMs = toMillis(bannerDismissals?.[triggerId]);
  if (dismissedAtMs !== null) {
    const dismissedRecently = (now - dismissedAtMs) < thresholdMs;
    const userJournaledSinceDismissal = latest !== null && latest > dismissedAtMs;
    if (dismissedRecently && !userJournaledSinceDismissal) return null;
  }

  // Profile-aware copy enrichment (Section 2.5 of the onboarding plan).
  const activeSituations = Array.isArray(userProfile?.activeSituations)
    ? userProfile.activeSituations
        .map((s) => (typeof s === 'string' ? s.trim() : ''))
        .filter((s) => s.length > 0)
    : [];
  const hasContext = activeSituations.length > 0;

  const hoursLabel = hoursSinceLast === Infinity
    ? 'No entries yet'
    : `No entry in ${Math.round(hoursSinceLast)}h`;

  const copy = hasContext
    ? `${hoursLabel}. ${activeSituations[0]} is still in motion.`
    : `${hoursLabel}. Write what's actually happening.`;

  return {
    triggerId,
    copy,
    actionRoute: '/journal',
    actionLabel: 'Open journal',
    severity: 'neutral',
  };
};
