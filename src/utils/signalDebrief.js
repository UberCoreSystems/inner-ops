/**
 * Signal Debrief — the single reader for a signal entry's lifecycle state.
 *
 * Every relapseEntries doc is a signal. A signal opens a 48h window anchored
 * on when the conditions occurred (eventOccurredAt, falling back to
 * createdAt/timestamp for legacy docs). States:
 *   live    — window still open; the post-save checkpoint can close it.
 *   pending — window passed unresolved; the signal queues for the Debrief
 *             card. Nothing closes a pending signal except a user answer.
 *   closed  — a stored resolution exists: held or landed, via the checkpoint,
 *             the debrief card, or the legacy-relapse migration.
 *
 * Nothing is derived from other entries. The event a landed signal points at
 * is Hard Lessons' record, not this collection's. Window bounds are half-open
 * [anchor, anchor + 48h): at exactly +48h the window has passed.
 */

import { toMs, getEntryTimestamp } from './dateUtils.js';
import {
  RELAPSE_FIELDS,
  SIGNAL_RESOLUTION_OUTCOMES,
  SIGNAL_RESOLUTION_VIA,
} from './schema.js';

export const SIGNAL_WINDOW_MS = 48 * 60 * 60 * 1000;

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

const MS_PER_HOUR = 60 * 60 * 1000;

/** Remaining-window label for the live pill. */
export function formatWindowRemaining(ms) {
  if (ms <= 0) return 'window closed';
  if (ms < MS_PER_HOUR) return '<1h left';
  return `${Math.ceil(ms / MS_PER_HOUR)}h left`;
}
