/**
 * bridgeSignalToHardLessons — the hand-off when a signal landed.
 *
 * The Signal records the conditions before a slip; Hard Lessons records the
 * slip itself (event → assumption → cost → rule). When the user says a signal
 * landed — the post-save "I slipped" checkpoint or the Debrief card's "It
 * landed" — the signal is stamped landed and the lesson form opens prefilled
 * from it. The prefill rides sessionStorage under the key HardLessons.jsx
 * already consumes for the Journal and Kill List bridges.
 */
import { resolveArchetypeLabel } from './relapseTaxonomy.js';
import { RELAPSE_FIELDS } from './schema.js';

export const HL_BRIDGE_PREFILL_KEY = 'hl_bridge_prefill';

const text = (value) => (typeof value === 'string' ? value.trim() : '');

/** Pure: the Hard Lessons prefill for a landed signal. */
export function buildSignalLessonPrefill(signal) {
  const archetype = text(resolveArchetypeLabel(signal?.[RELAPSE_FIELDS.ARCHETYPE]));
  const protocolRun = signal?.[RELAPSE_FIELDS.PROTOCOL_RUN];
  const lead = archetype || (protocolRun && typeof protocolRun === 'object' ? 'Protocol run' : '');
  const precursors = Array.isArray(signal?.[RELAPSE_FIELDS.PRECURSORS])
    ? signal[RELAPSE_FIELDS.PRECURSORS].map(text).filter(Boolean)
    : [];
  const reflection = text(signal?.[RELAPSE_FIELDS.REFLECTION]);

  const head = [lead, precursors.length ? `conditions: ${precursors.join(', ')}` : '']
    .filter(Boolean)
    .join(' — ');
  const eventDescription = [head ? `${head}.` : '', reflection].filter(Boolean).join(' ');

  return {
    eventDescription,
    ...(signal?.id ? { sourceSignalId: signal.id } : {}),
  };
}

/**
 * Stash the prefill for the Hard Lessons page to consume on mount. Storage
 * failures are swallowed, as in every other bridge — the user still lands on
 * the form, just unprefilled. Returns the payload for callers that log it.
 */
export function bridgeSignalToHardLessons(signal) {
  const prefill = buildSignalLessonPrefill(signal);
  try {
    sessionStorage.setItem(HL_BRIDGE_PREFILL_KEY, JSON.stringify(prefill));
  } catch { /* ignore storage errors */ }
  return prefill;
}

export default bridgeSignalToHardLessons;
