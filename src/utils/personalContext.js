/**
 * Helpers for the personal-context fields stored on userProfiles.
 *
 * Data shape (string[] for everything except operatingContext):
 *   activeSituations, keyPeople, knownTriggers — array of trimmed,
 *     non-empty short statements, capped at the limits stated in
 *     USER_PROFILE_FIELDS comments (3 / 5 / 5).
 *   operatingContext — single trimmed string.
 *
 * The wizard and Settings page both bind textareas as raw multi-line text
 * and parse on save via `parseLines`. `linesToText` is the inverse, used
 * when re-hydrating Settings from a saved profile.
 */

/**
 * Split a textarea value into a clean array of trimmed non-empty lines,
 * capped at `max` entries. `max` of 0 or a negative number returns an
 * empty array. Defensive against null / undefined / non-string input.
 */
export const parseLines = (value, max) => {
  if (typeof value !== 'string') return [];
  if (typeof max !== 'number' || !Number.isFinite(max) || max <= 0) return [];
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
};

/**
 * Inverse of parseLines: serialize a string array (or any falsy/non-array
 * value) back to a newline-joined textarea value.
 */
export const linesToText = (arr) =>
  Array.isArray(arr) ? arr.join('\n') : '';

export const PERSONAL_CONTEXT_LIMITS = Object.freeze({
  ACTIVE_SITUATIONS: 3,
  KEY_PEOPLE: 5,
  KNOWN_TRIGGERS: 5,
});
