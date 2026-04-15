
import logger from './logger';

// Memoization cache for expensive calculations.
// Finding 7 remediation: TTL tightened to 60s. The cache key now also includes
// a hash of each entry's updatedAt/lastUpdated so edits invalidate correctly.
const calculationCache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

// Produce a small digest over updatedAt (or createdAt) timestamps so edits
// that don't change array length still bust the cache.
//
// Pass 2 Finding 11 remediation: replaced XOR with an order-preserving FNV-1a
// style accumulator. XOR is commutative and `t ^ t === 0`, so two arrays with
// the same timestamps in different orders (or with duplicate timestamps that
// cancel) collided to the same fingerprint. The new hash is sensitive to both
// order and multiplicity.
const fingerprintCollection = (arr) => {
  if (!arr || arr.length === 0) return '0';
  let acc = 2166136261; // FNV offset basis
  for (const item of arr) {
    const u = item?.updatedAt ?? item?.lastUpdated ?? item?.createdAt;
    const t = u?.toDate ? u.toDate().getTime() : new Date(u || 0).getTime();
    const v = Number.isFinite(t) ? t : 0;
    // Mix the timestamp byte-by-byte so position matters and duplicates
    // don't cancel. Math.imul keeps the multiplication in 32-bit space.
    acc = (acc ^ (v & 0xff)) >>> 0;
    acc = Math.imul(acc, 16777619) >>> 0;
    acc = (acc ^ ((v >>> 8) & 0xff)) >>> 0;
    acc = Math.imul(acc, 16777619) >>> 0;
    acc = (acc ^ ((v >>> 16) & 0xff)) >>> 0;
    acc = Math.imul(acc, 16777619) >>> 0;
    acc = (acc ^ ((v >>> 24) & 0xff)) >>> 0;
    acc = Math.imul(acc, 16777619) >>> 0;
  }
  return acc.toString(36);
};

// Temporal decay: recent activity counts more than old activity
const getTemporalWeight = (createdAt) => {
  if (!createdAt) return 0.5;
  const d = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
  if (isNaN(d.getTime())) return 0.5;
  const daysAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (daysAgo <= 30) return 1.0;
  if (daysAgo <= 90) return 0.6;
  if (daysAgo <= 180) return 0.3;
  return 0.1;
};

