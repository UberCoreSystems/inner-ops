import { ENGAGEMENT_TRIGGERS } from '../schema.js';

const HOURS = 60 * 60 * 1000;
// A contract is "due" for a check-in once this many hours have passed since
// its last check-in. A loose daily cadence — not a hard 24h — so an evening
// check-in doesn't suppress the next morning's nudge.
export const CHECK_IN_DUE_HOURS = 20;

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
 * Most recent check-in timestamp for a single target. Prefers `lastCheckIn`,
 * falling back to the newest entry in the `checkIns` array.
 */
const lastCheckInMillis = (target) => {
  const direct = toMillis(target?.lastCheckIn);
  if (direct !== null) return direct;
  const checkIns = Array.isArray(target?.checkIns) ? target.checkIns : [];
  let latest = null;
  for (const c of checkIns) {
    const ms = toMillis(c?.date) ?? toMillis(c);
    if (ms !== null && (latest === null || ms > latest)) latest = ms;
  }
  return latest;
};

/**
 * Pure trigger evaluator for the daily Kill List (General Ledger) check-in.
 * Fires when one or more active contracts have gone past the check-in window
 * without being held or marked escaped. Off by default — only journaling is
 * on by default (see DEFAULT_NOTIFICATION_PREFERENCES).
 *
 * Dismissal contract mirrors journalStaleness: a dismissal is honored until
 * either the user checks in on a contract (newer check-in than the dismissal)
 * or another check-in window passes, so one dismissal never silences it for
 * good.
 */
export const evaluateKillListCheckIn = ({
  killTargets,
  notificationPreferences,
  bannerDismissals,
  now = Date.now(),
  dueHours = CHECK_IN_DUE_HOURS,
}) => {
  const triggerId = ENGAGEMENT_TRIGGERS.KILL_LIST_CHECK_IN;
  const enabled = notificationPreferences?.[triggerId]?.enabled !== false;
  if (!enabled) return null;

  const active = Array.isArray(killTargets)
    ? killTargets.filter((t) => t?.status === 'active')
    : [];
  if (active.length === 0) return null;

  const dueMs = dueHours * HOURS;
  // A contract with no check-in at all is treated as infinitely overdue.
  const dueTargets = active.filter((t) => {
    const last = lastCheckInMillis(t);
    return last === null || (now - last) >= dueMs;
  });
  if (dueTargets.length === 0) return null;

  // Honor a recent dismissal unless the user has checked in on any contract
  // since dismissing, or a full window has elapsed.
  const dismissedAtMs = toMillis(bannerDismissals?.[triggerId]);
  if (dismissedAtMs !== null) {
    const dismissedRecently = (now - dismissedAtMs) < dueMs;
    const latestCheckIn = active.reduce((m, t) => {
      const last = lastCheckInMillis(t);
      return last !== null && last > m ? last : m;
    }, 0);
    const checkedInSinceDismissal = latestCheckIn > dismissedAtMs;
    if (dismissedRecently && !checkedInSinceDismissal) return null;
  }

  const count = dueTargets.length;
  const noun = count === 1 ? 'contract' : 'contracts';
  const copy = count === 1
    ? `“${dueTargets[0].title || 'A contract'}” is open today. Hold the line or log the slip.`
    : `${count} ${noun} are open today. Hold the line or log the slip.`;

  return {
    triggerId,
    copy,
    actionRoute: '/ledger',
    actionLabel: 'Open ledger',
    severity: 'neutral',
  };
};
