/**
 * buildQuickSignalEntry — pure builder for an in-the-moment voice "quick log"
 * in The Signal. Produces a minimal relapseEntries doc so a user can capture a
 * precursor the instant it happens, without the full 5-step wizard.
 *
 * Design constraints:
 *   - entryType is always 'signal' (a precursor), never 'relapse' — a fast,
 *     low-friction capture must not be able to log a confirmed relapse (which
 *     would let it farm relapse-based reads). The full wizard remains the only
 *     path to log an actual relapse.
 *   - selectedSelf (archetype) and precursorConditions are intentionally empty;
 *     detectDriftSignals tolerates both (it skips empty-archetype entries), so
 *     a quick log feeds total-density/recency reads without corrupting
 *     archetype-streak detection.
 *
 * @param {string} transcript — the spoken/typed reflection.
 * @param {string} nowISO — ISO timestamp for the event (injected for testability).
 * @returns {object} a relapseEntries doc, or null if the transcript is empty.
 */
import { RELAPSE_ENTRY_TYPES } from './schema.js';

export function buildQuickSignalEntry(transcript, nowISO) {
  const reflection = typeof transcript === 'string' ? transcript.trim() : '';
  if (!reflection) return null;
  const eventOccurredAt = typeof nowISO === 'string' && nowISO ? nowISO : new Date().toISOString();
  return {
    entryType: RELAPSE_ENTRY_TYPES.SIGNAL,
    selectedSelf: '',
    selectedHabits: [],
    substanceUse: [],
    reflection,
    precursorConditions: [],
    precursorContext: null,
    eventOccurredAt,
    entryProximityFlag: 'contemporaneous',
    isQuickLog: true,
  };
}

export default buildQuickSignalEntry;
