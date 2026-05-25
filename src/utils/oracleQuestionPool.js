/**
 * Oracle question pool — aggregator + selector for the Dashboard's Today's
 * Reflection rotation.
 *
 * Pool sources (every collection that already persists Oracle prose or a
 * structured question):
 *   - journalEntries.oracleClosingQuestion (or heuristic over oracleJudgment)
 *   - hardLessons.oracleClosingQuestion (or heuristic over oracleWisdom)
 *   - relapseEntries.oracleClosingQuestion (or heuristic over oracleFeedback)
 *   - confirmedKills.oracleClosingQuestion (or heuristic over closure/oracleStatement)
 *   - killTargets.oracleClosingQuestion (or heuristic over escapeOracleResponse)
 *   - syntheses.confrontationQuestion (already structured)
 *
 * Selection: recency-weighted shuffle, date-seeded by `YYYY-MM-DD + uid`,
 * filtered against `userSettings.recentlyShownDailyPromptIds`.
 *
 * Items older than `LOOKBACK_DAYS` are dropped to keep questions feeling
 * current. The pool is intentionally bounded — old questions stop feeding
 * the rotation rather than living forever.
 */

import { readUserData, writeData, updateData } from './firebaseUtils.js';
import { COLLECTIONS, ORACLE_FIELDS, USER_SETTINGS_FIELDS } from './schema.js';
import { extractClosingQuestion } from './oracleQuestionExtractor.js';

const LOOKBACK_DAYS = 60;
const RECENT_SHOWN_CAP = 14;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const MODULE_LABELS = Object.freeze({
  journalEntries: 'a journal entry',
  hardLessons: 'a hard lesson',
  relapseEntries: 'a Relapse Radar entry',
  killTargets: 'a Kill List escape',
  confirmedKills: 'a Kill List closure',
  syntheses: 'a Synthesis Briefing',
});

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    const d = value.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function withinLookback(date, now = new Date()) {
  if (!date) return false;
  const ageMs = now.getTime() - date.getTime();
  return ageMs >= 0 && ageMs <= LOOKBACK_DAYS * MS_PER_DAY;
}

function pickEventDate(doc) {
  return (
    toDate(doc?.eventOccurredAt) ||
    toDate(doc?.killedAt) ||
    toDate(doc?.escapedAt) ||
    toDate(doc?.finalizedAt) ||
    toDate(doc?.generatedAt) ||
    toDate(doc?.oracleRequestedAt) ||
    toDate(doc?.createdAt) ||
    toDate(doc?.timestamp) ||
    null
  );
}

function buildPoolEntry(collectionName, doc, question, eventDate) {
  if (!question || typeof question !== 'string') return null;
  const trimmed = question.trim();
  if (!trimmed || !trimmed.endsWith('?')) return null;
  return {
    id: `${collectionName}/${doc.id}`,
    question: trimmed,
    sourceModule: collectionName,
    sourceDocId: doc.id,
    eventOccurredAt: eventDate ? eventDate.toISOString() : null,
    displayLabel: MODULE_LABELS[collectionName] || 'an entry',
  };
}

function questionFromJournal(doc) {
  return doc[ORACLE_FIELDS.CLOSING_QUESTION] || extractClosingQuestion(doc[ORACLE_FIELDS.JOURNAL_PROSE]);
}

function questionFromLesson(doc) {
  if (!doc.isFinalized) return null;
  return doc[ORACLE_FIELDS.CLOSING_QUESTION] || extractClosingQuestion(doc[ORACLE_FIELDS.LESSON_PROSE]);
}

function questionFromRelapse(doc) {
  return doc[ORACLE_FIELDS.CLOSING_QUESTION] || extractClosingQuestion(doc[ORACLE_FIELDS.RELAPSE_PROSE]);
}

