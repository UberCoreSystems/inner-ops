/**
 * exportData — pure assembly of the one-tap full data export.
 *
 * Kept side-effect-free (no Firestore, no DOM) so the manifest logic is
 * unit-testable. The caller (Settings) does the reads and the blob/download.
 *
 * The export carries a `manifest` — a content receipt of exactly what the file
 * contains (per-collection doc counts, per-memory-doc presence, total). When a
 * read fails upstream, the failing name is passed in via `errors` and the
 * manifest is marked `partial: true` so a zero count is never mistaken for
 * "you wrote nothing here" — it's flagged as "this part didn't load".
 */

import { MEMORY_DOC_IDS } from './memoryConstants.js';

const count = (v) => (Array.isArray(v) ? v.length : 0);
const present = (v) => (v ? 1 : 0);

/**
 * @param {Object}   params
 * @param {string}   params.exportedAt        ISO timestamp of the export
 * @param {Object}   params.collections       { [collectionName]: Array<doc> }
 * @param {Object}   [params.memory]          { [memoryDocId]: doc|null }
 * @param {Object}   [params.userProfile]     profile doc or null
 * @param {string[]} [params.errors]          names that failed to read
 * @returns {Object} the full export payload, manifest first
 */
export function buildExportPayload({
  exportedAt,
  collections = {},
  memory = {},
  userProfile = null,
  errors = [],
}) {
  const collectionCounts = {};
  for (const [name, value] of Object.entries(collections)) {
    collectionCounts[name] = count(value);
  }

  // Presence per memory doc, anchored to the canonical id list so the manifest
  // always reports all five docs (0 when absent) rather than only the ones read.
  const memoryPresence = {};
  for (const id of MEMORY_DOC_IDS) {
    memoryPresence[id] = present(memory?.[id]);
  }

  const totalDocuments =
    Object.values(collectionCounts).reduce((a, b) => a + b, 0) +
    Object.values(memoryPresence).reduce((a, b) => a + b, 0) +
    present(userProfile);

  const manifest = {
    collections: collectionCounts,
    memory: memoryPresence,
    userProfile: present(userProfile),
    totalDocuments,
    partial: errors.length > 0,
    errors: [...errors],
  };

  return {
    exportedAt,
    manifest,
    ...collections,
    userProfile,
    memory,
  };
}
