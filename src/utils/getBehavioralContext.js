/**
 * getBehavioralContext — cross-module behavioral snapshot for Oracle context injection
 *
 * Queries Firestore for recent behavioral data across Kill List, Relapse Radar,
 * Hard Lessons, Black Mirror, and Journaling. Returns a structured snapshot
 * that Oracle can use to ground feedback in the user's actual patterns.
 *
 * Cached for 5 minutes per userId. Never hallucinate — empty fields returned
 * as null rather than invented values.
 *
 * @param {string} userId
 * @returns {Promise<BehavioralContext>}
 */
import { getAuth } from 'firebase/auth';
import { readUserData } from './firebaseUtils.js';
import logger from './logger.js';
import {
  COLLECTIONS,
  RELAPSE_FIELDS,
  KILL_TARGET_FIELDS,
  HARD_LESSON_FIELDS,
  BLACK_MIRROR_FIELDS,
  USER_SETTINGS_FIELDS,
} from './schema.js';
import { resolveArchetypeLabel } from './relapseTaxonomy.js';

const contextCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const now = () => Date.now();

const getTimestamp = (entry) =>
  entry?.createdAt?.toDate?.()?.getTime() ?? entry?.timestamp ?? 0;

export async function getBehavioralContext(userId) {
  if (!userId) return buildEmpty();

  const cacheKey = `behavioral_ctx_${userId}`;
  const cached = contextCache.get(cacheKey);
  if (cached && now() - cached.at < CACHE_TTL) return cached.value;

  try {
    // Finding 6 remediation: per-collection errors are logged (not silently
    // swallowed) and tracked in `missingCollections` so downstream consumers
    // can detect partial context and warn the user or retry.
    const missingCollections = [];
    const loadCollection = (name) =>
      readUserData(name).catch((err) => {
        logger.warn('behavioral context fetch failed', { collection: name, err: err?.message });
        missingCollections.push(name);
        return [];
      });

    const [killTargets, relapseEntries, hardLessons, blackMirrorEntries, journalEntries, userSettings] = await Promise.all([
      loadCollection(COLLECTIONS.KILL_TARGETS),
      loadCollection(COLLECTIONS.RELAPSE_ENTRIES),
      loadCollection(COLLECTIONS.HARD_LESSONS),
      loadCollection(COLLECTIONS.BLACK_MIRROR_ENTRIES),
      loadCollection(COLLECTIONS.JOURNAL_ENTRIES),
      loadCollection(COLLECTIONS.USER_SETTINGS),
    ]);

    // BER-137: identity direction from user settings
    const identityDirection = (userSettings || [])[0]?.[USER_SETTINGS_FIELDS.IDENTITY_DIRECTION] || null;

    const windowMs14 = 14 * 24 * 60 * 60 * 1000;
    const windowMs7 = 7 * 24 * 60 * 60 * 1000;
    const ts = now();

    // --- Kill List ---
    const activeKillTargets = (killTargets || [])
      .filter(t => t[KILL_TARGET_FIELDS.STATUS] === 'active')
      .map(t => {
        const escapes = t[KILL_TARGET_FIELDS.ESCAPES] || [];
        const lastAutopsy = escapes.length
          ? escapes[escapes.length - 1].date || null
          : null;
        return {
          title: t[KILL_TARGET_FIELDS.TITLE] || '',
          streak: t[KILL_TARGET_FIELDS.STREAK] || 0,
          escapeCount: escapes.length,
          lastAutopsy,
        };
      });

    // --- Relapse Radar ---
    const recentRelapses = (relapseEntries || []).filter(
      e => ts - getTimestamp(e) < windowMs14
    );
    const recentRelapseCount = recentRelapses.length;

    const archetypeCounts = {};
    recentRelapses.forEach(e => {
      const archetype = e[RELAPSE_FIELDS.ARCHETYPE];
      if (archetype) archetypeCounts[archetype] = (archetypeCounts[archetype] || 0) + 1;
    });
    // UXR-002 Spec 4: pass the behavioral-descriptor label to Oracle prompts,
    // not the identity-noun ID. Storage keeps the ID; the wire-format to the
    // LLM carries the behavioral phrasing.
    const dominantArchetypeId = Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const dominantRelapseArchetype = dominantArchetypeId
      ? resolveArchetypeLabel(dominantArchetypeId)
      : null;

    // --- Hard Lessons: violated rules ---
    const violatedHardLessons = (hardLessons || [])
      .filter(l => l[HARD_LESSON_FIELDS.IS_VIOLATION] && l[HARD_LESSON_FIELDS.RULE])
      .map(l => ({
        rule: l[HARD_LESSON_FIELDS.RULE],
        violatedApprox: l.createdAt?.toDate?.()?.toISOString?.() ?? l.timestamp
          ? new Date(l.timestamp).toISOString()
          : null,
      }));

    // --- Black Mirror: trend ---
    let blackMirrorTrend = null;
    if ((blackMirrorEntries || []).length >= 4) {
      const sorted = [...blackMirrorEntries].sort((a, b) => getTimestamp(b) - getTimestamp(a));
      const recent = sorted.slice(0, 2).map(e => e[BLACK_MIRROR_FIELDS.INDEX] || 0);
      const older = sorted.slice(2, 4).map(e => e[BLACK_MIRROR_FIELDS.INDEX] || 0);
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
      if (recentAvg < olderAvg * 0.85) blackMirrorTrend = 'improving';
      else if (recentAvg > olderAvg * 1.15) blackMirrorTrend = 'deteriorating';
      else blackMirrorTrend = 'stable';
    }

    // --- Journaling: dominant language pattern last 7 days ---
    // Mood labels were retired (Spec 3, UXR-002). Language is the signal.
    // Pull the top 3 substantive words across recent entries. Lightweight,
    // not instrumented for subtlety — Oracle can ignore if low-value.
    const recentJournals = (journalEntries || []).filter(
      e => ts - getTimestamp(e) < windowMs7
    );
    const journalLanguagePattern = deriveLanguagePattern(recentJournals);

    // BER-167: behavioral record density for Oracle trust calibration
    const totalEntryCount =
      (journalEntries || []).length +
      (killTargets || []).length +
      (relapseEntries || []).length +
      (hardLessons || []).length;

    const value = {
      activeKillTargets,
      dominantRelapseArchetype,
      recentRelapseCount,
      blackMirrorTrend,
      violatedHardLessons,
      journalLanguagePattern,
      identityDirection, // BER-137
      totalEntryCount,   // BER-167
      missingCollections, // Finding 6: surface partial-load state to consumers
    };

    contextCache.set(cacheKey, { at: now(), value });
    return value;
  } catch (err) {
    logger.warn('behavioral context build failed', err?.message);
    return buildEmpty();
  }
}