function questionFromKillTarget(doc) {
  return doc[ORACLE_FIELDS.CLOSING_QUESTION] || extractClosingQuestion(doc[ORACLE_FIELDS.KILL_ESCAPE_RESPONSE]);
}

function questionFromConfirmedKill(doc) {
  return (
    doc[ORACLE_FIELDS.CLOSING_QUESTION] ||
    extractClosingQuestion(doc[ORACLE_FIELDS.KILL_CLOSURE_RESPONSE]) ||
    extractClosingQuestion(doc.oracleStatement)
  );
}

function questionFromSynthesis(doc) {
  const q = doc[ORACLE_FIELDS.SYNTHESIS_QUESTION];
  if (typeof q === 'string' && q.trim()) return q.trim();
  return null;
}

const SOURCE_HANDLERS = [
  { collection: COLLECTIONS.JOURNAL_ENTRIES, getQuestion: questionFromJournal },
  { collection: COLLECTIONS.HARD_LESSONS, getQuestion: questionFromLesson },
  { collection: COLLECTIONS.RELAPSE_ENTRIES, getQuestion: questionFromRelapse },
  { collection: COLLECTIONS.KILL_TARGETS, getQuestion: questionFromKillTarget },
  { collection: 'confirmedKills', getQuestion: questionFromConfirmedKill },
  { collection: COLLECTIONS.SYNTHESES, getQuestion: questionFromSynthesis },
];

/**
 * Build the cross-collection pool of Oracle closing questions for the current
 * user. Filters to entries within the lookback window. Returns up to one
 * question per source doc; older questions and prose without a recoverable
 * question are skipped.
 *
 * `hasAnyEntries` reports whether any of the 6 source collections contained at
 * least one doc — a true-zero signal that DailyPrompt uses to decide whether
 * to show the cold-start hint. This is distinct from `pool.length === 0`,
 * which can also be zero when entries exist but yielded no extractable
 * questions.
 *
 * The return type changed from `Array` to `{ pool, hasAnyEntries }`. Treat as
 * an internal API — only DailyPrompt.jsx consumes it.
 */
export async function buildOracleQuestionPool({ now = new Date() } = {}) {
  const reads = await Promise.all(
    SOURCE_HANDLERS.map(({ collection }) =>
      readUserData(collection).catch(() => [])
    )
  );

  const pool = [];
  let entryCount = 0;
  for (let i = 0; i < SOURCE_HANDLERS.length; i += 1) {
    const handler = SOURCE_HANDLERS[i];
    const docs = Array.isArray(reads[i]) ? reads[i] : [];
    entryCount += docs.length;
    for (const doc of docs) {
      if (!doc || !doc.id) continue;
      const eventDate = pickEventDate(doc);
      if (!withinLookback(eventDate, now)) continue;
      const question = handler.getQuestion(doc);
      const entry = buildPoolEntry(handler.collection, doc, question, eventDate);
      if (entry) pool.push(entry);
    }
  }

  return { pool, hasAnyEntries: entryCount > 0 };
}

/**
 * Stable hash for date-seeded selection. Keeps the pick consistent within a
 * day (so the prompt does not flip on re-render) while still cycling daily.
 */
function fnv1a(input) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function recencyWeight(eventOccurredAt, now) {
  const date = toDate(eventOccurredAt);
  if (!date) return 0.2;
  const days = Math.max(0, (now.getTime() - date.getTime()) / MS_PER_DAY);
  return 1 / (1 + days / 14);
}

/**
 * Pick today's question from the pool using a recency-weighted, date-seeded
 * draw. Filters out IDs in `recentlyShownIds` so the same question does not
 * repeat back-to-back. Returns null on empty pool.
 */
