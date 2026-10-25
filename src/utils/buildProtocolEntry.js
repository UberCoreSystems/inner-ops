/**
 * buildProtocolEntry — pure builder for a Protocol run logged from The Signal.
 * Produces a relapseEntries doc so an interrupted urge sits in the record
 * beside the signals and relapses it belongs with.
 *
 * Design constraints:
 *   - entryType is always 'signal', never 'relapse'. The protocol is a fast
 *     path and must not be able to log a confirmed relapse (which would let it
 *     farm relapse-based reads). The full wizard remains the only path there.
 *   - selectedSelf (archetype) and precursorConditions stay empty;
 *     detectDriftSignals skips empty-archetype entries, so a run feeds
 *     density/recency reads without corrupting archetype-streak detection.
 *   - protocolRun carries what the run itself knew: urge intensity, the
 *     trigger, which tools were run, how many breathing cycles completed.
 *
 * @param {object} run
 * @param {number} run.intensity — 1-10, clamped; non-numeric falls to 5.
 * @param {string} [run.trigger]
 * @param {string} [run.reflection]
 * @param {string[]} [run.toolsUsed] — ids from PROTOCOL_TOOL_IDS; others dropped.
 * @param {number} [run.breathingCycles]
 * @param {string} nowISO — ISO timestamp for the event (injected for testability).
 * @returns {object} a relapseEntries doc.
 */
import { RELAPSE_ENTRY_TYPES, RELAPSE_FIELDS } from './schema.js';

export const PROTOCOL_TOOL_IDS = Object.freeze(['grounding', 'breathing', 'cold', 'movement']);

const DEFAULT_INTENSITY = 5;

function clampIntensity(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_INTENSITY;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function buildProtocolEntry(run = {}, nowISO) {
  const eventOccurredAt = typeof nowISO === 'string' && nowISO ? nowISO : new Date().toISOString();
  const toolsUsed = Array.isArray(run.toolsUsed)
    ? [...new Set(run.toolsUsed.filter(t => PROTOCOL_TOOL_IDS.includes(t)))]
    : [];
  const cycles = Number(run.breathingCycles);
  const breathingCycles = Number.isFinite(cycles) && cycles > 0 ? Math.floor(cycles) : 0;

  return {
    entryType: RELAPSE_ENTRY_TYPES.SIGNAL,
    selectedSelf: '',
    selectedHabits: [],
    substanceUse: [],
    reflection: cleanText(run.reflection),
    precursorConditions: [],
    precursorContext: null,
    eventOccurredAt,
    entryProximityFlag: 'contemporaneous',
    [RELAPSE_FIELDS.PROTOCOL_RUN]: {
      intensity: clampIntensity(run.intensity),
      trigger: cleanText(run.trigger),
      toolsUsed,
      breathingCycles,
    },
  };
}

export default buildProtocolEntry;
