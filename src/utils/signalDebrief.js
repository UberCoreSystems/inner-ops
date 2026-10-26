/**
 * Signal Debrief — the single reader for a signal entry's lifecycle state.
 *
 * Every relapseEntries doc is a signal. A signal opens a 72h window anchored
 * on when the conditions occurred (eventOccurredAt, falling back to
 * createdAt/timestamp for legacy docs). States:
 *   live    — window still open; the post-save checkpoint or the open-signal
 *             card can close it. The server emails a reminder at +24h.
 *   pending — window passed unresolved; the signal queues for the Debrief
 *             card. Nothing closes a pending signal except a user answer.
 *   closed  — a stored resolution exists: held or landed, via the checkpoint,
 *             the debrief card, or the legacy-relapse migration.
 *
 * Nothing is derived from other entries. The event a landed signal points at
 * is Hard Lessons' record, not this collection's. Window bounds are half-open
 * [anchor, anchor + 72h): at exactly +72h the window has passed.
 *
 * functions/signalReminders.js mirrors the anchor and window rules for the
 * email schedule; change them together.
 */

import { toMs, getEntryTimestamp } from './dateUtils.js';
import {
  RELAPSE_FIELDS,
  SIGNAL_RESOLUTION_OUTCOMES,
  SIGNAL_RESOLUTION_VIA,
} from './schema.js';

export const SIGNAL_WINDOW_MS = 72 * 60 * 60 * 1000;
// First email reminder, measured from the anchor. Sent by the server only.
export const SIGNAL_REMINDER_AFTER_MS = 24 * 60 * 60 * 1000;

export const SIGNAL_STATES = Object.freeze({
  LIVE: 'live',
  PENDING: 'pending',
  CLOSED: 'closed',
});

/**
 * Window anchor in ms: the event time, falling back to createdAt/timestamp.
 * 0 when nothing is parseable — such docs derive as pending (window long
 * past) and sort to the front of the debrief queue.
 */
export const getSignalAnchorMs = (entry) =>
  toMs(entry?.eventOccurredAt) || getEntryTimestamp(entry);

const isValidResolution = (resolution) =>
  resolution?.outcome === SIGNAL_RESOLUTION_OUTCOMES.HELD ||
  resolution?.outcome === SIGNAL_RESOLUTION_OUTCOMES.LANDED;

/**
 * Derive a signal entry's lifecycle state. Null only for a missing entry.
 *   { status: 'live'|'pending'|'closed', anchorMs, windowEndsAtMs,
 *     outcome?, via?, resolvedAt?, note? }
 */
export function getSignalState(entry, nowMs = Date.now()) {
  if (!entry) return null;

  const anchorMs = getSignalAnchorMs(entry);
  const windowEndsAtMs = anchorMs ? anchorMs + SIGNAL_WINDOW_MS : 0;
  const base = { anchorMs, windowEndsAtMs };
  const resolution = entry[RELAPSE_FIELDS.RESOLUTION];

  if (isValidResolution(resolution)) {
    return {
      ...base,
      status: SIGNAL_STATES.CLOSED,
      outcome: resolution.outcome,
      via: resolution.via || SIGNAL_RESOLUTION_VIA.CHECKPOINT,
      resolvedAt: resolution.resolvedAt,
      note: resolution.note,
    };
  }

  if (anchorMs && nowMs - anchorMs < SIGNAL_WINDOW_MS) {
    return { ...base, status: SIGNAL_STATES.LIVE };
  }

  return { ...base, status: SIGNAL_STATES.PENDING };
}

/** Unresolved passed signals, oldest first — the Debrief card's queue. */
export function getDebriefQueue(entries = [], nowMs = Date.now()) {
  return entries
    .filter((entry) => getSignalState(entry, nowMs)?.status === SIGNAL_STATES.PENDING)
    .sort((a, b) => getSignalAnchorMs(a) - getSignalAnchorMs(b));
}

/**
 * Every signal still awaiting an answer, in the order the card walks them:
 * pending oldest first (the overdue ones), then live newest first. Each item
 * is { entry, state }.
 */
export function getOpenSignals(entries = [], nowMs = Date.now()) {
  const pending = [];
  const live = [];
  for (const entry of entries) {
    const state = getSignalState(entry, nowMs);
    if (state?.status === SIGNAL_STATES.PENDING) pending.push({ entry, state });
    else if (state?.status === SIGNAL_STATES.LIVE) live.push({ entry, state });
  }
  pending.sort((a, b) => a.state.anchorMs - b.state.anchorMs);
  live.sort((a, b) => b.state.anchorMs - a.state.anchorMs);
  return [...pending, ...live];
}

const MS_PER_HOUR = 60 * 60 * 1000;

/** Remaining-window label for the live pill. */
export function formatWindowRemaining(ms) {
  if (ms <= 0) return 'window closed';
  if (ms < MS_PER_HOUR) return '<1h left';
  return `${Math.ceil(ms / MS_PER_HOUR)}h left`;
}
