
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { readUserData, testFirebaseConnection } from '../utils/firebaseUtils';
import { authService } from '../utils/authService';
import { aiUtils } from '../utils/aiUtils';
import { clarityScoreUtils } from '../utils/clarityScore';
import KillListDashboard from '../components/KillListDashboard';
import { auth } from '../firebase';
import { CircularProgressRing, TripleRing, ScoreCard, InsightCard, ActivityItem } from '../components/OuraRing';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    journalEntries: 0,
    relapseEntries: 0,
    streakDays: 0,
    killTargets: 0,
    hardLessons: 0
  });
  const [recentEntries, setRecentEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiActionSteps, setAiActionSteps] = useState([]);
  const [firebaseTestResult, setFirebaseTestResult] = useState(null);
  const [clarityScore, setClarityScore] = useState({
    totalScore: 0,
    rank: { rank: 'Clarity Novice', icon: '🌱', color: 'text-gray-500' },
    isFrozen: false,
    breakdown: {}
  });

  // Get current user from auth service
  useEffect(() => {
    const currentUser = authService.getCurrentUser();
    setUser(currentUser);
    console.log("👤 Dashboard: Current user:", currentUser?.uid);
    
    if (currentUser) {
      loadDashboardData();
    } else {
      setLoading(false); // Stop loading if no user
    }

    // Add debugging function to window
    window.debugDashboard = {
      reloadData: () => loadDashboardData(),
      checkAuth: () => ({
        currentUser: authService.getCurrentUser(),
        hasUser: !!authService.getCurrentUser()
      }),
      getStats: () => stats,
      getRecentEntries: () => recentEntries,
      getClarityScore: () => clarityScore
    };
  }, []);

  // Load data when user is authenticated
  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  // Test Firebase connection
  const runFirebaseTest = async () => {
    console.log("🔥 Running Firebase connection test...");
    setFirebaseTestResult({ testing: true });
    
    try {
      const result = await testFirebaseConnection();
      setFirebaseTestResult(result);
      console.log("Firebase test result:", result);
      
      if (result.success) {
        alert("✅ Firebase connection successful! Check console for details.");
        // Reload data after successful test
        loadDashboardData();
      } else {
        alert(`❌ Firebase connection failed: ${result.error}\n${result.details}`);
      }
    } catch (error) {
      console.error("Firebase test error:", error);
      setFirebaseTestResult({
        success: false,
        error: "Test failed",
        details: error.message
      });
      alert(`❌ Firebase test failed: ${error.message}`);
    }
  };

  const loadDashboardData = async () => {
    if (!user) {
      console.log("⏳ Dashboard: Waiting for user authentication...");
      return;
    }

    try {
      console.log("📡 Dashboard: Loading data for user:", user.uid);
      
      // Load data in parallel for better performance
      const [journalEntries, relapseEntries, killTargets, blackMirrorEntries, hardLessons] = await Promise.all([
        readUserData('journalEntries').then(data => {
          console.log("📔 Dashboard: Journal entries loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('relapseEntries').then(data => {
          console.log("⚠️ Dashboard: Relapse entries loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('killTargets').then(data => {
          console.log("🎯 Dashboard: Kill targets loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('blackMirrorEntries').then(data => {
          console.log("📱 Dashboard: Black mirror entries loaded:", data?.length || 0);
          return data || [];
        }),
        readUserData('hardLessons').then(data => {
          console.log("⚡ Dashboard: Hard lessons loaded:", data?.length || 0);
          return data || [];
        })
      ]);

      console.log("📊 Dashboard: Data loaded:", {
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

      setStats({
        journalEntries: journalEntries.length,
        relapseEntries: relapseEntries.length,
        streakDays: Math.max(0, streakDays),
        killTargets: killTargets.length,
        hardLessons: hardLessons.length,
        blackMirrorEntries: blackMirrorEntries.length
      });

      // Get recent entries from all sources
      const allEntries = [
        ...journalEntries.slice(0, 3).map(e => ({ ...e, type: 'journal' })),
        ...relapseEntries.slice(0, 2).map(e => ({ ...e, type: 'relapse' })),
        ...hardLessons.slice(0, 2).map(e => ({ ...e, type: 'hardlesson' })),
        ...blackMirrorEntries.slice(0, 2).map(e => ({ ...e, type: 'blackmirror' }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

      setRecentEntries(allEntries);
      
      // Generate AI action steps based on user data
      const userData = {
        recentMood: journalEntries[0]?.mood || 'neutral',
        killListProgress: killTargets.length > 0 ? (killTargets.filter(t => t.status === 'killed').length / killTargets.length * 100) : 0,
        hardLessonsCount: hardLessons.length,
        hardLessonsFinalized: hardLessons.filter(l => l.isFinalized).length
      };
      
      const actionSteps = aiUtils.generateActionSteps(userData);
      setAiActionSteps(actionSteps);

      // Calculate clarity score  
      const allUserData = { journalEntries, relapseEntries, killTargets, blackMirrorEntries, hardLessons };
      const scoreData = await clarityScoreUtils.calculateClarityScore(allUserData);
      const rank = clarityScoreUtils.getClarityRank(scoreData.totalScore);
      setClarityScore({ ...scoreData, rank });

      console.log("✅ Dashboard: All data processing complete", {
        stats: { 
          journalEntries: journalEntries.length,
          relapseEntries: relapseEntries.length,
          killTargets: killTargets.length,
          hardLessons: hardLessons.length,
          blackMirrorEntries: blackMirrorEntries.length,
          streakDays: Math.max(0, streakDays)
        },
        recentEntries: allEntries.length,
        clarityScore: scoreData.totalScore,
        rank: rank.rank
      });
    } catch (error) {
      console.error("❌ Dashboard: Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <CircularProgressRing progress={75} size={80} color="#00d4aa" />
          </div>
          <p className="text-[#5a5a5a] text-sm">
            {!user ? "Authenticating..." : "Loading your data..."}
          </p>
        </div>
      </div>
    );
  }

  // Calculate ring percentages for visualization - Based on realistic, meaningful goals
  
  // Clarity Ring: Progress toward next rank milestone
  const getCurrentRankThreshold = (score) => {
    if (score >= 1000) return 1000; // At max
    if (score >= 750) return 1000;  // Working toward Master (1000)
    if (score >= 500) return 750;   // Working toward Expert (750)
    if (score >= 300) return 500;   // Working toward Seeker (500)
    if (score >= 150) return 300;   // Working toward Practitioner (300)
    if (score >= 75) return 150;    // Working toward Student (150)
    if (score >= 25) return 75;     // Working toward Apprentice (75)
    return 25;                       // Working toward Beginner (25)
  };
  
  const getPreviousRankThreshold = (score) => {
    if (score >= 1000) return 750;
    if (score >= 750) return 500;
    if (score >= 500) return 300;
    if (score >= 300) return 150;
    if (score >= 150) return 75;
    if (score >= 75) return 25;
    if (score >= 25) return 0;
    return 0;
  };
  
  const currentThreshold = getCurrentRankThreshold(clarityScore.totalScore);
  const previousThreshold = getPreviousRankThreshold(clarityScore.totalScore);
  const rangeSize = currentThreshold - previousThreshold;
  const progressInRange = clarityScore.totalScore - previousThreshold;
  const clarityPercent = rangeSize > 0 ? Math.min(100, (progressInRange / rangeSize) * 100) : 0;
  
  // Streak Ring: Progress toward 30-day milestone (a meaningful recovery goal)
  const streakPercent = Math.min(100, (stats.streakDays / 30) * 100);
  
  // Activity Ring: Composite of consistent engagement across all modules
  // Goal: At least 2 journal entries/week (8/month), 2 kill targets, 2 hard lessons, 4 mirror checks/month
  const journalGoal = 8;  // 2/week
  const killGoal = 2;     // Quality over quantity
  const lessonsGoal = 2;  // Extract meaningful lessons
  const mirrorGoal = 4;   // Weekly checks
  
  const journalProgress = Math.min(100, (stats.journalEntries / journalGoal) * 100);
  const killProgress = Math.min(100, (stats.killTargets / killGoal) * 100);
  const lessonsProgress = Math.min(100, (stats.hardLessons / lessonsGoal) * 100);
  const mirrorProgress = Math.min(100, ((stats.blackMirrorEntries || 0) / mirrorGoal) * 100);
  
  // Weighted average: Journal is most important, then kill list
  const activityPercent = (
    journalProgress * 0.4 +    // 40% weight - daily reflection is key
    killProgress * 0.3 +        // 30% weight - eliminating patterns
    lessonsProgress * 0.2 +     // 20% weight - learning from mistakes
    mirrorProgress * 0.1        // 10% weight - reality checks
  );

  const formatTimeAgo = (date) => {
    const now = new Date();
    const diff = now - new Date(date);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
  };

  const getActivityMeta = (type) => {
    const meta = {
      journal: { icon: '📝', color: '#a855f7', label: 'Journal' },
      relapse: { icon: '⚠️', color: '#f59e0b', label: 'Awareness' },
      hardlesson: { icon: '⚡', color: '#f59e0b', label: 'Hard Lesson' },
      blackmirror: { icon: '📱', color: '#4da6ff', label: 'Mirror Check' }
    };
    return meta[type] || { icon: '📊', color: '#8a8a8a', label: 'Activity' };
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto px-4 py-8">
        
        {/* Oura-style Header */}
        <header className="mb-10 animate-fade-in-up">
          <p className="text-[#5a5a5a] text-sm uppercase tracking-widest mb-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold text-white">
            Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}
          </h1>
        </header>

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
              <div className="flex items-center gap-3 mb-6">
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
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#a855f7]"></div>
                  <div>
                    <p className="text-white text-sm font-medium">{stats.streakDays}d</p>
                    <p className="text-[#5a5a5a] text-xs">Streak</p>
                  </div>
                </div>
              </div>

              {/* Score Breakdown */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1a1a1a]">
                  <p className="text-[#5a5a5a] text-xs mb-1">Journal</p>
                  <p className="text-[#a855f7] font-semibold">+{clarityScore.breakdown?.journal || 0}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1a1a1a]">
                  <p className="text-[#5a5a5a] text-xs mb-1">Kill List</p>
                  <p className="text-[#ef4444] font-semibold">+{clarityScore.breakdown?.killList || 0}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1a1a1a]">
                  <p className="text-[#5a5a5a] text-xs mb-1">Hard Lessons</p>
                  <p className="text-[#f59e0b] font-semibold">+{clarityScore.breakdown?.hardLessons || 0}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1a1a1a]">
                  <p className="text-[#5a5a5a] text-xs mb-1">Mirror</p>
                  <p className="text-[#4da6ff] font-semibold">+{clarityScore.breakdown?.blackMirror || 0}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1a1a1a]">
                  <p className="text-[#5a5a5a] text-xs mb-1">Awareness</p>
                  <p className="text-[#22c55e] font-semibold">+{clarityScore.breakdown?.relapseAwareness || 0}</p>
                </div>
                <div className="bg-[#0a0a0a] rounded-xl p-3 border border-[#1a1a1a]">
                  <p className="text-[#5a5a5a] text-xs mb-1">Bonuses</p>
                  <p className="text-[#00d4aa] font-semibold">+{clarityScore.breakdown?.bonuses || 0}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Grid - Oura Score Cards */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Your Stats</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <ScoreCard score={stats.streakDays} label="Streak" sublabel="Days strong" color="#00d4aa" icon="🔥" size="small" />
            <ScoreCard score={stats.killTargets} label="Targets" sublabel="Eliminated" color="#ef4444" icon="🎯" size="small" />
            <ScoreCard score={stats.hardLessons} label="Lessons" sublabel="Extracted" color="#f59e0b" icon="⚡" size="small" />
            <ScoreCard score={stats.journalEntries} label="Journal" sublabel="Entries" color="#a855f7" icon="📝" size="small" />
            <ScoreCard score={stats.blackMirrorEntries || 0} label="Mirror" sublabel="Checks" color="#4da6ff" icon="📱" size="small" />
            <ScoreCard score={clarityScore.journalStreak || 0} label="Journal" sublabel="Day streak" color="#22c55e" icon="📅" size="small" />
          </div>
        </section>

        {/* Quick Actions - Oura Style */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Link to="/journal" className="oura-card p-5 group hover:border-[#a855f7]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#a855f7]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="text-2xl">📝</span>
              </div>
              <h4 className="text-white font-medium mb-1">Journal</h4>
              <p className="text-[#5a5a5a] text-sm">Reflect & process</p>
            </Link>
            
            <Link to="/killlist" className="oura-card p-5 group hover:border-[#ef4444]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="text-2xl">🎯</span>
              </div>
              <h4 className="text-white font-medium mb-1">Kill List</h4>
              <p className="text-[#5a5a5a] text-sm">Eliminate patterns</p>
            </Link>
            
            <Link to="/hardlessons" className="oura-card p-5 group hover:border-[#f59e0b]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#f59e0b]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="text-2xl">⚡</span>
              </div>
              <h4 className="text-white font-medium mb-1">Hard Lessons</h4>
              <p className="text-[#5a5a5a] text-sm">Turn pain to wisdom</p>
            </Link>
            
            <Link to="/blackmirror" className="oura-card p-5 group hover:border-[#4da6ff]/50 transition-all">
              <div className="w-12 h-12 rounded-2xl bg-[#4da6ff]/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <span className="text-2xl">📱</span>
              </div>
              <h4 className="text-white font-medium mb-1">Black Mirror</h4>
              <p className="text-[#5a5a5a] text-sm">Reality check</p>
            </Link>
          </div>
        </section>

        {/* Kill List Dashboard */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <KillListDashboard />
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
                </div>
              )}
            </div>
          </section>

          {/* AI Insights */}
          <section>
            <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-4">AI Insights</h3>
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
                </div>
              )}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