function buildEmpty() {
  return {
    activeKillTargets: [],
    dominantRelapseArchetype: null,
    recentRelapseCount: 0,
    blackMirrorTrend: null,
    violatedHardLessons: [],
    journalLanguagePattern: null,
    identityDirection: null,
    totalEntryCount: 0, // BER-167
    missingCollections: [], // Finding 6
  };
}

// Stop-word list kept tight — we want substantive signal words, not filler.
const LANGUAGE_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'to', 'of', 'in', 'for', 'is', 'it',
  'that', 'this', 'with', 'on', 'as', 'at', 'be', 'are', 'was', 'were', 'am',
  'i', 'you', 'me', 'my', 'your', 'we', 'us', 'our', 'they', 'them', 'their',
  'he', 'she', 'him', 'her', 'his', 'so', 'if', 'then', 'than', 'just', 'not',
  'no', 'yes', 'do', 'did', 'done', 'have', 'has', 'had', 'will', 'would',
  'could', 'should', 'can', 'event', 'attribution', // frame markers from composeJournalContent
]);

function deriveLanguagePattern(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const counts = new Map();
  entries.forEach((e) => {
    const text = String(e?.content || '').toLowerCase();
    if (!text) return;
    text
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length > 3 && !LANGUAGE_STOP_WORDS.has(w))
      .forEach((w) => counts.set(w, (counts.get(w) || 0) + 1));
  });
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([, n]) => n >= 2) // require repetition across entries
    .map(([w]) => w);
  return top.length > 0 ? top.join(', ') : null;
}

/** Invalidate cache for a user (call after data mutations if needed) */
export function clearBehavioralContextCache(userId) {
  if (userId) contextCache.delete(`behavioral_ctx_${userId}`);
}

/**
 * BER-197: Read totalEntryCount from cache without triggering a fetch.
 * Returns null when cache is cold. Call after generateAIFeedback() — it warms
 * the cache, so this is always a synchronous O(1) hit in that context.
 */
export function getCachedTotalEntryCount() {
  try {
    const uid = getAuth().currentUser?.uid;
    if (!uid) return null;
    const cached = contextCache.get(`behavioral_ctx_${uid}`);
    if (!cached || now() - cached.at >= CACHE_TTL) return null;
    return typeof cached.value.totalEntryCount === 'number' ? cached.value.totalEntryCount : null;
  } catch {
    return null;
  }
}
