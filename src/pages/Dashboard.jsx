
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { readUserData, writeData, debugInspectAllFirebaseData, previewDataMigration, executeDataMigration, findDuplicateDocuments, removeDuplicateDocuments } from '../utils/firebaseUtils';
import { migrateOldDataToFirestore, findOldData } from '../utils/dataMigration';
import { authService } from '../utils/authService';
import { aiUtils } from '../utils/aiUtils';
import { clarityScoreUtils } from '../utils/clarityScore';
import KillListDashboard from '../components/KillListDashboard';
import QuickJournalModal from '../components/QuickJournalModal';
import DailyPrompt from '../components/DailyPrompt';
import { CircularProgressRing, TripleRing, ScoreCard, InsightCard, ActivityItem } from '../components/OuraRing';
import { AppIcon } from '../components/AppIcons';
import { SkeletonDashboard } from '../components/SkeletonLoader';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { detectDriftSignals } from '../utils/detectDriftSignals';

const isDevEnvironment = import.meta.env.DEV;

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [quickJournalOpen, setQuickJournalOpen] = useState(false);
  const [stats, setStats] = useState({
    journalEntries: 0,
    relapseEntries: 0,
    streakDays: 0,
    killTargets: 0,
    hardLessons: 0
  });
  const [recentEntries, setRecentEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [aiActionSteps, setAiActionSteps] = useState([]);
  const [clarityScore, setClarityScore] = useState({
    totalScore: 0,
    rank: { rank: 'Clarity Novice', icon: '🌱', color: 'text-gray-500' },
    isFrozen: false,
    breakdown: {}
  });
  
  // Store raw data for deferred clarity score calculation
  const [rawUserData, setRawUserData] = useState(null);
  const [calculatingClarity, setCalculatingClarity] = useState(false);

  // Early warning signal
  const [earlyWarning, setEarlyWarning] = useState(null);

  // Drift signals from detectDriftSignals
  const [driftSignals, setDriftSignals] = useState([]);

  // Synthesis Briefing ready indicator
  const [latestSynthesisIsNew, setLatestSynthesisIsNew] = useState(false);

  // Sunday Autopsy
  const [autopsyText, setAutopsyText] = useState('');
  const [autopsySaving, setAutopsySaving] = useState(false);
  const autopsySessionKey = (() => {
    const today = new Date();
    const sunday = new Date(today);
    sunday.setDate(today.getDate() - today.getDay());
    return `autopsy_dismissed_${sunday.toISOString().split('T')[0]}`;
  })();
  const [autopsyDismissed, setAutopsyDismissed] = useState(
    () => sessionStorage.getItem(autopsySessionKey) === 'true'
  );

  // Collapsible section states
  const [killListExpanded, setKillListExpanded] = useState(true);
  const [insightsExpanded, setInsightsExpanded] = useState(true);

  // Sunday Autopsy — show on Sundays
  const isSunday = new Date().getDay() === 0;
  const showAutopsy = isSunday && !autopsyDismissed && !loading;

  // Monday Kill Report
  const [killReportDismissed, setKillReportDismissed] = useState(false);
  const isMonday = new Date().getDay() === 1;

  const submitAutopsy = async () => {
    if (!autopsyText.trim()) return;
    setAutopsySaving(true);
    try {
      await writeData('hardLessons', {
        eventCategory: '',
        eventDescription: autopsyText.trim(),
        myAssumption: '',
        signalIgnored: '',
        costs: [],
        costDescription: '',
        extractedLesson: '',
        ruleGoingForward: '',
        isFinalized: false,
        isScarStub: false,
        isWeeklyAutopsy: true,
        createdAt: new Date().toISOString(),
      });
      ouraToast.success('Week captured — expand the lesson when you\'re ready');
      setAutopsyText('');
      sessionStorage.setItem(autopsySessionKey, 'true');
      setAutopsyDismissed(true);
    } catch (error) {
      logger.error('Error saving weekly autopsy:', error);
      ouraToast.error('Failed to save');
    } finally {
      setAutopsySaving(false);
    }
  };

  // Delay showing skeleton to prevent flicker on fast loads
  useEffect(() => {
    const skeletonTimer = setTimeout(() => {
      if (loading) {
        setShowSkeleton(true);
      }
    }, 250); // Only show skeleton if loading takes > 250ms

    return () => clearTimeout(skeletonTimer);
  }, [loading]);

  // Keep skeleton mounted briefly to prevent blink when data finishes loading
  useEffect(() => {
    let dwellTimer;
    if (!loading && showSkeleton) {
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }
    return () => clearTimeout(dwellTimer);
  }, [loading, showSkeleton]);

  // Get current user from auth service and load data ONCE
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    logger.log("👤 Dashboard: Current user:", currentUser?.uid);
    
    if (currentUser) {
      loadDashboardData(currentUser);
      readUserData('syntheses').then(data => {
        const sorted = (data || []).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
        if (sorted[0]?.isNew === true) setLatestSynthesisIsNew(true);
      }).catch(() => {});
    } else {
      setLoading(false); // Stop loading if no user
    }

    if (!isDevEnvironment) {
      return;
    }

    // Add debugging function to window in development only
    window.debugDashboard = {
      reloadData: () => loadDashboardData(currentUser),
      checkAuth: () => ({
        currentUser: authService.getCurrentUser(),
        hasUser: !!authService.getCurrentUser(),
        userId: currentUser?.uid,
        email: currentUser?.email,
        isAnonymous: currentUser?.isAnonymous
      }),
      getStats: () => stats,
      getRecentEntries: () => recentEntries,
      getClarityScore: () => clarityScore,
      checkLocalStorage: () => {
        const lsData = {};
        const allKeys = Object.keys(localStorage);
        
        // Check all keys, not just the known ones
        allKeys.forEach(key => {
          if (key.includes('inner_ops') || key.includes('journal') || key.includes('kill') || key.includes('lesson') || key.includes('mirror') || key.includes('relapse')) {
            const data = localStorage.getItem(key);
            try {
              const parsed = JSON.parse(data);
              lsData[key] = {
                count: Array.isArray(parsed) ? parsed.length : typeof parsed,
                size: JSON.stringify(parsed).length,
                keys: Array.isArray(parsed) ? Object.keys(parsed[0] || {}) : Object.keys(parsed || {})
              };
            } catch (e) {
              lsData[key] = { raw: data.substring(0, 100) + '...' };
            }
          }
        });
        
        return {
          totalKeys: allKeys.length,
          relevantKeys: Object.keys(lsData),
          data: lsData,
          allKeys: allKeys
        };
      },
      showUserInfo: () => {
        const auth = currentUser;
        console.log('=== USER INFO ===');
        console.log('User ID:', auth?.uid);
        console.log('Email:', auth?.email);
        console.log('Display Name:', auth?.displayName);
        console.log('Is Anonymous:', auth?.isAnonymous);
        console.log('=== LOCALSTORAGE DATA ===');
        console.log(window.debugDashboard.checkLocalStorage());
        alert(`User ID: ${auth?.uid}\nEmail: ${auth?.email}\nOpen console for full details`);
      },
      inspectFirebase: async () => {
        console.log('🔍 Inspecting Firestore (ALL documents, no filters)...');
        const result = await debugInspectAllFirebaseData();
        console.log('=== COMPLETE FIRESTORE STRUCTURE ===');
        console.log('This shows ALL documents in each collection, grouped by userId');
        console.log(result);
        
        // Summary
        let totalDocs = 0;
        Object.values(result).forEach(collection => {
          if (collection.total) totalDocs += collection.total;
        });
        
        console.log('\n=== SUMMARY ===');
        console.log('Total documents across all collections:', totalDocs);
        console.log('Current user ID:', window.debugDashboard.checkAuth()?.userId);
        
        return result;
      },
      findOldData: async () => {
        console.log('🔍 Scanning for old localStorage data...');
        const result = await findOldData();
        console.log('=== OLD DATA FOUND ===');
        console.log(result);
        return result;
      },
      migrateData: async () => {
        console.log('📤 Starting data migration...');
        const result = await migrateOldDataToFirestore();
        console.log('=== MIGRATION RESULT ===');
        console.log(result);
        alert(`Migration complete!\n${JSON.stringify(result.summary, null, 2)}`);
        // Reload the page to refresh data
        setTimeout(() => window.location.reload(), 2000);
        return result;
      },
      previewMigration: async (sourceUserId) => {
        if (!sourceUserId) {
          console.error('❌ sourceUserId required. Usage: await window.debugDashboard.previewMigration("old-user-id")');
          console.log('Available userIds from latest inspection:');
          console.log('  consistent-test-user-2025 (28 journal, 12 kill targets)');
          console.log('  T8iUaMTFmcPcIjCaYF26gJg4lXu2 (4 journal, 2 kill targets, 1 relapse)');
          console.log('  0uJELSIt1uQdcLvR7Sh1tsbPMLE2 (3 journal)');
          console.log('  708R0rNyePVE5nAMLXZXudgVoMA3 (2 journal, 1 black mirror)');
          return;
        }
        const currentUserId = window.debugDashboard.checkAuth()?.userId;
        console.log(`\n🔍 PREVIEW: Migrating from "${sourceUserId}" to "${currentUserId}"`);
        const result = await previewDataMigration(sourceUserId, currentUserId);
        console.log('=== MIGRATION PREVIEW ===');
        console.log(result);
        console.log('\n⚠️ Review above. To execute migration, run:');
        console.log(`await window.debugDashboard.executeMigration("${sourceUserId}")`);
        return result;
      },
      executeMigration: async (sourceUserId) => {
        if (!sourceUserId) {
          console.error('❌ sourceUserId required. Usage: await window.debugDashboard.executeMigration("old-user-id")');
          return;
        }
        const currentUserId = window.debugDashboard.checkAuth()?.userId;
        console.log(`\n⚡ EXECUTING: Migrating ${sourceUserId} → ${currentUserId}`);
        const result = await executeDataMigration(sourceUserId, currentUserId);
        console.log('=== MIGRATION RESULT ===');
        console.log(result);
        
        if (result.totalErrors === 0) {
          console.log(`✅ Successfully migrated ${result.totalMigrated} documents!`);
          console.log('Reloading dashboard to show new data...');
          setTimeout(() => window.location.reload(), 2000);
        } else {
          console.log(`⚠️ Migration completed with ${result.totalErrors} errors. Check console above.`);
        }
        return result;
      },
      findDuplicates: async () => {
        console.log('🔍 Scanning for duplicate document IDs...');
        const result = await findDuplicateDocuments();
        console.log('=== DUPLICATE SCAN RESULT ===');
        console.log(result);
        
        if (result.hasDuplicates) {
          console.log('\n⚠️ DUPLICATES FOUND! To remove them safely (keeping oldest copies), run:');
          console.log('await window.debugDashboard.removeDuplicates()');
        } else {
          console.log('\n✅ No duplicates found!');
        }
        return result;
      },
      removeDuplicates: async () => {
        const hasConfirmed = confirm(
          '⚠️ This will PERMANENTLY DELETE duplicate documents (keeping oldest copies only).\n\n' +
          'This action cannot be undone. Are you sure?'
        );
        
        if (!hasConfirmed) {
          console.log('❌ Removal cancelled');
          return;
        }
        
        console.log('⚡ REMOVING duplicates (keeping oldest copies)...');
        const result = await removeDuplicateDocuments();
        console.log('=== REMOVAL RESULT ===');
        console.log(result);
        
        if (result.totalRemoved > 0) {
          console.log(`✅ Removed ${result.totalRemoved} duplicate documents!`);
          console.log('Reloading dashboard...');
          setTimeout(() => window.location.reload(), 2000);
        } else {
          console.log('ℹ️ No duplicates were removed');
        }
        return result;
      }
    };

    return () => {
      if (window.debugDashboard) {
        delete window.debugDashboard;
      }
    };
  }, []); // Only run once on mount

  const loadDashboardData = useCallback(async (currentUser = user) => {
    if (!currentUser) {
      logger.log("⏳ Dashboard: Waiting for user authentication...");
      return;
    }

    try {
      logger.log("📡 Dashboard: Loading data for user:", currentUser.uid);
      
      // Load ALL data at once - await everything before setting state
      const [journalEntries, relapseEntries, killTargets, blackMirrorEntries, hardLessons] = await Promise.all([
        readUserData('journalEntries').then(data => {
          logger.log("📔 Dashboard: Journal entries loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('relapseEntries').then(data => {
          logger.log("⚠️ Dashboard: Relapse entries loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('killTargets').then(data => {
          logger.log("🎯 Dashboard: Kill targets loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('blackMirrorEntries').then(data => {
          logger.log("📱 Dashboard: Black mirror entries loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('hardLessons').then(data => {
          logger.log("⚡ Dashboard: Hard lessons loaded:", data?.length || 0);
          return data || [];
        })
      ]);

      logger.log("📊 Dashboard: All data loaded:", {
        journalEntries: journalEntries.length,
        relapseEntries: relapseEntries.length,
        killTargets: killTargets.length,
        blackMirrorEntries: blackMirrorEntries.length,
        hardLessons: hardLessons.length
      });

      // Calculate realistic streak days based on actual data
      let streakDays = 0;
      if (relapseEntries.length > 0) {
        const lastRelapse = new Date(relapseEntries[0].createdAt);
        const today = new Date();
        streakDays = Math.floor((today - lastRelapse) / (1000 * 60 * 60 * 24));
      } else {
        // If no relapses, calculate days since first journal entry or 0
        if (journalEntries.length > 0) {
          const firstEntry = new Date(journalEntries[journalEntries.length - 1].createdAt);
          const today = new Date();
          streakDays = Math.floor((today - firstEntry) / (1000 * 60 * 60 * 24));
        }
      }

      // Set stats to show ALL-TIME counts (not just recent activity)
      // This gives a complete picture of user progress
      setStats({
        journalEntries: journalEntries.length,  // All-time total
        journalEntriesTotal: journalEntries.length,
        relapseEntries: relapseEntries.length,
        streakDays: Math.max(0, streakDays),
        killTargets: killTargets.length,  // All-time total
        killTargetsTotal: killTargets.length,
        hardLessons: hardLessons.length,  // All-time total
        hardLessonsTotal: hardLessons.length,
        blackMirrorEntries: blackMirrorEntries.length,  // All-time total
        blackMirrorEntriesTotal: blackMirrorEntries.length
      });

      // Get recent entries from all sources
      const allEntries = [
        ...journalEntries.slice(0, 3).map(e => ({ ...e, type: 'journal' })),
        ...relapseEntries.slice(0, 2).map(e => ({ ...e, type: 'relapse' })),
        ...hardLessons.slice(0, 2).map(e => ({ ...e, type: 'hardlesson' })),
        ...blackMirrorEntries.slice(0, 2).map(e => ({ ...e, type: 'blackmirror' }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

      setRecentEntries(allEntries);
      
      // Generate AI action steps based on user data (quick operation)
      const userData = {
        recentMood: journalEntries[0]?.mood || 'neutral',
        killListProgress: killTargets.length > 0 ? (killTargets.filter(t => t.status === 'killed').length / killTargets.length * 100) : 0,
        hardLessonsCount: hardLessons.length,
        hardLessonsFinalized: hardLessons.filter(l => l.isFinalized).length
      };
      
      const actionSteps = aiUtils.generateActionSteps(userData);
      setAiActionSteps(actionSteps);

      // Store raw data for deferred clarity score calculation
      setRawUserData({ journalEntries, relapseEntries, killTargets, blackMirrorEntries, hardLessons });

      logger.log("✅ Dashboard: Critical data loaded and UI updated", {
        stats: { 
          journalEntries: journalEntries.length,
          relapseEntries: relapseEntries.length,
          killTargets: killTargets.length,
          streakDays: Math.max(0, streakDays)
        },
        recentEntries: allEntries.length
      });
      
      // Defer clarity score calculation to avoid blocking initial render
      // This will be calculated in a separate effect after UI is shown
    } catch (error) {
      logger.error("❌ Dashboard: Error loading critical data:", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Deferred clarity score calculation - runs after UI renders
  useEffect(() => {
    if (!loading && rawUserData && !calculatingClarity) {
      setCalculatingClarity(true);
      
      logger.log("🧮 Dashboard: Starting clarity score calculation with data:", {
        journalEntries: rawUserData.journalEntries?.length || 0,
        killTargets: rawUserData.killTargets?.length || 0,
        relapseEntries: rawUserData.relapseEntries?.length || 0,
        blackMirrorEntries: rawUserData.blackMirrorEntries?.length || 0,
        hardLessons: rawUserData.hardLessons?.length || 0
      });
      
      // Use setTimeout to allow UI to render first
      const timer = setTimeout(async () => {
        try {
          const scoreData = await clarityScoreUtils.calculateClarityScore(rawUserData);
          const rank = clarityScoreUtils.getClarityRank(scoreData.totalScore);
          setClarityScore({ ...scoreData, rank });

          // Compute early warning signal
          const NEGATIVE_MOODS = new Set(['heavy','hollow','foggy','chaotic']);
          const POSITIVE_MOODS = new Set(['electric','light','radiant','triumphant','focused','sharp','steady','calm']);
          const recentJournal = (rawUserData.journalEntries || []).slice(0, 7);
          const moodDots = recentJournal.map(e => {
            if (NEGATIVE_MOODS.has(e.mood)) return 'red';
            if (POSITIVE_MOODS.has(e.mood)) return 'green';
            return 'gray';
          });
          const negativeCount = moodDots.filter(m => m === 'red').length;
          const last5negative = moodDots.slice(0, 5).filter(m => m === 'red').length;
          const daysSinceRelapse = stats.streakDays;
          const daysSinceJournal = recentJournal.length > 0 ? (() => {
            const raw = recentJournal[0].createdAt;
            const d = raw?.toDate ? raw.toDate() : new Date(raw);
            return isNaN(d.getTime()) ? 99 : Math.floor((Date.now() - d.getTime()) / 86400000);
          })() : 99;

          let level = 'clear';
          const signals = [];
          if (daysSinceRelapse !== null && daysSinceRelapse < 3) { level = 'high'; signals.push('Recent relapse within 72 hours'); }
          if (last5negative >= 3) { level = level === 'high' ? 'high' : 'elevated'; signals.push('Predominantly negative mood over last 5 entries'); }
          if (daysSinceJournal >= 5) { level = level === 'high' ? 'high' : 'elevated'; signals.push(`No journal entry in ${daysSinceJournal} days`); }
          if (negativeCount >= 2 && daysSinceRelapse < 14) { level = level === 'high' ? 'high' : 'elevated'; signals.push('Negative mood pattern following recent relapse'); }

          if (level !== 'clear' && recentJournal.length >= 3) {
            setEarlyWarning({ level, signals, moodDots, daysSinceRelapse, daysSinceJournal });
          }

          // Compute behavioral drift signals (archetype frequency, precursor patterns, correlated escapes)
          // Finding 14: detector now returns { signals, skippedCount }.
          const { signals: detected } = detectDriftSignals(rawUserData.relapseEntries || [], rawUserData.killTargets || []);
          if (detected.length > 0) {
            setDriftSignals(detected);
          }
          
          logger.log("✅ Dashboard: Clarity score calculated successfully", {
            score: scoreData.totalScore,
            rank: rank.rank,
            breakdown: scoreData.breakdown
          });
        } catch (error) {
          logger.error("❌ Dashboard: Error calculating clarity score:", error);
          logger.error("Error details:", error.message, error.stack);
        } finally {
          setCalculatingClarity(false);
        }
      }, 100); // Small delay to let UI render first
      
      return () => clearTimeout(timer);
    }
  }, [loading, rawUserData]); // Remove calculatingClarity from dependencies to avoid loop

  const showShell = loading || showSkeleton || !user;

  // Calculate ring percentages for visualization - Based on realistic, meaningful goals (memoized to prevent recalculation)
  
  // Mastery: Overall progress toward full mastery (0-1000 scale)
  // 1000 represents years of consistent practice - the full journey
  const MASTERY_SCORE = 1100;
  const masteryPercent = Math.min(100, (clarityScore.totalScore / MASTERY_SCORE) * 100);

  // Also calculate rank progress for display context
  // Final Expert→Master stretch is 350 pts (750→1100) vs 250 for all prior tiers — intentionally harder
  const RANK_TIERS = [0, 25, 75, 150, 300, 500, 750, 1100];

  const getCurrentRankThreshold = (score) => {
    // Returns the floor of the tier the score currently sits in
    for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
      if (score >= RANK_TIERS[i]) return RANK_TIERS[i];
    }
    return 0;
  };

  const getNextRankThreshold = (score) => {
    // Returns the ceiling of the current tier (floor of the next rank)
    const current = getCurrentRankThreshold(score);
    const idx = RANK_TIERS.indexOf(current);
    return RANK_TIERS[Math.min(idx + 1, RANK_TIERS.length - 1)];
  };

  const currentRankFloor = getCurrentRankThreshold(clarityScore.totalScore);
  const nextRankThreshold = getNextRankThreshold(clarityScore.totalScore);
  const pointsToNextRank = nextRankThreshold - clarityScore.totalScore;
  const rangeSize = nextRankThreshold - currentRankFloor;
  const progressInRange = clarityScore.totalScore - currentRankFloor;
  
  // Clarity Ring: Progress within current rank toward next rank
  // This gives actionable short-term motivation
  const clarityPercent = rangeSize > 0 ? Math.min(100, (progressInRange / rangeSize) * 100) : 100;
  
  // Streak Ring: Progress toward 30-day milestone (a meaningful recovery goal)
  const streakPercent = Math.min(100, (stats.streakDays / 30) * 100);
  
  // Activity Ring: Based on RECENT activity (last 30 days) across all modules
  // This measures current engagement, not lifetime totals
  
  // Helper to count entries from last 30 days
  const countRecentEntries = (entries, daysBack = 30) => {
    if (!entries || !Array.isArray(entries)) return 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
    
    return entries.filter(entry => {
      if (!entry?.createdAt) return false;
      const entryDate = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
      return entryDate >= cutoffDate;
    }).length;
  };
  
  // Helper to count recent entries from recentEntries (already loaded)
  // Since we don't have the full arrays in state, we'll use the stats for now
  // but apply a decay factor based on the most recent entry time
  
  // Monthly goals (30-day targets):
  // - Journal: 8 entries/month (2/week) = most important daily habit
  // - Kill Targets: 3 targets actively worked on = ongoing elimination
  // - Hard Lessons: 2 lessons/month = meaningful reflection
  // - Black Mirror: 4 checks/month (weekly) = digital awareness
  
  const journalGoal = 8;
  const killGoal = 3;
  const lessonsGoal = 2;
  const mirrorGoal = 4;
  
  // Calculate progress for each module
  // For kill targets: count both active targets and successfully killed ones
  const activeKillTargets = stats.killTargets || 0;
  
  // Cap each at 100% to prevent one area from inflating overall score
  const journalProgress = Math.min(100, (countRecentEntries(rawUserData?.journalEntries) / journalGoal) * 100);
  const killProgress = Math.min(100, (countRecentEntries(rawUserData?.killTargets?.filter(t => t.status === 'active')) / killGoal) * 100);
  const lessonsProgress = Math.min(100, (countRecentEntries(rawUserData?.hardLessons) / lessonsGoal) * 100);
  const mirrorProgress = Math.min(100, (countRecentEntries(rawUserData?.blackMirrorEntries) / mirrorGoal) * 100);
  
  // Weighted average with clear rationale:
  // - Journal (35%): Daily reflection is foundational to self-awareness
  // - Kill List (25%): Actively eliminating destructive patterns
  // - Hard Lessons (25%): Extracting wisdom from pain prevents repeat mistakes
  // - Black Mirror (15%): Digital consciousness checks support overall clarity
  const activityPercent = Math.round(
    journalProgress * 0.35 +
    killProgress * 0.25 +
    lessonsProgress * 0.25 +
    mirrorProgress * 0.15
  );

  const formatTimeAgo = useCallback((date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  }, []);

  const getActivityMeta = useCallback((type) => {
    const meta = {
      journal: { icon: '📝', color: '#a855f7', label: 'Journal' },
      relapse: { icon: '⚠️', color: '#f59e0b', label: 'Awareness' },
      hardlesson: { icon: '⚡', color: '#f59e0b', label: 'Hard Lesson' },
      blackmirror: { icon: '📱', color: '#4da6ff', label: 'Mirror Check' }
    };
    return meta[type] || { icon: '📊', color: '#8a8a8a', label: 'Activity' };
  }, []);

  return (
    <div className="min-h-screen bg-black">
      <div className={`fade-pane ${showShell ? 'visible' : 'hidden'}`}>
        <SkeletonDashboard />
      </div>

      <div className={`fade-pane ${showShell ? 'hidden' : 'visible'}`}>
        <div className="min-h-screen bg-black animate-fade-in">
          <div className="max-w-6xl mx-auto px-4 py-8">
            
            {/* Oura-style Header */}
            <header className="mb-10 animate-fade-in-up">
              <p className="text-[#5a5a5a] text-sm uppercase tracking-widest mb-2">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
              <h1 className="text-3xl font-bold text-white">
                Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {user?.displayName?.split(' ')[0] || user?.email?.split('@')[0] || 'Warrior'}
              </h1>
            </header>

        {/* Synthesis Briefing — Forced State (non-dismissible, must open before clearing) */}
        {latestSynthesisIsNew && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.04s' }}>
            <div className="oura-card p-6 border border-white/25 bg-[#0d0d0d]">
              <p className="text-xs font-medium uppercase tracking-widest text-white mb-2">Synthesis Briefing</p>
              <p className="text-[#8a8a8a] text-sm mb-5 leading-relaxed">
                A new cross-module intelligence briefing has been generated. Open it to proceed.
              </p>
              <button
                onClick={() => navigate('/synthesis')}
                className="px-6 py-2.5 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#d1d1d1] transition-colors"
              >
                Open Briefing
              </button>
            </div>
          </section>
        )}

        {/* Daily Prompt Section */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
          <DailyPrompt onJournalClick={() => setQuickJournalOpen(true)} />
        </section>

        {/* Early Warning Widget */}
        {earlyWarning && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.08s' }}>
            <div className={`oura-card p-5 border-l-4 ${
              earlyWarning.level === 'high' ? 'border-[#ef4444]' :
              earlyWarning.level === 'elevated' ? 'border-[#f59e0b]' :
              'border-[#22c55e]'
            }`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-xs font-medium uppercase tracking-widest ${
                      earlyWarning.level === 'high' ? 'text-[#ef4444]' :
                      earlyWarning.level === 'elevated' ? 'text-[#f59e0b]' :
                      'text-[#22c55e]'
                    }`}>
                      {earlyWarning.level === 'high' ? 'High Risk' :
                       earlyWarning.level === 'elevated' ? 'Elevated Risk' : 'On Track'}
                    </span>
                    {earlyWarning.daysSinceRelapse !== null && (
                      <span className="text-[#5a5a5a] text-xs">
                        {earlyWarning.daysSinceRelapse === 0 ? 'relapsed today' : `${earlyWarning.daysSinceRelapse}d since last relapse`}
                      </span>
                    )}
                  </div>
                  {earlyWarning.signals.length > 0 && (
                    <div className="space-y-1 mb-3">
                      {earlyWarning.signals.map((s, i) => (
                        <p key={i} className="text-[#8a8a8a] text-sm">{s}</p>
                      ))}
                    </div>
                  )}
                  {/* Mood dots — last 7 journal entries, left = most recent */}
                  {earlyWarning.moodDots.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#3a3a3a] text-xs mr-1">Mood</span>
                      {earlyWarning.moodDots.map((color, i) => (
                        <div
                          key={i}
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: color === 'red' ? '#ef4444' : color === 'green' ? '#22c55e' : '#2a2a2a' }}
                        />
                      ))}
                      <span className="text-[#3a3a3a] text-xs ml-1">← recent</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Drift Signal Warning */}
        {driftSignals.length > 0 && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.09s' }}>
            <div className="oura-card p-5 border-l-4 border-[#f59e0b]">
              <p className="text-xs font-medium uppercase tracking-widest text-[#f59e0b] mb-3">Relapse Radar — Drift Detected</p>
              <div className="space-y-2">
                {driftSignals.map((signal, idx) => (
                  <div key={idx} className={`p-3 rounded-xl border-l-2 ${signal.severity === 'warning' ? 'border-[#f59e0b] bg-[#f59e0b]/5' : 'border-[#a855f7] bg-[#a855f7]/5'}`}>
                    <p className="text-white text-sm">{signal.description}</p>
                    {signal.detail && <p className="text-[#5a5a5a] text-xs mt-0.5">{signal.detail}</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Sunday Autopsy — weekly lesson capture */}
        {showAutopsy && (
          <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.09s' }}>
            <div className="oura-card p-6 border-l-4 border-[#f59e0b]">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white text-sm font-medium mb-1">What did this week cost you?</h3>
                  <p className="text-[#5a5a5a] text-xs">Name one thing you'd handle differently. This becomes a Hard Lesson draft.</p>
                </div>
                <button
                  onClick={() => { sessionStorage.setItem(autopsySessionKey, 'true'); setAutopsyDismissed(true); }}
                  className="text-[#3a3a3a] hover:text-[#5a5a5a] transition-colors shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={autopsyText}
                  onChange={(e) => setAutopsyText(e.target.value)}
                  placeholder="I should have..."
                  className="flex-1 p-3 bg-[#0a0a0a] text-white text-sm rounded-xl border border-[#1a1a1a] focus:border-[#f59e0b] focus:outline-none transition-colors placeholder-[#2a2a2a]"
                  onKeyDown={(e) => { if (e.key === 'Enter' && autopsyText.trim()) submitAutopsy(); }}
                />
                <button
                  onClick={submitAutopsy}
                  disabled={autopsySaving || !autopsyText.trim()}
                  className="px-4 py-3 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-white text-sm font-medium rounded-xl transition-all shrink-0"
                >
                  {autopsySaving ? '...' : 'Capture'}
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Monday Kill Report */}
        {isMonday && !killReportDismissed && !loading && rawUserData?.killTargets?.length > 0 && (() => {
          const now = Date.now();
          const weekAgo = now - 7 * 86400000;
          const activeTargets = rawUserData.killTargets.filter(t => t.status === 'active');
          const held = activeTargets.filter(t => {
            const recentChecks = (t.checkIns || []).filter(c => new Date(c.date).getTime() > weekAgo);
            return recentChecks.length > 0 && recentChecks.every(c => c.held);
          }).length;
          const escaped = activeTargets.filter(t => {
            const recentChecks = (t.checkIns || []).filter(c => new Date(c.date).getTime() > weekAgo);
            return recentChecks.some(c => !c.held);
          }).length;
          const untouched = activeTargets.filter(t => {
            const recentChecks = (t.checkIns || []).filter(c => new Date(c.date).getTime() > weekAgo);
            return recentChecks.length === 0;
          }).length;
          if (held === 0 && escaped === 0 && untouched === 0) return null;
          return (
            <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.092s' }}>
              <div className="oura-card p-5 border-l-4 border-[#4da6ff]">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-white text-sm font-medium mb-1">Last Week's Record</h3>
                    <p className="text-[#5a5a5a] text-xs">Across {activeTargets.length} active battle{activeTargets.length !== 1 ? 's' : ''}</p>
                  </div>
                  <button onClick={() => setKillReportDismissed(true)} className="text-[#3a3a3a] hover:text-[#5a5a5a] transition-colors shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>
                <div className="flex items-center gap-4">
                  {held > 0 && <span className="text-[#22c55e] text-sm"><span className="text-lg font-medium tabular-nums">{held}</span> held</span>}
                  {escaped > 0 && <span className="text-[#ef4444] text-sm"><span className="text-lg font-medium tabular-nums">{escaped}</span> escaped</span>}
                  {untouched > 0 && <span className="text-[#5a5a5a] text-sm"><span className="text-lg font-medium tabular-nums">{untouched}</span> untouched</span>}
                </div>
                {untouched > 0 && (
                  <p className="text-[#3a3a3a] text-xs mt-2">{untouched} target{untouched > 1 ? 's' : ''} had zero check-ins last week.</p>
                )}
              </div>
            </section>
          );
        })()}

        {/* Main Score Section - Oura Triple Ring Style */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="oura-card p-8 flex flex-col lg:flex-row items-center gap-8">
            
            {/* Triple Ring Visualization */}
            <div className="relative flex-shrink-0">
              <TripleRing 
                size={220}
                rings={[
                  { progress: clarityPercent, color: '#00d4aa', label: 'Clarity' },
                  { progress: activityPercent, color: '#4da6ff', label: 'Activity' },
                  { progress: streakPercent, color: '#a855f7', label: 'Streak' }
                ]}
                centerContent={
                  <div className="text-center">
                    <div className="text-5xl font-bold text-white oura-score">
                      {clarityScore.totalScore}
                    </div>
                    <div className="text-[#5a5a5a] text-xs uppercase tracking-wider mt-1">
                      Clarity
                    </div>
                  </div>
                }
              />
            </div>

            {/* Score Details */}
            <div className="flex-1 w-full">
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{clarityScore.rank.icon}</span>
                <div>
                  <h2 className="text-xl font-semibold text-white">{clarityScore.rank.rank}</h2>
                  <p className="text-[#5a5a5a] text-sm">Your current clarity level</p>
                </div>
              </div>
              
              {/* Ring Legend */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#00d4aa]"></div>
                  <div>
                    <p className="text-white text-sm font-medium">{clarityPercent.toFixed(0)}%</p>
                    <p className="text-[#5a5a5a] text-xs">Clarity</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#4da6ff]"></div>
                  <div>
                    <p className="text-white text-sm font-medium">{activityPercent.toFixed(0)}%</p>
                    <p className="text-[#5a5a5a] text-xs">Activity</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 group relative cursor-help">
                  <div className="w-3 h-3 rounded-full bg-[#a855f7]"></div>
                  <div>
                    <p className="text-white text-sm font-medium">{stats.streakDays}d</p>
                    <p className="text-[#5a5a5a] text-xs">Streak</p>
                  </div>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#2a2a2a] text-[#8a8a8a] text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                    Days since last relapse
                  </div>
                </div>
              </div>

              {/* Score Breakdown */}
              {(() => {
                const bd = clarityScore.breakdown || {};
                const rawTotal = (bd.journal || 0) + (bd.killList || 0) + (bd.hardLessons || 0) + (bd.blackMirror || 0) + (bd.relapseAwareness || 0) + (bd.bonuses || 0);
                const modules = [
                  { label: 'Journal',      pts: bd.journal || 0,            color: '#a855f7' },
                  { label: 'Kill List',    pts: bd.killList || 0,            color: '#ef4444' },
                  { label: 'Hard Lessons', pts: bd.hardLessons || 0,         color: '#f59e0b' },
                  { label: 'Mirror',       pts: bd.blackMirror || 0,         color: '#4da6ff' },
                  { label: 'Awareness',    pts: bd.relapseAwareness || 0,    color: '#22c55e' },
                  { label: 'Bonuses',      pts: bd.bonuses || 0,             color: '#00d4aa' },
                ];
                const multiplier = bd.completionMultiplier ?? 1;
                const completionPct = bd.completionRate != null ? Math.round(bd.completionRate * 100) : null;
                return (
                  <div className="space-y-3">
                    {modules.map(({ label, pts, color }) => {
                      const barPct = rawTotal > 0 ? Math.round((pts / rawTotal) * 100) : 0;
                      return (
                        <div key={label} className="flex items-center gap-3">
                          <span className="text-[#5a5a5a] text-xs w-24 shrink-0">{label}</span>
                          <div className="flex-1 h-1.5 bg-[#1a1a1a] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${barPct}%`, backgroundColor: color }}
                            />
                          </div>
                          <span className="text-xs font-semibold tabular-nums w-10 text-right" style={{ color }}>
                            +{pts}
                          </span>
                        </div>
                      );
                    })}
                    {/* Multiplier row */}
                    <div className="pt-2 border-t border-[#1a1a1a] flex items-center justify-between text-xs text-[#5a5a5a]">
                      <span>Kill-list completion rate</span>
                      <span className={`font-semibold ${multiplier >= 1 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        ×{multiplier.toFixed(2)}{completionPct != null ? ` (${completionPct}%)` : ''}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </section>

        {/* Stats Grid - Oura Score Cards */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Your Stats (All-Time)</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <ScoreCard score={stats.streakDays} label="Streak" sublabel="Days strong" color="#00d4aa" icon={<AppIcon name="streak" size={20} color="#00d4aa" />} size="small" />
            <ScoreCard score={stats.killTargets} label="Targets" sublabel={`of ${stats.killTargetsTotal || 0} total`} color="#ef4444" icon={<AppIcon name="target" size={20} color="#ef4444" />} size="small" />
            <ScoreCard score={stats.hardLessons} label="Lessons" sublabel={`of ${stats.hardLessonsTotal || 0} total`} color="#f59e0b" icon={<AppIcon name="hardLessons" size={20} color="#f59e0b" />} size="small" />
            <ScoreCard score={stats.journalEntries} label="Journal" sublabel={`of ${stats.journalEntriesTotal || 0} total`} color="#a855f7" icon={<AppIcon name="journal" size={20} color="#a855f7" />} size="small" />
            <ScoreCard score={stats.blackMirrorEntries || 0} label="Mirror" sublabel={`of ${stats.blackMirrorEntriesTotal || 0} total`} color="#4da6ff" icon={<AppIcon name="mirror" size={20} color="#4da6ff" />} size="small" />
            <ScoreCard score={clarityScore.journalStreak || 0} label="Writing" sublabel="Day streak" color="#22c55e" icon={<AppIcon name="writing" size={20} color="#22c55e" />} size="small" />
          </div>
        </section>

        {/* Quick Actions - Oura Style */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/journal" className="oura-card p-5 group hover:border-[#a855f7]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#a855f7]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="journal" size={28} color="#a855f7" />
              </div>
              <h4 className="text-white font-medium mb-1">Journal</h4>
              <p className="text-[#5a5a5a] text-sm">Reflect & process</p>
            </Link>
            
            <Link to="/killlist" className="oura-card p-5 group hover:border-[#ef4444]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="target" size={28} color="#ef4444" />
              </div>
              <h4 className="text-white font-medium mb-1">Kill List</h4>
              <p className="text-[#5a5a5a] text-sm">Eliminate patterns</p>
            </Link>
            
            <Link to="/hardlessons" className="oura-card p-5 group hover:border-[#f59e0b]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#f59e0b]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="hardLessons" size={28} color="#f59e0b" />
              </div>
              <h4 className="text-white font-medium mb-1">Hard Lessons</h4>
              <p className="text-[#5a5a5a] text-sm">Turn pain to wisdom</p>
            </Link>
            
            <Link to="/blackmirror" className="oura-card p-5 group hover:border-[#4da6ff]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#4da6ff]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <AppIcon name="mirror" size={28} color="#4da6ff" />
              </div>
              <h4 className="text-white font-medium mb-1">Black Mirror</h4>
              <p className="text-[#5a5a5a] text-sm">Reality check</p>
            </Link>
          </div>
        </section>

        {/* Kill List Dashboard — collapsible */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <button
            onClick={() => setKillListExpanded(prev => !prev)}
            className="flex items-center justify-between w-full mb-4 group"
          >
            <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest group-hover:text-[#8a8a8a] transition-colors">Kill List Overview</h3>
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`text-[#3a3a3a] group-hover:text-[#5a5a5a] transition-all duration-200 ${killListExpanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {killListExpanded && <KillListDashboard />}
        </section>

        {/* Two Column: Activity + Insights */}
        <div className="grid lg:grid-cols-2 gap-6 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
          
          {/* Recent Activity */}
          <section>
            <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {recentEntries.length > 0 ? (
                recentEntries.map((entry, index) => {
                  const meta = getActivityMeta(entry.type);
                  return (
                    <ActivityItem
                      key={index}
                      type={meta.label}
                      title={entry.type === 'hardlesson' 
                        ? (entry.extractedLesson || entry.eventDescription || 'Hard lesson extracted')
                        : (entry.content || entry.reflection || entry.notes || 'Entry recorded')}
                      description={entry.type === 'hardlesson' && entry.ruleGoingForward ? `Rule: ${entry.ruleGoingForward}` : null}
                      time={formatTimeAgo(entry.createdAt)}
                      icon={meta.icon}
                      color={meta.color}
                    />
                  );
                })
              ) : (
                <div className="oura-card p-8 text-center">
                  <div className="text-4xl mb-3 opacity-30">📊</div>
                  <p className="text-[#5a5a5a]">No recent activity</p>
                  <p className="text-[#3a3a3a] text-sm mt-1">Start using the modules to track progress</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-5">
                    <button
                      onClick={() => setQuickJournalOpen(true)}
                      className="px-5 py-2.5 bg-[#00d4aa] hover:bg-[#00e6b8] text-black rounded-xl transition-all duration-300 font-medium text-sm"
                    >
                      Quick Journal
                    </button>
                    <Link
                      to="/killlist"
                      className="px-5 py-2.5 bg-transparent border border-[#1a1a1a] text-[#8a8a8a] hover:text-white hover:border-[#2a2a2a] rounded-xl transition-all duration-300 font-medium text-sm"
                    >
                      Add a Kill Contract
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* AI Insights — collapsible */}
          <section>
            <button
              onClick={() => setInsightsExpanded(prev => !prev)}
              className="flex items-center justify-between w-full mb-4 group"
            >
              <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest group-hover:text-[#8a8a8a] transition-colors">AI Insights</h3>
              <svg
                width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-[#3a3a3a] group-hover:text-[#5a5a5a] transition-all duration-200 ${insightsExpanded ? 'rotate-180' : ''}`}
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {insightsExpanded && (
              <div className="space-y-3">
                {aiActionSteps.length > 0 ? (
                  aiActionSteps.slice(0, 4).map((step, index) => (
                    <InsightCard
                      key={index}
                      title="Recommendation"
                      description={step}
                      icon="💡"
                      accentColor={['#00d4aa', '#4da6ff', '#a855f7', '#f59e0b'][index % 4]}
                    />
                  ))
                ) : (
                  <div className="oura-card p-8 text-center">
                    <div className="text-4xl mb-3 opacity-30">🤖</div>
                    <p className="text-[#5a5a5a]">Learning your patterns</p>
                    <p className="text-[#3a3a3a] text-sm mt-1">Keep using the app for personalized insights</p>
                    <button
                      onClick={() => setQuickJournalOpen(true)}
                      className="mt-4 px-5 py-2.5 bg-[#4da6ff] hover:bg-[#357abd] text-white rounded-xl transition-all duration-300 font-medium text-sm"
                    >
                      Add a Journal Entry
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>
          </div>
        </div>

        {/* Floating Action Button */}
        <button
          onClick={() => setQuickJournalOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-[#a855f7] to-[#6366f1] rounded-full shadow-lg shadow-[#a855f7]/30 flex items-center justify-center hover:scale-110 hover:shadow-xl hover:shadow-[#a855f7]/40 transition-all duration-200 group z-40"
          title="Quick Journal Entry"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-90 transition-transform duration-200">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Quick Journal Modal */}
        <QuickJournalModal
          isOpen={quickJournalOpen}
          onClose={() => setQuickJournalOpen(false)}
          onSuccess={() => {
            // Refresh data after successful entry
            loadDashboardData();
          }}
        />

        {/* Debug Info Section (development only) */}
        {isDevEnvironment && <div className="mt-12 pt-8 border-t border-[#1a1a1a] animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
          <div className="bg-[#0a0a0a] rounded-xl p-6 border border-[#1a1a1a]">
            <h4 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Debug Info & Data Recovery</h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm mb-4">
              <div>
                <p className="text-[#3a3a3a]">User ID</p>
                <p className="text-white font-mono text-xs truncate">{user?.uid || 'Not authenticated'}</p>
              </div>
              <div>
                <p className="text-[#3a3a3a]">Email</p>
                <p className="text-white font-mono text-xs truncate">{user?.email || 'N/A'}</p>
              </div>
              <div>
                <p className="text-[#3a3a3a]">Auth Type</p>
                <p className="text-white text-xs">{user?.isAnonymous ? 'Anonymous' : 'Email'}</p>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => window.debugDashboard?.showUserInfo?.()}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#8a8a8a] hover:text-white rounded-lg text-sm transition-all"
              >
                Show User Info
              </button>
              <button
                onClick={async () => {
                  const oldData = await window.debugDashboard?.findOldData?.();
                  if (oldData && Object.keys(oldData).length > 0) {
                    alert(`Found old data!\n${JSON.stringify(Object.keys(oldData))}\n\nClick "Migrate Data" to import it`);
                  } else {
                    alert('No old data found');
                  }
                }}
                className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#8a8a8a] hover:text-white rounded-lg text-sm transition-all"
              >
                Scan Old Data
              </button>
              <button
                onClick={async () => {
                  if (confirm('Migrate old localStorage data to Firestore? This will import all your historical entries.')) {
                    await window.debugDashboard?.migrateData?.();
                  }
                }}
                className="px-4 py-2 bg-[#00d4aa]/20 hover:bg-[#00d4aa]/30 text-[#00d4aa] rounded-lg text-sm transition-all font-medium"
              >
                🚀 Migrate Data
              </button>
            </div>
          </div>
        </div>}
      </div>
      </div>
    </div>
  );
}