export function pickTodaysOracleQuestion(pool, recentlyShownIds, dateSeed, { now = new Date() } = {}) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const blocked = new Set(Array.isArray(recentlyShownIds) ? recentlyShownIds : []);
  const candidates = pool.filter((p) => !blocked.has(p.id));
  // If everything's been shown recently, allow the rolling window to recycle.
  const usable = candidates.length > 0 ? candidates : pool;

  const weights = usable.map((p) => recencyWeight(p.eventOccurredAt, now));
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return usable[0];

  const seedStr = String(dateSeed || todayUtcDateString(now));
  const rng = seededRandom(fnv1a(seedStr));
  const target = rng() * totalWeight;

  let acc = 0;
  for (let i = 0; i < usable.length; i += 1) {
    acc += weights[i];
    if (acc >= target) return usable[i];
  }
  return usable[usable.length - 1];
}

export function todayUtcDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Read userSettings doc for the current user, returning the first match or
 * null. The collection follows the per-user doc-list pattern used elsewhere
 * (Profile.jsx) — there may be 0..N docs; we use the first.
 */
export async function readUserSettings() {
  try {
    const docs = await readUserData(COLLECTIONS.USER_SETTINGS);
    return Array.isArray(docs) && docs.length > 0 ? docs[0] : null;
  } catch {
    return null;
  }
}

/**
 * Commit today's daily prompt: writes the prompt ID and today's UTC date as
 * the new "current" pair, clears any prior answered timestamp, and appends
 * the ID to the rolling rotation history. Called ONCE per day when a new
 * pick is selected — not on every page load.
 *
 * Best-effort — failures are swallowed so the UI never blocks.
 */
export async function assignDailyPrompt({ promptId, today, settings: existingSettings } = {}) {
  if (!promptId || !today) return;
  try {
    const settings = existingSettings || (await readUserSettings());
    const history = Array.isArray(settings?.[USER_SETTINGS_FIELDS.RECENTLY_SHOWN_DAILY_PROMPT_IDS])
      ? settings[USER_SETTINGS_FIELDS.RECENTLY_SHOWN_DAILY_PROMPT_IDS]
      : [];
    const nextHistory = history[history.length - 1] === promptId
      ? history
      : [...history.filter((id) => id !== promptId), promptId].slice(-RECENT_SHOWN_CAP);

    const payload = {
      [USER_SETTINGS_FIELDS.DAILY_PROMPT_CURRENT_ID]: promptId,
      [USER_SETTINGS_FIELDS.DAILY_PROMPT_CURRENT_DATE]: today,
      [USER_SETTINGS_FIELDS.DAILY_PROMPT_ANSWERED_AT]: null,
      [USER_SETTINGS_FIELDS.RECENTLY_SHOWN_DAILY_PROMPT_IDS]: nextHistory,
    };
    if (settings?.id) {
      await updateData(COLLECTIONS.USER_SETTINGS, settings.id, payload);
    } else {
      await writeData(COLLECTIONS.USER_SETTINGS, payload);
    }
  } catch {
    // intentional: never let this block the UI
  }
}

/**
 * Mark today's daily prompt as answered. DailyPrompt then hides itself for
 * the rest of the day; the next day's mount will roll a new pick.
 *
 * Best-effort — failures are swallowed.
 */
export async function markDailyPromptAnswered(existingSettings) {
  try {
    const settings = existingSettings || (await readUserSettings());
    const payload = {
      [USER_SETTINGS_FIELDS.DAILY_PROMPT_ANSWERED_AT]: new Date().toISOString(),
    };
    if (settings?.id) {
      await updateData(COLLECTIONS.USER_SETTINGS, settings.id, payload);
    } else {
      await writeData(COLLECTIONS.USER_SETTINGS, payload);
    }
  } catch {
    // intentional: never let this block the UI
  }
}

/**
 * Format a relative date label for display.
 *   today, yesterday, N days ago, on Mon DD (≥14 days)
 */
export function formatRelativeDate(eventOccurredAt, now = new Date()) {
  const date = toDate(eventOccurredAt);
  if (!date) return '';
  const startOfDay = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((startOfDay(now) - startOfDay(date)) / MS_PER_DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  return `on ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}
