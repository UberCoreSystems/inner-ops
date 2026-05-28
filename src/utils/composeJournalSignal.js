/**
 * composeJournalSignal — pure function that turns the recent journal stream
 * into one or two declarative assertions about mood pattern. Powers the
 * "so what" line under the 30-day mood strip on the Journal page.
 *
 * Voice rules (consumed by the Journal page):
 *   - Declarative observations, never encouragement. "Predominantly challenged"
 *     not "you've been struggling".
 *   - Skip when nothing meaningful to say (mirror composeMirrorReading).
 *   - No AI calls — deterministic given input.
 *
 * Thresholds mirror Dashboard's early-warning logic (5-of-last-7), expanded
 * to the three-category mood taxonomy from moods.js.
 */

import { moodCategories } from '../constants/moods.js';
import { getEntryTimestamp } from './dateUtils.js';

const PREDOMINANCE_WINDOW = 7;
const PREDOMINANCE_THRESHOLD = 5;
const CLUSTER_THRESHOLD = 3;

// Derive mood→category map once from the single source of truth.
const MOOD_TO_CATEGORY = (() => {
  const map = {};
  for (const cat of moodCategories) {
    for (const m of cat.moods) {
      map[m.value] = cat.name;
    }
  }
  return map;
})();

const CATEGORY_TO_TAKEAWAY = {
  Challenged: 'Predominantly challenged.',
  Grounded: 'Predominantly grounded.',
  Energized: 'Predominantly energized.',
};

const CATEGORY_TO_DIRECTION = {
  Challenged: 'negative',
  Grounded: 'neutral',
  Energized: 'positive',
};

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * @param {Array<object>} journalEntries
 * @param {{ now?: number }} [opts]
 * @returns {{ takeaway: string | null, cluster: string | null }}
 */
export function composeJournalSignal(journalEntries, opts = {}) {
  const entries = Array.isArray(journalEntries) ? journalEntries : [];
  const now = opts.now ?? Date.now();

  if (entries.length === 0) return { takeaway: null, cluster: null };

  // Sort entries newest-first by timestamp. Tolerate missing timestamps by
  // dropping them — they can't contribute to a temporal pattern.
  const dated = entries
    .map((e) => ({ entry: e, ts: getEntryTimestamp(e) }))
    .filter((x) => x.ts && x.ts <= now)
    .sort((a, b) => b.ts - a.ts);

  const recent = dated.slice(0, PREDOMINANCE_WINDOW);

  // --- Predominance (5+ of last 7 in one category) ---
  let takeaway = null;
  if (recent.length >= PREDOMINANCE_THRESHOLD) {
    const counts = {};
    for (const { entry } of recent) {
      const cat = MOOD_TO_CATEGORY[entry?.mood];
      if (!cat) continue;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    const [topCat, topCount] = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])[0] || [null, 0];
    if (topCat && topCount >= PREDOMINANCE_THRESHOLD) {
      const direction = CATEGORY_TO_DIRECTION[topCat];
      takeaway =
        `${CATEGORY_TO_TAKEAWAY[topCat]} ${topCount} of last ${recent.length} are ${direction}.`;
    }
  }

  // --- Cluster (3+ consecutive entries with the same mood value) ---
  // Walk newest→oldest; track longest run. Use the longest run, not the most
  // recent — a 4-entry run two days ago is more notable than a 3-entry run
  // ending today.
  let cluster = null;
  if (dated.length >= CLUSTER_THRESHOLD) {
    let bestRun = null;
    let runMood = null;
    let runStart = 0;
    for (let i = 0; i < dated.length; i++) {
      // Legacy entries can carry mood values that no longer exist in the
      // taxonomy (e.g. 'happy' from an older picker). Treat them the same as
      // missing moods — they break a run rather than extending it.
      const raw = dated[i].entry?.mood;
      const m = MOOD_TO_CATEGORY[raw] ? raw : null;
      if (m && m === runMood) {
        const length = i - runStart + 1;
        if (length >= CLUSTER_THRESHOLD && (!bestRun || length > bestRun.length)) {
          bestRun = { mood: m, length, startIdx: runStart, endIdx: i };
        }
      } else {
        runMood = m;
        runStart = i;
      }
    }
    if (bestRun) {
      // dated is newest-first; the cluster's oldest entry is at endIdx,
      // newest at startIdx. Format the day range oldest→newest.
      const newestTs = dated[bestRun.startIdx].ts;
      const oldestTs = dated[bestRun.endIdx].ts;
      const newestDay = WEEKDAY[new Date(newestTs).getDay()];
      const oldestDay = WEEKDAY[new Date(oldestTs).getDay()];
      const range = oldestDay === newestDay ? oldestDay : `${oldestDay}-${newestDay}`;
      cluster = `Cluster: ${bestRun.length} consecutive '${bestRun.mood}' entries ${range}.`;
    }
  }

  return { takeaway, cluster };
}

export default composeJournalSignal;
