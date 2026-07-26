/**
 * Signal Debrief — the single reader for a signal entry's lifecycle state.
 *
 * A signal opens a 48h window anchored on when the conditions occurred
 * (eventOccurredAt, falling back to createdAt/timestamp for legacy docs).
 * States:
 *   live    — window still open; the post-save checkpoint can close it.
 *   pending — window passed unresolved; the signal queues for the Debrief
 *             card. Nothing closes a pending signal except a user answer or
 *             the auto-landed derivation below.
 *   closed  — a stored resolution exists (held/landed via checkpoint or
 *             debrief), OR a relapse entry's event time falls inside the
 *             window (derived auto-landed — the record already answered, so
 *             no write is needed and no debrief is asked).
 *
 * Precedence: a landing relapse overrides a stored held — tapping
 * "conditions resolved" can never erase a relapse that occurred inside the
 * same window. One relapse lands every open window it falls inside. Window
 * bounds are half-open [anchor, anchor + 48h): at exactly +48h the window
 * has passed and a relapse at exactly +48h does not land it.
 */

import { toMs, getEntryTimestamp } from './dateUtils.js';
import {
  RELAPSE_FIELDS,
  RELAPSE_ENTRY_TYPES,
  SIGNAL_RESOLUTION_OUTCOMES,
  SIGNAL_RESOLUTION_VIA,
} from './schema.js';

export const SIGNAL_WINDOW_MS = 48 * 60 * 60 * 1000;

export const SIGNAL_STATES = Object.freeze({
  LIVE: 'live',
  PENDING: 'pending',
  CLOSED: 'closed',
});

/** Entries without an entryType were written before the field existed and
 *  are read as signals (see schema.js RELAPSE_ENTRY_TYPES comment). */
export const isSignalEntry = (entry) =>
  entry?.[RELAPSE_FIELDS.ENTRY_TYPE] !== RELAPSE_ENTRY_TYPES.RELAPSE;

/**
 * Window anchor in ms: the event time, falling back to createdAt/timestamp.
 * 0 when nothing is parseable — such docs derive as pending (window long
 * past) and sort to the front of the debrief queue.
 */
export const getSignalAnchorMs = (entry) =>
  toMs(entry?.eventOccurredAt) || getEntryTimestamp(entry);

/**
 * Earliest relapse entry whose event time falls inside the signal's window,
 * or null. Uses the same anchor precedence as signals so a backdated
 * relapse (eventOccurredAt before createdAt) lands the window it actually
 * fell inside.
 */
export function findLandingRelapse(signal, allEntries = []) {
  const anchor = getSignalAnchorMs(signal);
  if (!anchor) return null;
  let landing = null;
  let landingMs = Infinity;
  for (const other of allEntries) {
    if (isSignalEntry(other) || other.id === signal.id) continue;
    const t = getSignalAnchorMs(other);
    if (t >= anchor && t - anchor < SIGNAL_WINDOW_MS && t < landingMs) {
      landing = other;
      landingMs = t;
    }
  }
  return landing;
}

const isValidResolution = (resolution) =>
  resolution?.outcome === SIGNAL_RESOLUTION_OUTCOMES.HELD ||
  resolution?.outcome === SIGNAL_RESOLUTION_OUTCOMES.LANDED;

/**
 * Derive a signal entry's lifecycle state.
 * Returns null for relapse entries. For signals:
 *   { status: 'live'|'pending'|'closed', anchorMs, windowEndsAtMs,
 *     outcome?, via?, resolvedAt?, note?, relapseEntryId? }
 */
export function getSignalState(entry, allEntries = [], nowMs = Date.now()) {
  if (!entry || !isSignalEntry(entry)) return null;

  const anchorMs = getSignalAnchorMs(entry);
  const windowEndsAtMs = anchorMs ? anchorMs + SIGNAL_WINDOW_MS : 0;
  const base = { anchorMs, windowEndsAtMs };
  const resolution = entry[RELAPSE_FIELDS.RESOLUTION];

  // A relapse inside the window closes the signal as landed regardless of a
  // stored held. A stored LANDED resolution keeps its provenance (the
  // explicit slip/debrief stamp is a superset of the derivation).
  const landing = findLandingRelapse(entry, allEntries);
  if (landing || resolution?.outcome === SIGNAL_RESOLUTION_OUTCOMES.LANDED) {
    const stampedLanded = resolution?.outcome === SIGNAL_RESOLUTION_OUTCOMES.LANDED;
    return {
      ...base,
      status: SIGNAL_STATES.CLOSED,
      outcome: SIGNAL_RESOLUTION_OUTCOMES.LANDED,
      via: stampedLanded ? (resolution.via || SIGNAL_RESOLUTION_VIA.AUTO) : SIGNAL_RESOLUTION_VIA.AUTO,
      resolvedAt: stampedLanded
        ? resolution.resolvedAt
        : (landing?.eventOccurredAt || null),
      note: stampedLanded ? resolution.note : undefined,
      relapseEntryId: stampedLanded ? resolution.relapseEntryId : landing?.id,
    };
  }

  if (isValidResolution(resolution)) {
    return {
      ...base,
      status: SIGNAL_STATES.CLOSED,
      outcome: resolution.outcome,
      via: resolution.via || SIGNAL_RESOLUTION_VIA.CHECKPOINT,
      resolvedAt: resolution.resolvedAt,
      note: resolution.note,
      relapseEntryId: resolution.relapseEntryId,
    };
  }

  if (anchorMs && nowMs - anchorMs < SIGNAL_WINDOW_MS) {
    return { ...base, status: SIGNAL_STATES.LIVE };
  }

  return { ...base, status: SIGNAL_STATES.PENDING };
}

/**
 * Unresolved passed signals, oldest first — the Debrief card's queue.
 * Auto-landed signals derive as closed and drop out with zero writes.
 */
export function getDebriefQueue(entries = [], nowMs = Date.now()) {
  return entries
    .filter((entry) => getSignalState(entry, entries, nowMs)?.status === SIGNAL_STATES.PENDING)
    .sort((a, b) => getSignalAnchorMs(a) - getSignalAnchorMs(b));
}

const MS_PER_HOUR = 60 * 60 * 1000;

/** Remaining-window label for the live pill. */
export function formatWindowRemaining(ms) {
  if (ms <= 0) return 'window closed';
  if (ms < MS_PER_HOUR) return '<1h left';
  return `${Math.ceil(ms / MS_PER_HOUR)}h left`;
}
