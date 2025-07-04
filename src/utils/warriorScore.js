
export const clarityScoreUtils = {
  // Base scoring system
  SCORING: {
    JOURNAL_ENTRY: 10,
    KILL_TARGET_ADDED: 15,
    KILL_TARGET_PROGRESS: 1, // per 10% progress
    KILL_TARGET_COMPLETED: 50,
    COMPASS_CHECK: 25, // weekly bonus
    COMPASS_HIGH_SCORE: 10, // bonus for 8+ average
    RELAPSE_AWARENESS: 30, // bonus for self-awareness and honesty
    RELAPSE_REFLECTION: 20, // additional bonus for detailed reflection
  },

  // Calculate total clarity score from user data
  calculateClarityScore: async (userData) => {
    const { journalEntries = [], killTargets = [], compassChecks = [], relapseEntries = [] } = userData;
    
    let totalScore = 0;

    // Journal scoring - higher weight for consistency
    totalScore += journalEntries.length * clarityScoreUtils.SCORING.JOURNAL_ENTRY;
    
    // Streak bonus for journaling (consecutive days)
    const journalStreak = clarityScoreUtils.calculateJournalStreak(journalEntries);
    if (journalStreak >= 7) totalScore += 50; // Weekly streak bonus
    if (journalStreak >= 30) totalScore += 200; // Monthly streak bonus

    // Kill List scoring
    killTargets.forEach(target => {
      totalScore += clarityScoreUtils.SCORING.KILL_TARGET_ADDED;
      
      const progress = target.progress || 0;
      totalScore += Math.floor(progress / 10) * clarityScoreUtils.SCORING.KILL_TARGET_PROGRESS;
      
      if (progress === 100) {
        totalScore += clarityScoreUtils.SCORING.KILL_TARGET_COMPLETED;
      }
    });

    // Compass Check scoring (weekly bonus system)
    const weeklyCompassBonuses = clarityScoreUtils.calculateWeeklyCompassBonuses(compassChecks);
    totalScore += weeklyCompassBonuses;

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

    return {
      totalScore: Math.floor(totalScore),
      journalStreak,
      killTargetsCompleted: killTargets.filter(t => t.progress === 100).length,
      weeklyCompassChecks: Math.floor(compassChecks.length / 7),
      relapseAwarenessEntries: relapseEntries.length,
      breakdown: {
        journal: journalEntries.length * clarityScoreUtils.SCORING.JOURNAL_ENTRY,
        killList: killTargets.reduce((sum, t) => sum + clarityScoreUtils.SCORING.KILL_TARGET_ADDED + Math.floor((t.progress || 0) / 10) * clarityScoreUtils.SCORING.KILL_TARGET_PROGRESS + (t.progress === 100 ? clarityScoreUtils.SCORING.KILL_TARGET_COMPLETED : 0), 0),
        compass: weeklyCompassBonuses,
        relapseAwareness: relapseAwarenessBonus,
        bonuses: journalStreak >= 7 ? (journalStreak >= 30 ? 250 : 50) : 0
      }
    };
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

  // Get clarity rank based on score
  getClarityRank: (score) => {
    if (score >= 2000) return { rank: 'Clarity Master', icon: '👑', color: 'text-yellow-400' };
    if (score >= 1500) return { rank: 'Clarity Expert', icon: '🏆', color: 'text-purple-400' };
    if (score >= 1000) return { rank: 'Clarity Seeker', icon: '🔮', color: 'text-red-400' };
    if (score >= 750) return { rank: 'Clarity Practitioner', icon: '🧭', color: 'text-blue-400' };
    if (score >= 500) return { rank: 'Clarity Student', icon: '⚡', color: 'text-green-400' };
    if (score >= 250) return { rank: 'Clarity Apprentice', icon: '💪', color: 'text-orange-400' };
    if (score >= 100) return { rank: 'Clarity Beginner', icon: '🎯', color: 'text-gray-400' };
    return { rank: 'Clarity Novice', icon: '🌱', color: 'text-gray-500' };
  }
};
