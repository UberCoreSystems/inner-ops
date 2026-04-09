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
import { readUserData } from './firebaseUtils';

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
    const [killTargets, relapseEntries, hardLessons, blackMirrorEntries, journalEntries] = await Promise.all([
      readUserData('killTargets').catch(() => []),
      readUserData('relapseEntries').catch(() => []),
      readUserData('hardLessons').catch(() => []),
      readUserData('blackMirrorEntries').catch(() => []),
      readUserData('journalEntries').catch(() => []),
    ]);

    const windowMs14 = 14 * 24 * 60 * 60 * 1000;
    const windowMs7 = 7 * 24 * 60 * 60 * 1000;
    const ts = now();

    // --- Kill List ---
    const activeKillTargets = (killTargets || [])
      .filter(t => t.status === 'active')
      .map(t => {
        const escapes = t.escapeData || [];
        const lastAutopsy = escapes.length
          ? escapes[escapes.length - 1].date || null
          : null;
        return {
          title: t.title || '',
          streak: t.streak || 0,
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
      if (e.selectedSelf) archetypeCounts[e.selectedSelf] = (archetypeCounts[e.selectedSelf] || 0) + 1;
    });
    const dominantRelapseArchetype = Object.entries(archetypeCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // --- Hard Lessons: violated rules ---
    const violatedHardLessons = (hardLessons || [])
      .filter(l => l.isRuleViolation && l.ruleGoingForward)
      .map(l => ({
        rule: l.ruleGoingForward,
        violatedApprox: l.createdAt?.toDate?.()?.toISOString?.() ?? l.timestamp
          ? new Date(l.timestamp).toISOString()
          : null,
      }));

    // --- Black Mirror: trend ---
    let blackMirrorTrend = null;
    if ((blackMirrorEntries || []).length >= 4) {
      const sorted = [...blackMirrorEntries].sort((a, b) => getTimestamp(b) - getTimestamp(a));
      const recent = sorted.slice(0, 2).map(e => e.phonePickups || e.screenTime || 0);
      const older = sorted.slice(2, 4).map(e => e.phonePickups || e.screenTime || 0);
      const recentAvg = recent.reduce((s, v) => s + v, 0) / recent.length;
      const olderAvg = older.reduce((s, v) => s + v, 0) / older.length;
      if (recentAvg < olderAvg * 0.85) blackMirrorTrend = 'improving';
      else if (recentAvg > olderAvg * 1.15) blackMirrorTrend = 'deteriorating';
      else blackMirrorTrend = 'stable';
    }

    // --- Journaling: dominant mood last 7 days ---
    const recentJournals = (journalEntries || []).filter(
      e => ts - getTimestamp(e) < windowMs7
    );
    const moodCounts = {};
    recentJournals.forEach(e => {
      const mood = e.mood || e.selectedMood;
      if (mood) moodCounts[mood] = (moodCounts[mood] || 0) + 1;
    });
    const journalMoodPattern = Object.entries(moodCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const value = {
      activeKillTargets,
      dominantRelapseArchetype,
      recentRelapseCount,
      blackMirrorTrend,
      violatedHardLessons,
      journalMoodPattern,
    };

    contextCache.set(cacheKey, { at: now(), value });
    return value;
  } catch {
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
    journalMoodPattern: null,
  };
}

/** Invalidate cache for a user (call after data mutations if needed) */
export function clearBehavioralContextCache(userId) {
  if (userId) contextCache.delete(`behavioral_ctx_${userId}`);
}