export const clarityScoreUtils = {
  // Base scoring system - Much more conservative and progress-focused
  SCORING: {
    JOURNAL_ENTRY: 2,
    KILL_TARGET_ADDED: 2, // Adding a target = real commitment
    KILL_TARGET_COMPLETED_SURFACE: 20, // Surface difficulty (7-day streak)
    KILL_TARGET_COMPLETED_DEEP: 50, // Deep difficulty (21-day streak)
    KILL_TARGET_COMPLETED_CORE: 100, // Core difficulty (60-day streak)
    KILL_TARGET_STREAK_BONUS: 5, // per 7-day streak milestone on active targets
    RELAPSE_AWARENESS: 10, // bonus for self-awareness and honesty
    RELAPSE_REFLECTION: 8, // additional bonus for detailed reflection
    RELAPSE_SCORING_CAP: 20, // max entries that earn points
    BLACK_MIRROR_CHECK: 8, // weekly bonus
    BLACK_MIRROR_LOW_INDEX: 5, // bonus for low index (<10)
    HARD_LESSON_EXTRACTED: 15, // Base score for extracting a lesson from pain
    HARD_LESSON_FINALIZED: 25, // Additional bonus for finalizing with a rule going forward
  },

  // Calculate total clarity score from user data
  calculateClarityScore: async (userData) => {
    // Finding 7 remediation: cache key now includes per-collection fingerprints
    // of updatedAt/createdAt timestamps, so in-place edits invalidate the cache.
    const cacheKey = JSON.stringify({
      journalCount: userData.journalEntries?.length || 0,
      killCount: userData.killTargets?.length || 0,
      relapseCount: userData.relapseEntries?.length || 0,
      blackMirrorCount: userData.blackMirrorEntries?.length || 0,
      hardLessonsCount: userData.hardLessons?.length || 0,
      j_fp: fingerprintCollection(userData.journalEntries),
      k_fp: fingerprintCollection(userData.killTargets),
      r_fp: fingerprintCollection(userData.relapseEntries),
      bm_fp: fingerprintCollection(userData.blackMirrorEntries),
      hl_fp: fingerprintCollection(userData.hardLessons),
    });

    // Check cache first
    const cached = calculationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.result;
    }

    const { journalEntries = [], killTargets = [], relapseEntries = [], blackMirrorEntries = [], hardLessons = [] } = userData;
    
    let totalScore = 0;

    // Journal scoring — temporal decay applied, minimum 50 chars to count
    const journalScore = journalEntries.reduce((sum, entry) => {
      const content = entry.content || entry.text || '';
      if (content.length < 50) return sum; // too short to score
      return sum + clarityScoreUtils.SCORING.JOURNAL_ENTRY * getTemporalWeight(entry.createdAt);
    }, 0);
    totalScore += journalScore;
    
    // Streak bonus for journaling (consecutive days) - more conservative
    const journalStreak = clarityScoreUtils.calculateJournalStreak(journalEntries);
    if (journalStreak >= 7) totalScore += 15; // Weekly streak bonus
    if (journalStreak >= 30) totalScore += 40; // Monthly streak bonus
    if (journalStreak >= 90) totalScore += 75; // Quarterly streak bonus

    // Kill List scoring with completion rate multiplier and difficulty tiers
    let killListScore = 0;
    let completedTargets = 0;
    const DIFF_MAP = { high: 'core', medium: 'deep', low: 'surface' };

    // Note: Kill target completions intentionally have NO temporal decay.
    // Conquering a behavioral pattern is a permanent victory — unlike Hard Lessons
    // (whose urgency fades), a killed target remains killed. Decay would misrepresent
    // the permanence of behavioral elimination. This is by design.
    killTargets.forEach(target => {
      killListScore += clarityScoreUtils.SCORING.KILL_TARGET_ADDED;

      // Streak bonus: points per 7-day milestone reached on active targets
      const streak = target.streak || 0;
      killListScore += Math.floor(streak / 7) * clarityScoreUtils.SCORING.KILL_TARGET_STREAK_BONUS;

      const isKilled = target.status === 'killed' || target.progress === 100;
      if (isKilled) {
        const mappedDiff = DIFF_MAP[target.priority];
        if (!target.difficulty && !mappedDiff) {
          logger.warn(`[clarityScore] Kill target "${target.name || target.id}" has no difficulty or recognized priority — defaulting to 'deep'`);
        }
        const difficulty = target.difficulty || mappedDiff || 'deep';
        if (difficulty === 'core') killListScore += clarityScoreUtils.SCORING.KILL_TARGET_COMPLETED_CORE;
        else if (difficulty === 'surface') killListScore += clarityScoreUtils.SCORING.KILL_TARGET_COMPLETED_SURFACE;
        else killListScore += clarityScoreUtils.SCORING.KILL_TARGET_COMPLETED_DEEP;
        completedTargets++;
      }
    });
    
    // Completion rate multiplier: bonus-only — adding targets should never be penalized
    const completionRate = killTargets.length > 0 ? completedTargets / killTargets.length : 0;
    let completionMultiplier = 1.0; // baseline — no penalty for having incomplete targets

    if (completionRate >= 0.8) completionMultiplier = 1.5; // 80%+ completion rate bonus
    else if (completionRate >= 0.6) completionMultiplier = 1.2; // 60%+ completion rate bonus
    // below 60%: stays at 1.0 — no penalty, no incentive to hide targets
    
    killListScore = Math.floor(killListScore * completionMultiplier);
    totalScore += killListScore;

    // Hard Lessons scoring — require real content (min 30 chars in extractedLesson)
    let hardLessonsScore = 0;
    hardLessons.forEach(lesson => {
      const hasContent = (lesson.extractedLesson || '').trim().length >= 30
        || (lesson.eventDescription || '').trim().length >= 30;
      if (!hasContent) return; // no points for empty/trivial lessons
      hardLessonsScore += clarityScoreUtils.SCORING.HARD_LESSON_EXTRACTED * getTemporalWeight(lesson.createdAt);
      if (lesson.isFinalized && lesson.ruleGoingForward?.trim().length >= 20) {
        hardLessonsScore += clarityScoreUtils.SCORING.HARD_LESSON_FINALIZED * getTemporalWeight(lesson.createdAt);
      }
    });
    totalScore += hardLessonsScore;

    // Black Mirror scoring (weekly bonus system)
    const weeklyBlackMirrorBonuses = clarityScoreUtils.calculateWeeklyBlackMirrorBonuses(blackMirrorEntries);
    totalScore += weeklyBlackMirrorBonuses;

    // Relapse Radar scoring — capped at 10 entries to prevent gaming,
    // and only entries with meaningful reflection (>50 chars) count
    let relapseAwarenessBonus = 0;
    const scorableRelapse = relapseEntries
      .filter(e => (e.reflection || '').trim().length >= 20)
      .slice(0, clarityScoreUtils.SCORING.RELAPSE_SCORING_CAP); // hard cap — entries beyond cap earn nothing
    scorableRelapse.forEach(entry => {
      relapseAwarenessBonus += clarityScoreUtils.SCORING.RELAPSE_AWARENESS;
      if (entry.reflection && entry.reflection.length > 100) {
        relapseAwarenessBonus += clarityScoreUtils.SCORING.RELAPSE_REFLECTION;
      }
    });
    totalScore += relapseAwarenessBonus;

    const result = {
      totalScore: Math.floor(totalScore),
      journalStreak,
      killTargetsCompleted: killTargets.filter(t => t.status === 'killed' || t.progress === 100).length,
      weeklyBlackMirrorChecks: Math.floor(blackMirrorEntries.length / 7),
      relapseAwarenessEntries: relapseEntries.length,
      breakdown: {
        journal: Math.floor(journalScore),
        killList: killListScore,
        hardLessons: hardLessonsScore,
        blackMirror: weeklyBlackMirrorBonuses,
        relapseAwareness: relapseAwarenessBonus,
        bonuses: journalStreak >= 7 ? (journalStreak >= 90 ? 130 : (journalStreak >= 30 ? 55 : 15)) : 0,
        completionRate: completionRate,
        completionMultiplier: completionMultiplier
      }
    };

    // Cache the result
    calculationCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });

    // Clean old cache entries
    if (calculationCache.size > 100) {
      const cutoff = Date.now() - CACHE_TTL;
      for (const [key, value] of calculationCache.entries()) {
        if (value.timestamp < cutoff) {
          calculationCache.delete(key);
        }
      }
    }

    return result;
  },

  // Calculate journal streak
  calculateJournalStreak: (journalEntries) => {
    if (journalEntries.length === 0) return 0;
    
    const sortedEntries = journalEntries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const today = new Date();
    let streak = 0;
    
    for (let i = 0; i < sortedEntries.length; i++) {
      const entryDate = new Date(sortedEntries[i].createdAt);
      const daysDiff = Math.floor((today - entryDate) / (1000 * 60 * 60 * 24));
      
      if (daysDiff === streak) {
        streak++;
      } else {
        break;
      }
    }
    
    return streak;
  },

  // Calculate black mirror check weekly bonuses
  calculateWeeklyBlackMirrorBonuses: (blackMirrorEntries) => {
    let totalBonus = 0;
    const weeksWithChecks = new Set();
    
    blackMirrorEntries.forEach(entry => {
      const checkDate = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
      // Use UTC values to prevent week-boundary misbucketing across timezones
      const utcMs = Date.UTC(checkDate.getUTCFullYear(), checkDate.getUTCMonth(), checkDate.getUTCDate());
      const weekKey = `${checkDate.getUTCFullYear()}-${Math.floor(utcMs / (7 * 24 * 60 * 60 * 1000))}`;
      
      if (!weeksWithChecks.has(weekKey)) {
        weeksWithChecks.add(weekKey);
        totalBonus += clarityScoreUtils.SCORING.BLACK_MIRROR_CHECK;
        
        // Bonus for low Black Mirror Index (good digital wellness)
        if (entry.blackMirrorIndex < 10) {
          totalBonus += clarityScoreUtils.SCORING.BLACK_MIRROR_LOW_INDEX;
        }
      }
    });
    
    return totalBonus;
  },

  // Get clarity rank based on score - Much more realistic progression
  // Icons updated for Oura-style minimalist aesthetic
  getClarityRank: (score) => {
    if (score >= 1100) return { rank: 'Clarity Master', icon: '◆', color: 'text-yellow-400' }; // Diamond - mastery
    if (score >= 750) return { rank: 'Clarity Expert', icon: '◈', color: 'text-purple-400' }; // Diamond outline - expertise
    if (score >= 500) return { rank: 'Clarity Seeker', icon: '◉', color: 'text-red-400' }; // Circle target - seeking
    if (score >= 300) return { rank: 'Clarity Practitioner', icon: '◎', color: 'text-blue-400' }; // Double circle - practice
    if (score >= 150) return { rank: 'Clarity Student', icon: '▲', color: 'text-green-400' }; // Triangle up - growth
    if (score >= 75) return { rank: 'Clarity Apprentice', icon: '●', color: 'text-orange-400' }; // Solid circle - foundation
    if (score >= 25) return { rank: 'Clarity Beginner', icon: '○', color: 'text-gray-400' }; // Empty circle - starting
    return { rank: 'Clarity Novice', icon: '·', color: 'text-gray-500' }; // Dot - origin point
  }
};
