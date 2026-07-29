/**
 * Helpers for user-defined precursor conditions (Relapse Radar "Other").
 *
 * Custom conditions live on userSettings.customPrecursorConditions as plain
 * strings and are saved verbatim into entries' precursorConditions, so
 * detectDriftSignals streaks over them exactly like built-ins. Everything
 * downstream depends on string consistency — chips guarantee identical reuse,
 * these helpers guarantee the stored list stays clean and capped.
 */

export const CUSTOM_PRECURSOR_LIMITS = Object.freeze({
  MAX_COUNT: 6,
  MAX_LENGTH: 40,
});

// Trim and collapse internal whitespace so "late  night" and "late night"
// can never coexist as distinct conditions. Non-strings normalize to ''.
export const normalizeCondition = (raw) => {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim();
};

const lower = (s) => s.toLowerCase();

/**
 * Attempt to add a custom condition. Returns
 *   { ok: true, list, value }  — new list (input untouched), normalized value
 *   { ok: false, reason }      — 'empty' | 'too_long' | 'limit' | 'duplicate'
 * Duplicates are checked case-insensitively against both builtins and the
 * current custom list.
 */
export const addCustomPrecursor = (current, raw, builtins) => {
  const list = Array.isArray(current) ? current : [];
  const value = normalizeCondition(raw);
  if (!value) return { ok: false, reason: 'empty' };
  if (value.length > CUSTOM_PRECURSOR_LIMITS.MAX_LENGTH) return { ok: false, reason: 'too_long' };
  if (list.length >= CUSTOM_PRECURSOR_LIMITS.MAX_COUNT) return { ok: false, reason: 'limit' };
  const taken = new Set([...(Array.isArray(builtins) ? builtins : []), ...list].map(lower));
  if (taken.has(lower(value))) return { ok: false, reason: 'duplicate' };
  return { ok: true, list: [...list, value], value };
};

// Exact-match removal. Historical entries keep the string by design — drift
// detection over past data must not be rewritten.
export const removeCustomPrecursor = (current, value) =>
  (Array.isArray(current) ? current : []).filter((c) => c !== value);

/**
 * Load-time guard for the settings field: whatever is stored, return a
 * clean list — normalized, deduped against builtins and itself
 * (case-insensitive), overlength dropped, capped, order preserved.
 */
export const sanitizeCustomList = (value, builtins) => {
  if (!Array.isArray(value)) return [];
  const seen = new Set((Array.isArray(builtins) ? builtins : []).map(lower));
  const out = [];
  for (const item of value) {
    const v = normalizeCondition(item);
    if (!v || v.length > CUSTOM_PRECURSOR_LIMITS.MAX_LENGTH) continue;
    if (seen.has(lower(v))) continue;
    seen.add(lower(v));
    out.push(v);
    if (out.length >= CUSTOM_PRECURSOR_LIMITS.MAX_COUNT) break;
  }
  return out;
};
