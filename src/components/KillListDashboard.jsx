import React, { useState, useEffect, useRef } from 'react';
import { 
  updateDoc, 
  doc,
  serverTimestamp 
} from 'firebase/firestore';
import { getDb } from '../firebase';
import { writeData, deleteData } from '../utils/firebaseUtils';
import { useActiveKillTargets } from '../hooks/useKillTargets';
import OracleModal from './OracleModal';
import KillClosureModal from './KillClosureModal';
import { AppIcon } from './AppIcons';
import { SkeletonList, SkeletonKillTarget } from './SkeletonLoader';
import logger from '../utils/logger';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import { generateAIFeedback } from '../utils/aiFeedback';
import { composeClosureFeedback } from '../utils/composeClosureFeedback';
import ouraToast from '../utils/toast';
import { KillTargetSummary } from './KillTargetCard';

const KillListDashboard = React.memo(function KillListDashboard() {
  // Use all active targets (not just today's)
  const {
    targets: todaysTargets,
    loading,
    error,
    stats,
    refetch,
    toggleTargetStatus,
    markAsEscaped,
    markAsActive,
    updateReflectionNote,
    clearReflectionNote,
  } = useActiveKillTargets(true);
  
  const [updating, setUpdating] = useState({});
  const [reflectionNotes, setReflectionNotes] = useState({});
  const [showReflection, setShowReflection] = useState({});
  const [initialLoad, setInitialLoad] = useState(true); // Track if this is the first load
  const [oracleModal, setOracleModal] = useState({
    isOpen: false,
    target: null,
    feedback: '',
    entryCount: null,
  });
  const [oracleFeedbacks, setOracleFeedbacks] = useState({}); // Store Oracle feedbacks
  const [closureModal, setClosureModal] = useState({
    isOpen: false,
    mode: 'kill',    // 'kill' | 'escape'
    target: null,
    oraclePhase: 'idle', // 'idle' | 'loading' | 'done'
    oracleResponse: '',
  });
  // Tracks whether the modal was dismissed mid-Oracle so we can persist
  // the response and surface it via toast when it eventually arrives.
  const closureDismissedRef = useRef(false);

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

  // Kill / escape flows both require a closing entry — open the modal in
  // the appropriate mode. Mode drives the prompt, tags, and Oracle framing.
  const openClosureModal = (target, mode) => {
    closureDismissedRef.current = false;
    setClosureModal({
      isOpen: true,
      mode,
      target,
      oraclePhase: 'idle',
      oracleResponse: '',
    });
  };

  const handleQuickKill = (target) => openClosureModal(target, 'kill');
  const handleQuickEscape = (target) => openClosureModal(target, 'escape');

  const handleClosureSubmit = async ({ note, tags }) => {
    const { target, mode } = closureModal;
    if (!target) return;
    setUpdating(prev => ({ ...prev, [target.id]: true }));
    try {
      // 1. Persist the closure — BER-243 storage model.
      //    Kill: archive to confirmedKills, delete from killTargets.
      //    Escape: update killTargets with escape data (no move).
      let confirmedKillId = null;
      if (mode === 'kill') {
        const killedAt = new Date();
        const createdAtMs = target.createdAt instanceof Date
          ? target.createdAt.getTime()
          : new Date(target.createdAt || 0).getTime();
        const rawDuration = Math.floor((killedAt.getTime() - createdAtMs) / (1000 * 60 * 60 * 24));
        const activeDuration = isNaN(rawDuration) || rawDuration < 0 ? 0 : rawDuration;
        const { id: _removeId, ...targetFields } = target;
        const confirmedKillDoc = await writeData('confirmedKills', {
          ...targetFields,
          closureNote: note,
          closureTags: Array.isArray(tags) ? tags : [],
          killedAt,
          activeDuration,
        });
        confirmedKillId = confirmedKillDoc.id;
        await deleteData('killTargets', target.id);
      } else {
        await markAsEscaped(target.id, { note, tags });
      }

      // 2. Transition to Oracle loading. User can dismiss from here.
      setClosureModal(prev => ({ ...prev, oraclePhase: 'loading' }));

      // 3. Oracle one-line response — runs regardless of whether modal
      //    stays open. If dismissed mid-call, we surface via toast instead.
      const entryText = mode === 'kill'
        ? `I just closed a kill contract: "${target.title}". What ended it: ${note}`
        : `A kill contract just broke on me: "${target.title}". What caught me: ${note}`;
      const pastTitles = todaysTargets.slice(0, 3).map(t => t.title);

      let feedback = null;
      try {
        feedback = await generateAIFeedback('killList', entryText, pastTitles);
      } catch (err) {
        logger.error('Oracle closure response error:', err);
      }
      const { oracleResponse, oracleClosingQuestion } = composeClosureFeedback(feedback, mode);

      // Persist the Oracle line. Kill records live in confirmedKills;
      // escape records remain in killTargets.
      try {
        const db = await getDb();
        if (mode === 'kill' && confirmedKillId) {
          const killRef = doc(db, 'confirmedKills', confirmedKillId);
          await updateDoc(killRef, {
            closureOracleResponse: oracleResponse,
            ...(oracleClosingQuestion ? { oracleClosingQuestion } : {}),
            lastUpdated: serverTimestamp(),
          });
        } else if (mode === 'escape') {
          const targetRef = doc(db, 'killTargets', target.id);
          await updateDoc(targetRef, {
            escapeOracleResponse: oracleResponse,
            ...(oracleClosingQuestion ? { oracleClosingQuestion } : {}),
            lastUpdated: serverTimestamp(),
          });
        }
      } catch (err) {
        logger.error('Error persisting Oracle closure response:', err);
      }

      if (closureDismissedRef.current) {
        ouraToast.info(`Oracle: ${oracleResponse}`);
      } else {
        setClosureModal(prev => ({
          ...prev,
          oraclePhase: 'done',
          oracleResponse,
        }));
      }

      ouraToast.success(
        mode === 'kill'
          ? `"${target.title}" eliminated`
          : `"${target.title}" breach logged`
      );
    } catch (error) {
      logger.error('Error during closure flow:', error);
      ouraToast.error('Failed to save');
      setClosureModal({ isOpen: false, mode: 'kill', target: null, oraclePhase: 'idle', oracleResponse: '' });
    } finally {
      setUpdating(prev => ({ ...prev, [target.id]: false }));
    }
  };

  const handleClosureClose = () => {
    // If the Oracle call is still in flight, mark dismissed so the result
    // becomes a toast instead of a modal update.
    if (closureModal.oraclePhase === 'loading') {
      closureDismissedRef.current = true;
    }
    setClosureModal({ isOpen: false, mode: 'kill', target: null, oraclePhase: 'idle', oracleResponse: '' });
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
      target,
      feedback: '',
      entryCount: getCachedTotalEntryCount(),
    });
  };

  const handleOracleReaction = async (reactionId) => {
    if (!oracleModal.target) return;
    try {
      const db = await getDb();
      const targetRef = doc(db, 'killTargets', oracleModal.target.id);
      await updateDoc(targetRef, { oracleReaction: reactionId });
    } catch (error) {
      logger.error('Error saving Oracle reaction:', error);
    }
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

  if (initialLoad && loading) {
    return (
      <div className="oura-card p-8">
        <div className="flex items-center justify-center h-32">
          <div className="relative w-12 h-12">
            <div className="absolute inset-0 rounded-full border-2 border-[#1a1a1a]"></div>
            <div className="absolute inset-0 rounded-full border-2 border-[#ef4444] border-t-transparent animate-spin"></div>
          </div>
          <span className="ml-4 text-[#858585] text-sm font-light">Loading targets...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="oura-card p-8">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[#1a1a1a] border border-[#b45309]/30 flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b45309" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 22h20L12 2z" />
              <line x1="12" y1="9" x2="12" y2="14" />
              <circle cx="12" cy="18" r="1" fill="#b45309" stroke="none" />
            </svg>
          </div>
          <h3 className="text-lg font-light text-white mb-2">Error Loading Targets</h3>
          <p className="text-[#858585] text-sm mb-6">{error}</p>
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
              <circle cx="40" cy="40" r="36" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="226" strokeDashoffset="170" strokeLinecap="round" opacity="0.25" />
              {/* Middle ring */}
              <circle cx="40" cy="40" r="26" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              <circle cx="40" cy="40" r="26" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="163" strokeDashoffset="120" strokeLinecap="round" opacity="0.4" />
              {/* Inner ring */}
              <circle cx="40" cy="40" r="16" fill="none" stroke="#1a1a1a" strokeWidth="2" />
              <circle cx="40" cy="40" r="16" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="100" strokeDashoffset="75" strokeLinecap="round" opacity="0.6" />
              {/* Center dot */}
              <circle cx="40" cy="40" r="4" fill="#ef4444" opacity="0.8" />
            </svg>
          </div>
          <h3 className="text-xl font-light text-white mb-2">No Active Contracts</h3>
          <p className="text-[#858585] text-sm mb-6 max-w-xs mx-auto">Name a pattern to eliminate and start building your streak.</p>
          <button
            onClick={() => window.location.href = '/ledger'}
            className="px-6 py-3 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#d1d1d1] transition-colors"
          >
            Start a Kill Contract
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="oura-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#1a1a1a] flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="6" opacity="0.6" />
              <circle cx="12" cy="12" r="2" fill="#ef4444" stroke="none" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-light text-white">Active Contracts</h2>
            <p className="text-[#858585] text-sm font-light">
              <span className="text-[#ef4444]">{stats.active} active</span>
            </p>
          </div>
        </div>
        <button 
          onClick={() => window.location.href = '/ledger'}
          className="px-4 py-2 text-sm font-light text-[#858585] border border-[#2a2a2a] rounded-xl hover:text-white hover:border-[#3a3a3a] hover:bg-[#1a1a1a] transition-all"
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
            {/* Shared summary block — same component the module page renders
                so the Dashboard surface and /ledger surface visually match. */}
            <div className="mb-4">
              <KillTargetSummary target={target} />
              {target.description && (
                <p className="text-[#ababab] text-sm mt-3 font-light">{target.description}</p>
              )}
              {target.completedAt && (
                <div className="text-xs text-[#858585] mt-2">
                  Completed: {target.completedAt.toLocaleTimeString()}
                </div>
              )}
            </div>

            {/* Status Toggle Buttons */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => handleQuickKill(target)}
                disabled={updating[target.id] || target.status === 'killed'}
                className={`px-4 py-2 text-sm font-light rounded-xl transition-all border ${
                  target.status === 'killed'
                    ? 'bg-[#1a1a1a] text-[#fca5a5] border-[#ef4444]/40'
                    : 'bg-transparent text-[#ababab] border-[#2a2a2a] hover:border-[#fca5a5]/50 hover:text-[#fca5a5]'
                } disabled:opacity-50`}
              >
                <span className="flex items-center gap-2">
                  <AppIcon name="check" size={14} color={target.status === 'killed' ? '#fca5a5' : '#8a8a8a'} glow={false} />
                  Killed
                </span>
              </button>
              <button
                onClick={() => handleQuickEscape(target)}
                disabled={updating[target.id] || target.status === 'escaped'}
                className={`px-4 py-2 text-sm font-light rounded-xl transition-all border ${
                  target.status === 'escaped'
                    ? 'bg-[#1a1a1a] text-[#b45309] border-[#b45309]/40'
                    : 'bg-transparent text-[#ababab] border-[#2a2a2a] hover:border-[#b45309]/50 hover:text-[#b45309]'
                } disabled:opacity-50`}
              >
                <span className="flex items-center gap-2">
                  <AppIcon name="relapse" size={14} color={target.status === 'escaped' ? '#b45309' : '#8a8a8a'} glow={false} />
                  Escaped
                </span>
              </button>
              <button
                onClick={() => handleQuickReset(target.id)}
                disabled={updating[target.id] || target.status === 'active'}
                className={`px-4 py-2 text-sm font-light rounded-xl transition-all border ${
                  target.status === 'active'
                    ? 'bg-[#1a1a1a] text-[#ef4444] border-[#ef4444]/40'
                    : 'bg-transparent text-[#ababab] border-[#2a2a2a] hover:border-[#ef4444]/50 hover:text-[#ef4444]'
                } disabled:opacity-50`}
              >
                <span className="flex items-center gap-2">
                  <AppIcon name="activity" size={14} color={target.status === 'active' ? '#ef4444' : '#8a8a8a'} glow={false} />
                  Reset
                </span>
              </button>
              <button
                onClick={() => handleStatusCycle(target)}
                disabled={updating[target.id]}
                className="px-3 py-2 text-xs bg-transparent text-[#858585] rounded-xl border border-[#2a2a2a] hover:border-[#3a3a3a] hover:text-[#ababab] disabled:opacity-50 transition-all"
                title={`Quick toggle: ${target.status} → ${
                  target.status === 'active' ? 'killed' :
                  target.status === 'killed' ? 'escaped' : 'active'
                }`}
              >
                <AppIcon name="dashboard" size={14} color="#5a5a5a" glow={false} />
              </button>
            </div>

            {/* Reflection Notes */}
            <div className="border-t border-[#1a1a1a] pt-4">
              <button
                onClick={() => setShowReflection(prev => ({ 
                  ...prev, 
                  [target.id]: !prev[target.id] 
                }))}
                className="flex items-center gap-2 text-sm text-[#858585] hover:text-white transition-colors mb-3"
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
                    className="w-full h-24 p-4 bg-[#0a0a0a] text-white border border-[#2a2a2a] rounded-xl text-sm font-light resize-none focus:outline-none focus:border-[#a855f7]/50 placeholder-[#6a6a6a] transition-all"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveReflectionNotes(target.id)}
                      disabled={updating[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-4 py-2 text-sm font-light bg-white text-black rounded-xl hover:bg-[#d1d1d1] disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      <AppIcon name="check" size={14} color="#000" glow={false} />
                      Save Notes
                    </button>
                    <button
                      onClick={() => handleClearReflection(target.id)}
                      disabled={updating[target.id] || !reflectionNotes[target.id]?.trim()}
                      className="px-4 py-2 text-sm font-light bg-transparent text-[#ababab] border border-[#2a2a2a] rounded-xl hover:border-[#b45309]/50 hover:text-[#b45309] disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                      <AppIcon name="relapse" size={14} color="#8a8a8a" glow={false} />
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
                      <div className="text-[#ababab] text-sm leading-relaxed font-light italic">
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
            <div className="text-2xl font-light tabular-nums text-white" style={{ textShadow: '0 0 12px rgba(77, 166, 255, 0.15)' }}>{stats.killed}</div>
            <div className="text-xs text-[#858585] font-light mt-1">Killed</div>
          </div>
          <div className="text-center p-4 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a]">
            <div className="text-2xl font-light tabular-nums text-white" style={{ textShadow: '0 0 12px rgba(77, 166, 255, 0.15)' }}>{stats.escaped}</div>
            <div className="text-xs text-[#858585] font-light mt-1">Escaped</div>
          </div>
          <div className="text-center p-4 bg-[#0a0a0a] rounded-xl border border-[#1a1a1a]">
            <div className="text-2xl font-light tabular-nums text-white" style={{ textShadow: '0 0 12px rgba(77, 166, 255, 0.15)' }}>{stats.active}</div>
            <div className="text-xs text-[#858585] font-light mt-1">Active</div>
          </div>
        </div>
        {stats.total > 0 && (
          <div className="mt-4 text-center">
            <div className="text-sm text-[#858585] font-light">
              Completion Rate: <span className="font-medium text-white tabular-nums">
                {stats.completionRate.toFixed(1)}%
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Kill Closure Modal — forensic closing entry (kill or escape) */}
      <KillClosureModal
        isOpen={closureModal.isOpen}
        mode={closureModal.mode}
        target={closureModal.target}
        oraclePhase={closureModal.oraclePhase}
        oracleResponse={closureModal.oracleResponse}
        onSubmit={handleClosureSubmit}
        onClose={handleClosureClose}
      />

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => setOracleModal({ isOpen: false, target: null, feedback: '', entryCount: null })}
        target={oracleModal.target}
        moduleName="Kill List"
        onFeedbackGenerated={(feedback) => {
          if (oracleModal.target) {
            handleOracleFeedbackGenerated(oracleModal.target.id, feedback);
          }
        }}
        onReaction={handleOracleReaction}
        entryCount={oracleModal.entryCount}
      />
    </div>
  );
});

export default KillListDashboard;
