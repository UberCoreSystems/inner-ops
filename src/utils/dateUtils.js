/**
 * Centralized date / timestamp helpers.
 *
 * Inputs across the app come in three shapes:
 *   1. Firestore Timestamp (has `.toDate()`)
 *   2. ISO string or millisecond number (passes through `new Date(value)`)
 *   3. Entry objects with `{ createdAt, timestamp }` — `createdAt` may be (1) or (2);
 *      `timestamp` is a fallback ms number used by some legacy writers.
 *
 * Keep these as the sole source of truth — if Firestore Timestamp handling
 * ever changes, this is the only file that needs editing.
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Normalize any of (Firestore Timestamp | ISO string | Date | ms number) → ms.
 * Returns 0 for null / undefined / unparseable input.
 */
export const toMs = (value) => {
  if (!value) return 0;
  if (value?.toDate) return value.toDate().getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

/**
 * Read an entry's effective timestamp. Prefers `entry.createdAt` (any of the
 * shapes above) and falls back to the legacy `entry.timestamp` ms number.
 */
export const getEntryTimestamp = (entry) =>
  toMs(entry?.createdAt) || (entry?.timestamp ?? 0);

/**
 * Normalize any of the supported inputs → Date object, or null if unparseable.
 */
export const parseDate = (value) => {
  if (!value) return null;
  if (value?.toDate) {
    const d = value.toDate();
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Canonical YYYY-MM-DD key in the browser's LOCAL date (not UTC). Anchoring to
 * local date is deliberate and must be used app-wide: a UTC `toISOString()`
 * slice rolls to "tomorrow" for users west of UTC in the evening, so mixing
 * the two makes "is this from today?" checks disagree across modules.
 * Accepts a Date, Firestore Timestamp, ISO string, or ms number; defaults to now.
 */
export const localDateKey = (value = new Date()) => {
  const d = value instanceof Date ? value : (parseDate(value) || new Date());
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

