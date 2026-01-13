import React, { useState, useEffect, useCallback } from 'react';
import { 
  updateDoc, 
  doc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';
import { generateAIFeedback } from '../utils/aiFeedback';
import { useTodaysKillTargets } from '../hooks/useKillTargets';
import OracleModal from './OracleModal';
import { AppIcon } from './AppIcons';
import { SkeletonList, SkeletonKillTarget } from './SkeletonLoader';
import logger from '../utils/logger';

const KillListDashboard = React.memo(function KillListDashboard() {
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
      logger.log(`✅ Target ${newStatus}: ${targetId}`);
    } catch (error) {
      logger.error("Error updating target status:", error);
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
      logger.error("Error marking as killed:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [targetId]: false }));
    }
  };

  const handleQuickEscape = async (targetId) => {
    setUpdating(prev => ({ ...prev, [targetId]: true }));
    try {
      await markAsEscaped(targetId);
    } catch (error) {
      logger.error("Error marking as escaped:", error);
    } finally {
      setUpdating(prev => ({ ...prev, [targetId]: false }));
    }
  };

  const handleQuickReset = async (targetId) => {
    setUpdating(prev => ({ ...prev, [targetId]: true }));
    try {
      await markAsActive(targetId);
    } catch (error) {
      logger.error("Error resetting to active:", error);
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
      logger.error("Error cycling status:", error);
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
      logger.log(`✅ Reflection notes saved for target: ${targetId}`);
    } catch (error) {
      logger.error("Error saving reflection notes:", error);
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
      logger.log(`✅ Reflection notes cleared for target: ${targetId}`);
    } catch (error) {
      logger.error("Error clearing reflection notes:", error);
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
      logger.error("Error saving Oracle feedback:", error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'killed': return 'text-[#22c55e] bg-[#22c55e]/10 border-[#22c55e]/30';
      case 'escaped': return 'text-[#ef4444] bg-[#ef4444]/10 border-[#ef4444]/30';
      case 'active': return 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/30';
      default: return 'text-[#5a5a5a] bg-[#1a1a1a] border-[#2a2a2a]';
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'text-[#ef4444]';
      case 'medium': return 'text-[#f59e0b]';
      case 'low': return 'text-[#22c55e]';
      default: return 'text-[#5a5a5a]';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'high': return <span className="w-2 h-2 rounded-full bg-[#ef4444] inline-block" style={{ boxShadow: '0 0 8px #ef4444' }}></span>;
      case 'medium': return <span className="w-2 h-2 rounded-full bg-[#f59e0b] inline-block" style={{ boxShadow: '0 0 8px #f59e0b' }}></span>;
      case 'low': return <span className="w-2 h-2 rounded-full bg-[#22c55e] inline-block" style={{ boxShadow: '0 0 8px #22c55e' }}></span>;
      default: return <span className="w-2 h-2 rounded-full bg-[#5a5a5a] inline-block"></span>;
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

      {loading ? (
        <SkeletonList count={2} ItemComponent={SkeletonKillTarget} />
      ) : (
        <div className="space-y-4">
          {todaysTargets.map((target) => (
          <div key={target.id} className="bg-[#0a0a0a] rounded-2xl p-5 border border-[#1a1a1a] hover:border-[#2a2a2a] transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  {getPriorityIcon(target.priority)}
                  <h3 className="font-medium text-white">{target.title}</h3>
                  <span className={`px-2 py-0.5 text-xs font-light rounded-full border ${getStatusColor(target.status)}`}>
                    {target.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-[#8a8a8a] text-sm mb-3 font-light">{target.description}</p>
                <div className="flex items-center gap-4 text-xs text-[#5a5a5a]">
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
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => handleQuickKill(target.id)}
                disabled={updating[target.id] || target.status === 'killed'}
                className={`px-4 py-2 text-sm font-light rounded-xl transition-all ${
                  target.status === 'killed'
                    ? 'bg-[#22c55e] text-black'
                    : 'bg-[#1a1a1a] text-[#8a8a8a] border border-[#2a2a2a] hover:border-[#22c55e]/50 hover:text-[#22c55e]'
                } disabled:opacity-50`}
              >
                <span className="flex items-center gap-2">
                  <AppIcon name="check" size={14} color={target.status === 'killed' ? '#000' : '#22c55e'} glow={false} />
                  Killed
                </span>
              </button>
              <button
                onClick={() => handleQuickEscape(target.id)}
                disabled={updating[target.id] || target.status === 'escaped'}
                className={`px-4 py-2 text-sm font-light rounded-xl transition-all ${
                  target.status === 'escaped'
                    ? 'bg-[#ef4444] text-white'
                    : 'bg-[#1a1a1a] text-[#8a8a8a] border border-[#2a2a2a] hover:border-[#ef4444]/50 hover:text-[#ef4444]'
                } disabled:opacity-50`}
              >
                <span className="flex items-center gap-2">
                  <AppIcon name="relapse" size={14} color={target.status === 'escaped' ? '#fff' : '#ef4444'} glow={false} />
                  Escaped
                </span>
              </button>
              <button
                onClick={() => handleQuickReset(target.id)}
                disabled={updating[target.id] || target.status === 'active'}
                className={`px-4 py-2 text-sm font-light rounded-xl transition-all ${
                  target.status === 'active'
                    ? 'bg-[#f59e0b] text-black'
                    : 'bg-[#1a1a1a] text-[#8a8a8a] border border-[#2a2a2a] hover:border-[#f59e0b]/50 hover:text-[#f59e0b]'
                } disabled:opacity-50`}
              >
                <span className="flex items-center gap-2">
                  <AppIcon name="activity" size={14} color={target.status === 'active' ? '#000' : '#f59e0b'} glow={false} />
                  Reset
                </span>
              </button>
              <button
                onClick={() => handleStatusCycle(target)}
                disabled={updating[target.id]}
                className="px-3 py-2 text-xs bg-[#1a1a1a] text-[#a855f7] rounded-xl border border-[#2a2a2a] hover:border-[#a855f7]/50 disabled:opacity-50 transition-all"
                title={`Quick toggle: ${target.status} → ${
                  target.status === 'active' ? 'killed' : 
                  target.status === 'killed' ? 'escaped' : 'active'
                }`}
              >
                <AppIcon name="dashboard" size={14} color="#a855f7" glow={false} />
              </button>
            </div>

            {/* Reflection Notes */}
            <div className="border-t border-[#1a1a1a] pt-4">
              <button
                onClick={() => setShowReflection(prev => ({ 
                  ...prev, 
                  [target.id]: !prev[target.id] 
                }))}
                className="flex items-center gap-2 text-sm text-[#5a5a5a] hover:text-white transition-colors mb-3"
              >
                <AppIcon name="journal" size={14} color="#a855f7" glow={false} />
                <span className="font-light">Reflection Notes</span>
                <svg 
                  width="12" 
                  height="12" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  stroke="currentColor" 
                  strokeWidth="2"
                  className={`transition-transform ${showReflection[target.id] ? 'rotate-180' : ''}`}
                >
                  <polyline points="6,9 12,15 18,9" />
                </svg>
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
                    className="w-full h-24 p-4 bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded-xl text-sm font-light resize-none focus:outline-none focus:border-[#a855f7]/50 placeholder-[#3a3a3a] transition-all"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveReflectionNotes(target.id)}
                      disabled={updating[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-4 py-2 text-sm font-light bg-[#4da6ff] text-black rounded-xl hover:bg-[#3d96ef] disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      <AppIcon name="check" size={14} color="#000" glow={false} />
                      Save Notes
                    </button>
                    <button
                      onClick={() => handleClearReflection(target.id)}
                      disabled={updating[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-4 py-2 text-sm font-light bg-[#1a1a1a] text-[#ef4444] border border-[#2a2a2a] rounded-xl hover:border-[#ef4444]/50 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      <AppIcon name="relapse" size={14} color="#ef4444" glow={false} />
                      Clear
                    </button>
                    <button
                      onClick={() => openOracleModal(target)}
                      className="px-4 py-2 text-sm font-light bg-[#1a1a1a] text-[#a855f7] border border-[#2a2a2a] rounded-xl hover:border-[#a855f7]/50 transition-all flex items-center gap-2"
                    >
                      <AppIcon name="insight" size={14} color="#a855f7" glow={false} />
                      Seek Oracle
                    </button>
                  </div>

                  {/* Oracle Wisdom Display */}
                  {oracleFeedbacks[target.id] && (
                    <div className="mt-4 p-4 bg-[#0a0a0a] border border-[#a855f7]/30 rounded-xl">
                      <h4 className="text-[#a855f7] font-light text-sm mb-2 flex items-center gap-2">
                        <AppIcon name="insight" size={14} color="#a855f7" />
                        Oracle's Stored Wisdom
                      </h4>
                      <div className="text-[#8a8a8a] text-sm leading-relaxed font-light italic">
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
      )}

      {/* Stats Footer */}
      <div className="mt-6 pt-6 border-t border-[#1a1a1a]">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a]">
            <div className="text-2xl font-bold text-[#22c55e]" style={{ textShadow: '0 0 20px rgba(34, 197, 94, 0.3)' }}>{stats.killed}</div>
            <div className="text-xs text-[#5a5a5a] font-light mt-1">Killed</div>
          </div>
          <div className="text-center p-4 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a]">
            <div className="text-2xl font-bold text-[#ef4444]" style={{ textShadow: '0 0 20px rgba(239, 68, 68, 0.3)' }}>{stats.escaped}</div>
            <div className="text-xs text-[#5a5a5a] font-light mt-1">Escaped</div>
          </div>
          <div className="text-center p-4 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a]">
            <div className="text-2xl font-bold text-[#f59e0b]" style={{ textShadow: '0 0 20px rgba(245, 158, 11, 0.3)' }}>{stats.active}</div>
            <div className="text-xs text-[#5a5a5a] font-light mt-1">Active</div>
          </div>
        </div>
        {stats.total > 0 && (
          <div className="mt-4 text-center">
            <div className="text-sm text-[#5a5a5a] font-light">
              Completion Rate: <span className={`font-medium ${
                stats.completionRate >= 80 ? 'text-[#22c55e]' : 
                stats.completionRate >= 60 ? 'text-[#f59e0b]' : 'text-[#ef4444]'
              }`} style={{ 
                textShadow: stats.completionRate >= 80 
                  ? '0 0 10px rgba(34, 197, 94, 0.3)' 
                  : stats.completionRate >= 60 
                  ? '0 0 10px rgba(245, 158, 11, 0.3)' 
                  : '0 0 10px rgba(239, 68, 68, 0.3)'
              }}>
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
});

export default KillListDashboard;
