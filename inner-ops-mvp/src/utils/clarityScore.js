
// Memoization cache for expensive calculations
const calculationCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const clarityScoreUtils = {
  // Base scoring system - Much more conservative and progress-focused
  SCORING: {
    JOURNAL_ENTRY: 2,
    KILL_TARGET_ADDED: 1, // Very low - just for tracking
    KILL_TARGET_PROGRESS: 2, // per 10% progress - actual work matters
    KILL_TARGET_COMPLETED: 25, // Completion is what really counts
    COMPASS_CHECK: 5, // weekly bonus
    COMPASS_HIGH_SCORE: 3, // bonus for 8+ average
    RELAPSE_AWARENESS: 8, // bonus for self-awareness and honesty
    RELAPSE_REFLECTION: 5, // additional bonus for detailed reflection
    BLACK_MIRROR_CHECK: 5, // weekly bonus
    BLACK_MIRROR_LOW_INDEX: 3, // bonus for low index (<10)
  },

  // Calculate total clarity score from user data
  calculateClarityScore: async (userData) => {
    // Create cache key from user data hash
    const cacheKey = JSON.stringify({
      journalCount: userData.journalEntries?.length || 0,
      killCount: userData.killTargets?.length || 0,
      compassCount: userData.compassChecks?.length || 0,
      relapseCount: userData.relapseEntries?.length || 0,
      blackMirrorCount: userData.blackMirrorEntries?.length || 0,
      lastUpdate: Math.max(
        ...[userData.journalEntries, userData.killTargets, userData.compassChecks, userData.relapseEntries, userData.blackMirrorEntries]
          .filter(arr => arr && arr.length > 0)
          .map(arr => new Date(arr[0].createdAt).getTime())
      )
    });

    // Check cache first
    const cached = calculationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.result;
    }

    const { journalEntries = [], killTargets = [], compassChecks = [], relapseEntries = [], blackMirrorEntries = [] } = userData;
    
    let totalScore = 0;

    // Journal scoring - higher weight for consistency
    totalScore += journalEntries.length * clarityScoreUtils.SCORING.JOURNAL_ENTRY;
    
    // Streak bonus for journaling (consecutive days) - more conservative
    const journalStreak = clarityScoreUtils.calculateJournalStreak(journalEntries);
    if (journalStreak >= 7) totalScore += 15; // Weekly streak bonus
    if (journalStreak >= 30) totalScore += 40; // Monthly streak bonus
    if (journalStreak >= 90) totalScore += 75; // Quarterly streak bonus

    // Kill List scoring with completion rate multiplier
    let killListScore = 0;
    let completedTargets = 0;
    
    killTargets.forEach(target => {
      killListScore += clarityScoreUtils.SCORING.KILL_TARGET_ADDED;
      
      const progress = target.progress || 0;
      killListScore += Math.floor(progress / 10) * clarityScoreUtils.SCORING.KILL_TARGET_PROGRESS;
      
      if (progress === 100) {
        killListScore += clarityScoreUtils.SCORING.KILL_TARGET_COMPLETED;
        completedTargets++;
      }
    });
    
    // Apply completion rate multiplier to prevent gaming the system
    const completionRate = killTargets.length > 0 ? completedTargets / killTargets.length : 0;
    let completionMultiplier = 1;
    
    if (completionRate >= 0.8) completionMultiplier = 1.5; // 80%+ completion rate bonus
    else if (completionRate >= 0.6) completionMultiplier = 1.2; // 60%+ completion rate bonus
    else if (completionRate >= 0.4) completionMultiplier = 1.0; // 40%+ completion rate normal
    else if (completionRate >= 0.2) completionMultiplier = 0.8; // 20%+ completion rate penalty
    else completionMultiplier = 0.5; // Under 20% completion rate heavy penalty
    
    killListScore = Math.floor(killListScore * completionMultiplier);
    totalScore += killListScore;

    // Compass Check scoring (weekly bonus system)
    const weeklyCompassBonuses = clarityScoreUtils.calculateWeeklyCompassBonuses(compassChecks);
    totalScore += weeklyCompassBonuses;

    // Black Mirror scoring (weekly bonus system)
    const weeklyBlackMirrorBonuses = clarityScoreUtils.calculateWeeklyBlackMirrorBonuses(blackMirrorEntries);
    totalScore += weeklyBlackMirrorBonuses;

    // Relapse Radar scoring - reward self-awareness
    let relapseAwarenessBonus = 0;
    relapseEntries.forEach(entry => {
      // Base bonus for self-awareness and honesty
      relapseAwarenessBonus += clarityScoreUtils.SCORING.RELAPSE_AWARENESS;
      
      // Additional bonus for detailed reflection
      if (entry.reflection && entry.reflection.length > 100) {
        relapseAwarenessBonus += clarityScoreUtils.SCORING.RELAPSE_REFLECTION;
      }
    });
    totalScore += relapseAwarenessBonus;

    const result = {
      totalScore: Math.floor(totalScore),
      journalStreak,
      killTargetsCompleted: killTargets.filter(t => t.progress === 100).length,
      weeklyCompassChecks: Math.floor(compassChecks.length / 7),
      weeklyBlackMirrorChecks: Math.floor(blackMirrorEntries.length / 7),
      relapseAwarenessEntries: relapseEntries.length,
      breakdown: {
        journal: journalEntries.length * clarityScoreUtils.SCORING.JOURNAL_ENTRY,
        killList: killListScore,
        compass: weeklyCompassBonuses,
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

  // Calculate compass check weekly bonuses
  calculateWeeklyCompassBonuses: (compassChecks) => {
    let totalBonus = 0;
    const weeksWithChecks = new Set();
    
    compassChecks.forEach(check => {
      const checkDate = new Date(check.createdAt);
      const weekKey = `${checkDate.getFullYear()}-${Math.floor(checkDate.getTime() / (7 * 24 * 60 * 60 * 1000))}`;
      
      if (!weeksWithChecks.has(weekKey)) {
        weeksWithChecks.add(weekKey);
        totalBonus += clarityScoreUtils.SCORING.COMPASS_CHECK;
        
        // Bonus for high scores (8+ average)
        if (check.overallScore >= 8) {
          totalBonus += clarityScoreUtils.SCORING.COMPASS_HIGH_SCORE;
        }
      }
    });
    
    return totalBonus;
  },

  // Calculate black mirror check weekly bonuses
  calculateWeeklyBlackMirrorBonuses: (blackMirrorEntries) => {
    let totalBonus = 0;
    const weeksWithChecks = new Set();
    
    blackMirrorEntries.forEach(entry => {
      const checkDate = new Date(entry.createdAt);
      const weekKey = `${checkDate.getFullYear()}-${Math.floor(checkDate.getTime() / (7 * 24 * 60 * 60 * 1000))}`;
      
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
  getClarityRank: (score) => {
    if (score >= 1000) return { rank: 'Clarity Master', icon: '👑', color: 'text-yellow-400' }; // Years of consistent practice
    if (score >= 750) return { rank: 'Clarity Expert', icon: '🏆', color: 'text-purple-400' }; // 6+ months of solid progress
    if (score >= 500) return { rank: 'Clarity Seeker', icon: '🔮', color: 'text-red-400' }; // 3-6 months of practice
    if (score >= 300) return { rank: 'Clarity Practitioner', icon: '🧭', color: 'text-blue-400' }; // 2-3 months of practice
    if (score >= 150) return { rank: 'Clarity Student', icon: '⚡', color: 'text-green-400' }; // 1-2 months of practice
    if (score >= 75) return { rank: 'Clarity Apprentice', icon: '💪', color: 'text-orange-400' }; // 2-4 weeks of practice
    if (score >= 25) return { rank: 'Clarity Beginner', icon: '🎯', color: 'text-gray-400' }; // 1-2 weeks of practice
    return { rank: 'Clarity Novice', icon: '🌱', color: 'text-gray-500' }; // Just starting
  }
};
