
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { readUserData } from '../utils/firebaseUtils';
import { aiUtils } from '../utils/aiUtils';
import { clarityScoreUtils } from '../utils/clarityScore';

export default function Dashboard() {
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

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Load data in parallel for better performance
      const [journalEntries, relapseEntries, killTargets, compassChecks, blackMirrorEntries] = await Promise.all([
        readUserData('journalEntries'),
        readUserData('relapseEntries'),
        readUserData('killTargets'),
        readUserData('compassChecks'),
        readUserData('blackMirrorEntries')
      ]);

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
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
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
      </div>

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
