import React, { useState, useEffect } from 'react';
import { 
  updateDoc, 
  doc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { generateAIFeedback } from '../utils/aiFeedback';
import { useTodaysKillTargets } from '../hooks/useKillTargets';
import OracleModal from './OracleModal';

const KillListDashboard = () => {
  // Use the custom hook for today's kill targets with all functions
  const { 
    targets: todaysTargets, 
    loading, 
    error, 
    refetch, 
    stats,
    markAsKilled,
    markAsEscaped,
    markAsActive,
    toggleTargetStatus,
    updateReflectionNote,
    clearReflectionNote
  } = useTodaysKillTargets(true); // Enable real-time updates
  
  const [updating, setUpdating] = useState({});
  const [reflectionNotes, setReflectionNotes] = useState({});
  const [showReflection, setShowReflection] = useState({});
  const [initialLoad, setInitialLoad] = useState(true); // Track if this is the first load
  const [oracleModal, setOracleModal] = useState({ 
    isOpen: false, 
    target: null, 
    feedback: '' 
  });
  const [oracleFeedbacks, setOracleFeedbacks] = useState({}); // Store Oracle feedbacks

  // Mark initial load as complete once data is loaded
  useEffect(() => {
    if (!loading) {
      setInitialLoad(false);
    }
  }, [loading]);

  // Initialize reflection notes when targets load
  useEffect(() => {
    const notes = {};
    todaysTargets.forEach(target => {
      if (target.reflectionNotes) {
        notes[target.id] = target.reflectionNotes;
      }
    });
    setReflectionNotes(notes);
  }, [todaysTargets]);

  // Remove the old loadTodaysTargets function since we're using the hook
  // ...existing code...

  const updateTargetStatus = async (targetId, newStatus) => {
    setUpdating(prev => ({ ...prev, [targetId]: true }));

    try {
      // Use the hook's toggle functions instead of manual updateDoc
      await toggleTargetStatus(targetId, newStatus);
      console.log(`✅ Target ${newStatus}: ${targetId}`);
    } catch (error) {
      console.error("Error updating target status:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [targetId]: false }));
    }
  };

  // Quick toggle functions using the hook
  const handleQuickKill = async (targetId) => {
    setUpdating(prev => ({ ...prev, [targetId]: true }));
    try {
      await markAsKilled(targetId);
    } catch (error) {
      console.error("Error marking as killed:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [targetId]: false }));
    }
  };

  const handleQuickEscape = async (targetId) => {
    setUpdating(prev => ({ ...prev, [targetId]: true }));
    try {
      await markAsEscaped(targetId);
    } catch (error) {
      console.error("Error marking as escaped:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [targetId]: false }));
    }
  };

  const handleQuickReset = async (targetId) => {
    setUpdating(prev => ({ ...prev, [targetId]: true }));
    try {
      await markAsActive(targetId);
    } catch (error) {
      console.error("Error resetting to active:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [targetId]: false }));
    }
  };

  // Cycle through statuses: active -> killed -> escaped -> active
  const handleStatusCycle = async (target) => {
    setUpdating(prev => ({ ...prev, [target.id]: true }));
    try {
      const statusCycle = {
        'active': 'killed',
        'killed': 'escaped', 
        'escaped': 'active'
      };
      
      const newStatus = statusCycle[target.status] || 'active';
      await toggleTargetStatus(target.id, newStatus);
    } catch (error) {
      console.error("Error cycling status:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [target.id]: false }));
    }
  };

  const saveReflectionNotes = async (targetId) => {
    const notes = reflectionNotes[targetId];
    if (!notes || notes.trim() === '') return;

    setUpdating(prev => ({ ...prev, [targetId]: true }));

    try {
      await updateReflectionNote(targetId, notes);
      console.log(`✅ Reflection notes saved for target: ${targetId}`);
    } catch (error) {
      console.error("Error saving reflection notes:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [targetId]: false }));
    }
  };

  // Clear reflection notes for a target
  const handleClearReflection = async (targetId) => {
    setUpdating(prev => ({ ...prev, [targetId]: true }));
    try {
      await clearReflectionNote(targetId);
      setReflectionNotes(prev => ({ ...prev, [targetId]: '' }));
      console.log(`✅ Reflection notes cleared for target: ${targetId}`);
    } catch (error) {
      console.error("Error clearing reflection notes:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [targetId]: false }));
    }
  };

  // Open Oracle modal for AI insights
  const openOracleModal = (target) => {
    setOracleModal({
      isOpen: true,
      target: target,
      feedback: ''
    });
  };

  // Handle Oracle feedback generation and save it
  const handleOracleFeedbackGenerated = async (targetId, feedback) => {
    setOracleFeedbacks(prev => ({ ...prev, [targetId]: feedback }));
    
    // Save Oracle feedback by appending to existing reflection notes
    try {
      const currentReflection = reflectionNotes[targetId] || '';
      const separator = currentReflection ? '\n\n---\n\n' : '';
      const updatedReflection = `${currentReflection}${separator}🔮 Oracle's Wisdom:\n${feedback}`;
      
      await updateReflectionNote(targetId, updatedReflection);
      
      // Update local state to reflect the change
      setReflectionNotes(prev => ({ ...prev, [targetId]: updatedReflection }));
    } catch (error) {
      console.error("Error saving Oracle feedback:", error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'killed': return 'text-green-400 bg-green-900/30 border-green-500/50';
      case 'escaped': return 'text-red-400 bg-red-900/30 border-red-500/50';
      case 'active': return 'text-yellow-400 bg-yellow-900/30 border-yellow-500/50';
      default: return 'text-gray-400 bg-gray-900/30 border-gray-500/50';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-red-400';
      case 'medium': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'high': return '🔴';
      case 'medium': return '🟡';
      case 'low': return '🟢';
      default: return '⚪';
    }
  };

  if (initialLoad && loading) {
    return (
      <div className="oura-card p-8">
        <div className="flex items-center justify-center h-32">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-[#1a1a1a]"></div>
            <div className="absolute inset-0 rounded-full border-2 border-[#ef4444] border-t-transparent animate-spin"></div>
          </div>
          <span className="ml-4 text-[#5a5a5a] text-sm font-light">Loading targets...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="oura-card p-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#ef4444]/10 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 22h20L12 2z" />
              <line x1="12" y1="9" x2="12" y2="14" />
              <circle cx="12" cy="18" r="1" fill="#ef4444" stroke="none" />
            </svg>
          </div>
          <h3 className="text-lg font-light text-white mb-2">Error Loading Targets</h3>
          <p className="text-[#5a5a5a] text-sm mb-6">{error}</p>
          <button 
            onClick={refetch}
            className="px-6 py-3 bg-[#1a1a1a] text-white text-sm font-light rounded-xl border border-[#2a2a2a] hover:border-[#3a3a3a] hover:bg-[#2a2a2a] transition-all"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (todaysTargets.length === 0) {
    return (
      <div className="oura-card p-8">
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 relative">
            <svg viewBox="0 0 80 80" className="w-full h-full">
              {/* Outer ring */}
              <circle cx="40" cy="40" r="36" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              <circle cx="40" cy="40" r="36" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="226" strokeDashoffset="170" strokeLinecap="round" opacity="0.3" />
              {/* Middle ring */}
              <circle cx="40" cy="40" r="26" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              <circle cx="40" cy="40" r="26" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="163" strokeDashoffset="120" strokeLinecap="round" opacity="0.5" />
              {/* Inner ring */}
              <circle cx="40" cy="40" r="16" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              <circle cx="40" cy="40" r="16" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="100" strokeDashoffset="75" strokeLinecap="round" opacity="0.7" />
              {/* Center dot */}
              <circle cx="40" cy="40" r="4" fill="#ef4444" opacity="0.9" />
            </svg>
          </div>
          <h3 className="text-xl font-light text-white mb-2">No Targets Set</h3>
          <p className="text-[#5a5a5a] text-sm mb-6 max-w-xs mx-auto">Define what you're eliminating today to track your progress.</p>
          <button 
            onClick={() => window.location.href = '/killlist'}
            className="px-6 py-3 bg-[#ef4444] text-white text-sm font-medium rounded-xl hover:bg-[#dc2626] transition-all hover:shadow-lg hover:shadow-[#ef4444]/20"
          >
            Set Today's Targets
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="oura-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#ef4444]/10 flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" opacity="0.6" />
              <circle cx="12" cy="12" r="2" fill="#ef4444" stroke="none" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-light text-white">Today's Targets</h2>
            <p className="text-[#5a5a5a] text-sm font-light">
              <span className="text-[#22c55e]">{stats.killed} killed</span>
              <span className="mx-2">•</span>
              <span className="text-[#f59e0b]">{stats.escaped} escaped</span>
              <span className="mx-2">•</span>
              <span className="text-[#4da6ff]">{stats.active} active</span>
              {stats.total > 0 && (
                <span className="ml-3 text-[#5a5a5a]">
                  {stats.completionRate.toFixed(0)}%
                </span>
              )}
            </p>
          </div>
        </div>
        <button 
          onClick={() => window.location.href = '/killlist'}
          className="px-4 py-2 text-sm font-light text-[#5a5a5a] border border-[#2a2a2a] rounded-xl hover:text-white hover:border-[#3a3a3a] hover:bg-[#1a1a1a] transition-all"
        >
          Manage All
        </button>
      </div>

      <div className="space-y-4">
        {todaysTargets.map((target) => (
          <div key={target.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">{getPriorityIcon(target.priority)}</span>
                  <h3 className="font-semibold text-white">{target.title}</h3>
                  <span className={`px-2 py-1 text-xs rounded border ${getStatusColor(target.status)}`}>
                    {target.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-gray-300 text-sm mb-2">{target.description}</p>
                <div className="flex items-center gap-4 text-xs text-gray-400">
                  <span className={getPriorityColor(target.priority)}>
                    {target.priority.toUpperCase()} PRIORITY
                  </span>
                  {target.completedAt && (
                    <span>
                      Completed: {target.completedAt.toLocaleTimeString()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Status Toggle Buttons */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => handleQuickKill(target.id)}
                disabled={updating[target.id] || target.status === 'killed'}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  target.status === 'killed'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-green-600 hover:text-white'
                } disabled:opacity-50`}
              >
                {updating[target.id] ? '⏳' : '✅'} Killed
              </button>
              <button
                onClick={() => handleQuickEscape(target.id)}
                disabled={updating[target.id] || target.status === 'escaped'}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  target.status === 'escaped'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-red-600 hover:text-white'
                } disabled:opacity-50`}
              >
                {updating[target.id] ? '⏳' : '❌'} Escaped
              </button>
              <button
                onClick={() => handleQuickReset(target.id)}
                disabled={updating[target.id] || target.status === 'active'}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  target.status === 'active'
                    ? 'bg-yellow-600 text-white'
                    : 'bg-gray-600 text-gray-300 hover:bg-yellow-600 hover:text-white'
                } disabled:opacity-50`}
              >
                {updating[target.id] ? '⏳' : '🔄'} Reset
              </button>
              <button
                onClick={() => handleStatusCycle(target)}
                disabled={updating[target.id]}
                className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 transition-colors"
                title={`Quick toggle: ${target.status} → ${
                  target.status === 'active' ? 'killed' : 
                  target.status === 'killed' ? 'escaped' : 'active'
                }`}
              >
                {updating[target.id] ? '⏳' : '�'}
              </button>
            </div>

            {/* Reflection Notes */}
            <div className="border-t border-gray-600 pt-3">
              <button
                onClick={() => setShowReflection(prev => ({ 
                  ...prev, 
                  [target.id]: !prev[target.id] 
                }))}
                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors mb-2"
              >
                📝 Reflection Notes
                <span className="text-xs">
                  {showReflection[target.id] ? '▼' : '▶'}
                </span>
              </button>

              {showReflection[target.id] && (
                <div className="space-y-3">
                  <textarea
                    value={reflectionNotes[target.id] || ''}
                    onChange={(e) => setReflectionNotes(prev => ({
                      ...prev,
                      [target.id]: e.target.value
                    }))}
                    placeholder="How did this target challenge you? What did you learn?"
                    className="w-full h-20 p-2 bg-gray-600 text-white border border-gray-500 rounded text-sm resize-none focus:outline-none focus:border-blue-500"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveReflectionNotes(target.id)}
                      disabled={updating[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {updating[target.id] ? '⏳' : '💾'} Save Notes
                    </button>
                    <button
                      onClick={() => handleClearReflection(target.id)}
                      disabled={updating[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                      {updating[target.id] ? '⏳' : '🗑️'} Clear
                    </button>
                    <button
                      onClick={() => openOracleModal(target)}
                      className="px-3 py-1 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition-colors"
                    >
                      🔮 Seek Oracle
                    </button>
                  </div>

                  {/* Oracle Wisdom Display */}
                  {oracleFeedbacks[target.id] && (
                    <div className="mt-3 p-3 bg-gray-800/50 border border-purple-500/30 rounded-lg">
                      <h4 className="text-purple-300 font-medium text-sm mb-2">🔮 Oracle's Stored Wisdom</h4>
                      <div className="text-purple-200 text-xs leading-relaxed italic bg-gray-700/50 rounded p-2">
                        {oracleFeedbacks[target.id]}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 pt-4 border-t border-gray-600">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-green-400">{stats.killed}</div>
            <div className="text-xs text-gray-400">Killed</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{stats.escaped}</div>
            <div className="text-xs text-gray-400">Escaped</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-400">{stats.active}</div>
            <div className="text-xs text-gray-400">Active</div>
          </div>
        </div>
        {stats.total > 0 && (
          <div className="mt-3 text-center">
            <div className="text-sm text-gray-400">
              Completion Rate: <span className={`font-semibold ${
                stats.completionRate >= 80 ? 'text-green-400' : 
                stats.completionRate >= 60 ? 'text-yellow-400' : 'text-red-400'
              }`}>
                {stats.completionRate.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => setOracleModal({ isOpen: false, target: null, feedback: '' })}
        target={oracleModal.target}
        moduleName="Kill List"
        onFeedbackGenerated={(feedback) => {
          if (oracleModal.target) {
            handleOracleFeedbackGenerated(oracleModal.target.id, feedback);
          }
        }}
      />
    </div>
  );
};

export default KillListDashboard;
