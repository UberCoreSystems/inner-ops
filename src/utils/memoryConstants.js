/**
 * Long-term AI memory — shared constants (client side).
 *
 * One memory doc per module plus a `global` synthesis doc, stored at
 * `users/{uid}/memory/{docId}`. Docs are written EXCLUSIVELY by Cloud
 * Functions (Admin SDK); the client reads them and routes edit/wipe through
 * callables. Mirror of the minimal server constants in `functions/memory.js`.
 */

// Memory doc ids. The four module ids double as the `module` argument passed
// to the updateMemory / editMemory / wipeMemory callables.
export const MEMORY_MODULES = ['journal', 'killList', 'hardLessons', 'relapse'];
export const MEMORY_GLOBAL = 'global';
export const MEMORY_DOC_IDS = [MEMORY_GLOBAL, ...MEMORY_MODULES];

// Human-facing labels — match existing module naming (General Ledger / The Signal).
export const MEMORY_MODULE_LABELS = {
  global: 'The Through-Line',
  journal: 'Journal',
  killList: 'General Ledger',
  hardLessons: 'Hard Lessons',
  relapse: 'The Signal',
};

// Which Firestore collection each module's source entries live in — used by the
// updateMemory Cloud Function to read the authoritative entry by id.
export const MEMORY_SOURCE_COLLECTIONS = {
  journal: 'journalEntries',
  killList: 'killTargets',
  hardLessons: 'hardLessons',
  relapse: 'relapseEntries',
};

// Caps (kept in sync with functions/memory.js).
export const MEMORY_MAX_RECEIPTS_PER_MODULE = 5;
export const MEMORY_RECEIPT_MAX_WORDS = 25;

export const isMemoryModule = (m) => MEMORY_MODULES.includes(m);
