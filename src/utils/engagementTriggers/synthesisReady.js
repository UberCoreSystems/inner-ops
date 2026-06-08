import { ENGAGEMENT_TRIGGERS } from '../schema.js';

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
 * Pure trigger evaluator for "a new Synthesis briefing is waiting." Synthesis
 * is the product's cross-module readout and its strongest reason to return —
 * but today an unread briefing only nudges the user once they land on the
 * Dashboard. This surfaces it as an app-wide banner so returning to ANY page
 * (Journal, Ledger, …) carries the reason to open it.
 *
 * Deliberately suppressed on /dashboard (which has its own non-dismissible
 * synthesis banner) and on /synthesis (the destination) to avoid double-
 * surfacing the same prompt.
 *
 * Dismissal contract: a dismissal is honored until a NEWER briefing is
 * generated, so dismissing one week's briefing does not silence the next.
 */
export const evaluateSynthesisReady = ({
  syntheses,
  notificationPreferences,
  bannerDismissals,
  currentPath,
}) => {
  const triggerId = ENGAGEMENT_TRIGGERS.SYNTHESIS_READY;
  const enabled = notificationPreferences?.[triggerId]?.enabled !== false;
  if (!enabled) return null;

  // The Dashboard force-shows its own synthesis banner; /synthesis is the
  // destination. Don't duplicate the prompt on either.
  if (currentPath === '/dashboard' || currentPath === '/synthesis') return null;

  const list = Array.isArray(syntheses) ? syntheses : [];
  if (list.length === 0) return null;

  const latest = [...list].sort(
    (a, b) => (toMillis(b?.generatedAt) ?? 0) - (toMillis(a?.generatedAt) ?? 0)
  )[0];
  if (!latest || latest.isNew !== true) return null;

  const dismissedAtMs = toMillis(bannerDismissals?.[triggerId]);
  if (dismissedAtMs !== null) {
    const latestGenMs = toMillis(latest.generatedAt);
    const newerThanDismissal = latestGenMs !== null && latestGenMs > dismissedAtMs;
    if (!newerThanDismissal) return null;
  }

  return {
    triggerId,
    copy: 'A new synthesis is ready — the cross-module reading of your week.',
    actionRoute: '/synthesis',
    actionLabel: 'Open synthesis',
    severity: 'neutral',
  };
};
