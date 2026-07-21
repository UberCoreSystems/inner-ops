import { parseDate } from './dateUtils.js';

/**
 * Group journal entries into month sections for the collapsible entries list.
 *
 * Input is expected newest-first (the order `readUserDataPage` returns), and
 * that order is preserved both across groups and within each group — this does
 * not sort, so a caller passing an unsorted array gets unsorted output.
 *
 * Month keys are LOCAL year/month, matching `localDateKey`'s local-time
 * anchoring. A UTC slice would file a late-evening entry on the 31st under the
 * following month for users west of UTC.
 *
 * Entries whose date can't be resolved collect into a trailing `undated` group
 * rather than disappearing from the record.
 */
export function groupEntriesByMonth(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const groups = [];
  const byKey = new Map();
  let undated = null;

  for (const entry of entries) {
    // Same resolution order the entry card uses: `timestamp` first (carries the
    // optimistic local Date on a fresh save), then `createdAt`.
    const date = parseDate(entry?.timestamp) || parseDate(entry?.createdAt);

    if (!date) {
      if (!undated) undated = { key: 'undated', label: 'Undated', entries: [] };
      undated.entries.push(entry);
      continue;
    }

    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        year: date.getFullYear(),
        month: date.getMonth(),
        entries: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }

  if (undated) groups.push(undated);
  return groups;
}

export default groupEntriesByMonth;
