
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import { readUserData } from '../utils/firebaseUtils';
import { enableAnonymousAuth } from '../firebase';
import { aiUtils } from '../utils/aiUtils';
import { clarityScoreUtils } from '../utils/clarityScore';
import KillListDashboard from '../components/KillListDashboard';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    journalEntries: 0,
    relapseEntries: 0,
    streakDays: 0,
    killTargets: 0,
    compassChecks: 0
  });
  const [recentEntries, setRecentEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiActionSteps, setAiActionSteps] = useState([]);
  const [clarityScore, setClarityScore] = useState({
    totalScore: 0,
    rank: { rank: 'Clarity Novice', icon: '🌱', color: 'text-gray-500' },
    isFrozen: false,
    breakdown: {}
  });

  const auth = getAuth();

  // Authentication effect
  useEffect(() => {
    const authenticateUser = async () => {
      if (!auth.currentUser) {
        try {
          console.log("🔐 Dashboard: No user found, attempting anonymous authentication...");
          const authenticatedUser = await enableAnonymousAuth();
          setUser(authenticatedUser);
          console.log("✅ Dashboard: Anonymous authentication successful:", authenticatedUser.uid);
        } catch (error) {
          console.error("❌ Dashboard: Authentication failed:", error);
        }
      } else {
        setUser(auth.currentUser);
      }
    };

    authenticateUser();

    // Listen for auth state changes
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        console.log("👤 Dashboard: User authenticated:", user.uid);
      }
    });

    // Add window debugging functions
    window.debugDashboard = {
      user: () => user,
      auth: () => auth.currentUser,
      reload: loadDashboardData,
      testData: async () => {
        console.log("🧪 Creating test data...");
        try {
          const { writeData } = await import('../utils/firebaseUtils.js');
          const testEntry = await writeData('journalEntries', {
            content: "Test entry from Dashboard debug",
            mood: "🔥 Burning",
            intensity: 8,
            oracleJudgment: "This is a test Oracle judgment from the dashboard."
          });
          console.log("✅ Test entry created:", testEntry.id);
          loadDashboardData(); // Reload dashboard after creating test data
        } catch (error) {
          console.error("❌ Test data creation failed:", error);
        }
      }
    };

    return () => {
      unsubscribeAuth();
      delete window.debugDashboard;
    };
  }, []);

  // Load data when user is authenticated
  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    if (!user) {
      console.log("⏳ Dashboard: Waiting for user authentication...");
      return;
    }

    try {
      console.log("📡 Dashboard: Loading data for user:", user.uid);
      
      // Load data in parallel for better performance
      const [journalEntries, relapseEntries, killTargets, compassChecks, blackMirrorEntries] = await Promise.all([
        readUserData('journalEntries').then(data => {
          console.log("📔 Dashboard: Journal entries loaded:", data?.length || 0);
          if (data && data.length > 0) {
            console.log("📔 Sample journal entry:", data[0]);
          }
          return data || [];
        }),
        readUserData('relapseEntries').then(data => {
          console.log("⚠️ Dashboard: Relapse entries loaded:", data?.length || 0);
          if (data && data.length > 0) {
            console.log("⚠️ Sample relapse entry:", data[0]);
          }
          return data || [];
        }),
        readUserData('killTargets').then(data => {
          console.log("🎯 Dashboard: Kill targets loaded:", data?.length || 0);
          if (data && data.length > 0) {
            console.log("🎯 Sample kill target:", data[0]);
          }
          return data || [];
        }),
        readUserData('compassChecks').then(data => {
          console.log("🧭 Dashboard: Compass checks loaded:", data?.length || 0);
          if (data && data.length > 0) {
            console.log("🧭 Sample compass check:", data[0]);
          }
          return data || [];
        }),
        readUserData('blackMirrorEntries').then(data => {
          console.log("📱 Dashboard: Black mirror entries loaded:", data?.length || 0);
          if (data && data.length > 0) {
            console.log("📱 Sample black mirror entry:", data[0]);
          }
          return data || [];
        })
      ]);

      console.log("📊 Dashboard: Data loaded:", {
        journalEntries: journalEntries.length,
        relapseEntries: relapseEntries.length,
        killTargets: killTargets.length,
        compassChecks: compassChecks.length,
        blackMirrorEntries: blackMirrorEntries.length
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
        compassChecks: compassChecks.length,
        blackMirrorEntries: blackMirrorEntries.length
      });

      // Get recent entries from all sources
      const allEntries = [
        ...journalEntries.slice(0, 3).map(e => ({ ...e, type: 'journal' })),
        ...relapseEntries.slice(0, 2).map(e => ({ ...e, type: 'relapse' })),
        ...compassChecks.slice(0, 2).map(e => ({ ...e, type: 'compass' })),
        ...blackMirrorEntries.slice(0, 2).map(e => ({ ...e, type: 'blackmirror' }))
      ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

      setRecentEntries(allEntries);
      
      // Generate AI action steps based on user data
      const userData = {
        recentMood: journalEntries[0]?.mood || 'neutral',
        killListProgress: killTargets.length > 0 ? (killTargets.filter(t => t.status === 'completed').length / killTargets.length * 100) : 0,
        compassOverall: compassChecks.length > 0 ? 
          (Object.values(compassChecks[0]).filter(v => typeof v === 'number').reduce((a, b) => a + b, 0) / 5) : 5
      };
      
      const actionSteps = aiUtils.generateActionSteps(userData);
      setAiActionSteps(actionSteps);

      // Calculate clarity score
      const allUserData = { journalEntries, relapseEntries, killTargets, compassChecks, blackMirrorEntries };
      const scoreData = await clarityScoreUtils.calculateClarityScore(allUserData);
      const rank = clarityScoreUtils.getClarityRank(scoreData.totalScore);
      setClarityScore({ ...scoreData, rank });
    } catch (error) {
      console.error("❌ Dashboard: Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">
            {!user ? "Authenticating..." : "Loading dashboard..."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">🎯 Inner Ops Dashboard</h1>
        <p className="text-gray-400">Clarity Over Comfort - Your mission control center</p>
      </div>

      {/* Clarity Score Banner */}
      <div className="bg-gradient-to-r from-purple-900 to-blue-900 rounded-lg p-6 mb-8 border border-purple-500/30">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {clarityScore.rank.icon} {clarityScore.rank.rank}
            </h2>
            <p className="text-gray-300">Clarity Score: <span className={`text-3xl font-bold ${clarityScore.rank.color}`}>{clarityScore.totalScore}</span></p>
            {clarityScore.relapseAwarenessEntries > 0 && (
              <div className="mt-2 p-2 bg-green-900/50 border border-green-500/50 rounded">
                <p className="text-green-300 text-sm">✨ Self-awareness bonus: {clarityScore.relapseAwarenessEntries} entries (+{clarityScore.breakdown.relapseAwareness || 0} points)</p>
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400 space-y-1">
              <div>Journal: +{clarityScore.breakdown.journal || 0}</div>
              <div>Kill List: +{clarityScore.breakdown.killList || 0}</div>
              <div>Black Mirror: +{clarityScore.breakdown.blackMirror || 0}</div>
              <div>Awareness: +{clarityScore.breakdown.relapseAwareness || 0}</div>
              <div>Bonuses: +{clarityScore.breakdown.bonuses || 0}</div>
              {clarityScore.breakdown.completionRate !== undefined && (
                <div className={`text-xs ${clarityScore.breakdown.completionRate >= 0.6 ? 'text-green-400' : clarityScore.breakdown.completionRate >= 0.4 ? 'text-yellow-400' : 'text-red-400'}`}>
                  Completion: {(clarityScore.breakdown.completionRate * 100).toFixed(0)}% (×{clarityScore.breakdown.completionMultiplier.toFixed(1)})
                </div>
              )}
            </div>
          </div>
        </div>
      </div>        {/* Firebase Status Debug Info */}
        {user && (
          <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-blue-500/30">
            <h2 className="text-lg font-bold text-blue-400 mb-3">🔧 Firebase Connection Status</h2>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">User:</span>
                <span className="text-green-400 ml-2">{user.uid}</span>
              </div>
              <div>
                <span className="text-gray-400">Auth Type:</span>
                <span className="text-blue-400 ml-2">{user.isAnonymous ? 'Anonymous' : 'Authenticated'}</span>
              </div>
              <div>
                <span className="text-gray-400">Project:</span>
                <span className="text-purple-400 ml-2">{getAuth().app.options.projectId}</span>
              </div>
              <div>
                <span className="text-gray-400">Loading:</span>
                <span className="text-yellow-400 ml-2">{loading ? 'Yes' : 'No'}</span>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button 
                onClick={() => window.debugDashboard?.reload()}
                className="px-3 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
              >
                Reload Data
              </button>
              <button 
                onClick={() => window.debugDashboard?.testData()}
                className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
              >
                Create Test Entry
              </button>
            </div>
          </div>
        )}

        {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Streak Days</p>
              <p className="text-2xl font-bold text-green-400">{stats.streakDays}</p>
            </div>
            <div className="text-3xl">🔥</div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Kill Targets</p>
              <p className="text-2xl font-bold text-red-400">{stats.killTargets}</p>
            </div>
            <div className="text-3xl">🎯</div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Journal Entries</p>
              <p className="text-2xl font-bold text-purple-400">{stats.journalEntries}</p>
            </div>
            <div className="text-3xl">📝</div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Black Mirror Checks</p>
              <p className="text-2xl font-bold text-purple-400">{stats.blackMirrorEntries}</p>
            </div>
            <div className="text-3xl">📱</div>
          </div>
        </div>

        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-400 text-sm">Journal Streak</p>
              <p className="text-2xl font-bold text-yellow-400">{clarityScore.journalStreak}</p>
            </div>
            <div className="text-3xl">🔥</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Kill List Dashboard - Full Width */}
        <div className="lg:col-span-3">
          <KillListDashboard />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link
              to="/journal"
              className="flex items-center p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <span className="text-2xl mr-3">📝</span>
              <span className="text-white">Write Journal Entry</span>
            </Link>
            <Link
              to="/killlist"
              className="flex items-center p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <span className="text-2xl mr-3">🎯</span>
              <span className="text-white">Add Kill Target</span>
            </Link>
            <Link
              to="/blackmirror"
              className="flex items-center p-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
            >
              <span className="text-2xl mr-3">📱</span>
              <span className="text-white">Black Mirror Check</span>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">Recent Activity</h2>
          {recentEntries.length > 0 ? (
            <div className="space-y-3">
              {recentEntries.map((entry, index) => (
                <div key={index} className="p-3 bg-gray-700 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-blue-400">
                      {entry.type === 'journal' && '📝 Journal'}
                      {entry.type === 'relapse' && '⚠️ Relapse'}
                      {entry.type === 'compass' && '🧭 Compass'}
                      {entry.type === 'blackmirror' && '📱 Black Mirror'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-gray-300 text-sm">
                    {entry.content || entry.reflection || entry.notes || 'No content'}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">No recent activity</p>
          )}
        </div>

        {/* AI Action Steps */}
        <div className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-xl font-bold text-white mb-4">🤖 AI Recommended Actions</h2>
          {aiActionSteps.length > 0 ? (
            <div className="space-y-3">
              {aiActionSteps.map((step, index) => (
                <div key={index} className="p-3 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border border-purple-500/30 rounded-lg">
                  <p className="text-purple-200 text-sm">{step}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-400">Keep using the app to get personalized recommendations</p>
          )}
        </div>
      </div>
    </div>
  );
}
