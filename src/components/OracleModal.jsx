
import React, { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { generateAIFeedback } from '../utils/aiFeedback';
import { resolveTriggeredCriterion } from '../utils/confrontationCriteria';
import logger from '../utils/logger';
import { ouraToast } from '../utils/toast';
import { InlineErrorBoundary } from './ErrorBoundary';

const REACTIONS = [
  { id: 'landed',   label: 'This landed',           color: '#22c55e', icon: '◉' },
  { id: 'disagree', label: 'I disagree',             color: '#ef4444', icon: '✕' },
  { id: 'sit',      label: 'I need to sit with this', color: '#f59e0b', icon: '◎' },
  { id: 'missed',   label: 'This missed',            color: '#5a5a5a', icon: '○' },
];

const MAX_REGEN = 3;

// BER-136: call oracle CF directly for regen/follow-up.
// BER-229: accept entryModuleName so journal regen gets DEPTH instruction from CF.
// Finding 3 remediation: the system-prompt fragment is now requested by key,
// not supplied as free text. The server-side registry owns the template.
async function callOracleRaw(entryText, promptContext, entryModuleName) {
  try {
    const functions = getFunctions();
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 20000 });
    const result = await oracleFn({
      entryText,
      moduleName: entryModuleName === 'journal' ? 'journal' : 'oracle',
      userContext: {},
      tone: 'stoic',
      ...(promptContext?.key
        ? {
            promptContextKey: promptContext.key,
            promptContextParams: promptContext.params || {},
          }
        : {}),
    });
    return {
      feedback: result.data?.feedback?.trim() || null,
      metacognitiveDepth: result.data?.metacognitiveDepth || null,
    };
  } catch (err) {
    logger.warn('Oracle raw call failed:', err?.message);
    return { feedback: null, metacognitiveDepth: null };
  }
}

const OracleModal = ({
  isOpen,
  onClose,
  feedback,
  loading,
  content,
  isLoading: isLoadingProp,
  target = null,
  moduleName = '',
  context = '',
  onFeedbackGenerated = null,
  onReaction = null,
  // BER-136: entry context for regeneration and follow-up
  entryText = '',
  entryModuleName = '',
  onFollowUpStored = null,
  // BER-194: data-depth calibration — null = unknown (no constraint applied)
  entryCount = null,
  // BER-225: metacognitive depth classification (journal entries only)
  metacognitiveDepth = null,
}) => {
  // BER-200: resolved asynchronously on open — display the triggered criterion
  const [resolvedCriterion, setResolvedCriterion] = useState(null);
  const [oracleFeedback, setOracleFeedback] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState(null);

  // BER-136: regeneration + follow-up state
  const [displayFeedback, setDisplayFeedback] = useState('');
  // BER-229: local depth state so regen can update it (prop only reflects initial load)
  const [displayDepth, setDisplayDepth] = useState(metacognitiveDepth);
  const [regenCount, setRegenCount] = useState(0);
  const [regenLoading, setRegenLoading] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [followUpResponse, setFollowUpResponse] = useState('');
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpUsed, setFollowUpUsed] = useState(false);

  useEffect(() => {
    if (isOpen && target && moduleName && !feedback && !content) {
      generateOracleFeedback();
    } else if (isOpen && (feedback || content)) {
      setOracleFeedback(feedback || content);
    }
    if (isOpen) {
      setSelectedReaction(null);
      // Reset regen/follow-up on each new open
      setRegenCount(0);
      setFollowUpText('');
      setShowFollowUp(false);
      setFollowUpResponse('');
      setFollowUpUsed(false);
      setDisplayFeedback('');
      // BER-229: reset depth to prop value on each open
      setDisplayDepth(metacognitiveDepth);
      // BER-200: resolve confrontation criterion for this user
      setResolvedCriterion(null);
      try {
        const uid = getAuth().currentUser?.uid;
        if (uid) {
          resolveTriggeredCriterion(uid)
            .then((result) => setResolvedCriterion(result))
            .catch(() => {});
        }
      } catch { /* no-op */ }
    }
  }, [isOpen, target, moduleName, feedback, content]);

  // Sync displayFeedback whenever the base feedback changes
  useEffect(() => {
    const base = feedback || content || oracleFeedback;
    if (base) setDisplayFeedback(base);
  }, [feedback, content, oracleFeedback]);

  const generateOracleFeedback = async () => {
    if (!target || !moduleName) return;

    setIsGenerating(true);
    try {
      const feedbackContext = context || `Kill Target: ${target.title}
Description: ${target.description}
Status: ${target.status}
Priority: ${target.priority}
Reflection: ${target.reflectionNotes || 'No reflection yet'}`;

      const { text: generatedFeedback } = await generateAIFeedback(moduleName, feedbackContext, []);
      setOracleFeedback(generatedFeedback);

      if (onFeedbackGenerated) {
        onFeedbackGenerated(generatedFeedback);
      }
    } catch (error) {
      logger.error('Error generating Oracle feedback:', error);
      setOracleFeedback('The Oracle encounters interference... Please try again in a moment.');
    } finally {
      setIsGenerating(false);
    }
  };

  // BER-136: regenerate from a different confrontational angle
  const handleRegenerate = async () => {
    if (regenCount >= MAX_REGEN || regenLoading || !entryText) return;
    setRegenLoading(true);
    try {
      // Finding 3: template lives server-side. The server interprets
      // entryCount (a number) to include or omit the data-depth caveat.
      // BER-229: pass entryModuleName so journal regen gets DEPTH from CF
      const { feedback: regenFeedback, metacognitiveDepth: regenDepth } = await callOracleRaw(
        entryText,
        { key: 'oracle_regen', params: { entryCount } },
        entryModuleName
      );
      if (regenFeedback) {
        setDisplayFeedback(regenFeedback);
        setDisplayDepth(regenDepth);
        setRegenCount(prev => prev + 1);
        setFollowUpResponse('');
        setShowFollowUp(false);
        setFollowUpUsed(false);
      } else {
        ouraToast.error('Oracle unavailable. Try again.');
      }
    } finally {
      setRegenLoading(false);
    }
  };

  // BER-136: follow-up interrogation
  const handleFollowUp = async () => {
    if (!followUpText.trim() || followUpUsed || followUpLoading || !entryText) return;
    setFollowUpLoading(true);
    try {
      // Finding 3: pushback text is now a parameter, not a system prompt.
      // Server-side template wraps it into the challenge instruction.
      const { feedback: followUpFeedback } = await callOracleRaw(
        `Original context: ${entryText}\n\nUser's challenge: ${followUpText.trim()}`,
        { key: 'oracle_challenge', params: { pushback: followUpText.trim() } }
      );
      const response = followUpFeedback || 'Oracle unavailable. Challenge recorded.';
      setFollowUpResponse(response);
      setFollowUpUsed(true);
      if (onFollowUpStored) {
        onFollowUpStored({ followUpText: followUpText.trim(), followUpResponse: response });
      }
    } finally {
      setFollowUpLoading(false);
    }
  };

  const handleReaction = async (reactionId) => {
    setSelectedReaction(reactionId);
    if (onReaction) {
      try {
        await onReaction(reactionId);
        ouraToast.success('Reaction saved', { duration: 1500 });
      } catch (error) {
        logger.error('Failed to save Oracle reaction:', error);
      }
    }
  };

  const currentFeedback = displayFeedback || feedback || content || oracleFeedback;
  const isCurrentlyLoading = loading || isLoadingProp || isGenerating;
  const canRegen = !!entryText && regenCount < MAX_REGEN && !regenLoading && !isCurrentlyLoading && !!currentFeedback;
  const canFollowUp = !!entryText && !followUpUsed && !followUpLoading && !isCurrentlyLoading && !!currentFeedback;

  if (!isOpen) return null;

  return (
    <InlineErrorBoundary name="OracleModal">
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-black rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-[#1a1a1a]">

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isCurrentlyLoading ? (
            /* ── Loading state ── */
            <div className="flex flex-col items-center justify-center py-16 relative">
              {/* Dismiss button — always visible so user is never trapped on Oracle failure */}
              <button
                onClick={onClose}
                className="absolute top-0 right-0 text-[#3a3a3a] hover:text-[#8a8a8a] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
              {/* Breathing ring */}
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 rounded-full border border-[#2a2a2a]" />
                <div
                  className="absolute inset-0 rounded-full border border-[#d1d1d1]"
                  style={{
                    borderTopColor: 'transparent',
                    borderRightColor: 'transparent',
                    animation: 'spin 2s linear infinite',
                  }}
                />
                <div className="absolute inset-[6px] rounded-full border border-[#1a1a1a]" />
                <div
                  className="absolute inset-[6px] rounded-full border border-[#5a5a5a]"
                  style={{
                    borderBottomColor: 'transparent',
                    borderLeftColor: 'transparent',
                    animation: 'spin 3s linear infinite reverse',
                  }}
                />
              </div>
              <div className="text-[#5a5a5a] text-xs uppercase tracking-widest">Reading</div>
            </div>
          ) : (
            /* ── Feedback state ── */
            <div className="space-y-6">
              {/* BER-200: Confrontation trigger — user's own pre-committed question */}
              {resolvedCriterion && (
                <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-3">
                  <div className="text-[#5a5a5a] text-xs uppercase tracking-widest">Confrontation Trigger</div>
                  <div className="text-[#8a8a8a] text-xs">{resolvedCriterion.dataSummary}</div>
                  <div className="border-l-2 border-[#3a3a3a] pl-3">
                    <div className="text-[#5a5a5a] text-[10px] uppercase tracking-widest mb-1">Your pre-committed question</div>
                    <div className="text-[#d1d1d1] text-sm leading-relaxed">{resolvedCriterion.criterion.question}</div>
                  </div>
                </div>
              )}

              {/* Oracle label */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#d1d1d1]" />
                  <span className="text-[#5a5a5a] text-xs uppercase tracking-widest font-medium">Oracle</span>
                </div>
                <button
                  onClick={onClose}
                  className="text-[#3a3a3a] hover:text-[#8a8a8a] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* BER-225/BER-229: Metacognitive depth — use local state so regen updates it */}
              {displayDepth && (
                <div className="text-[#5a5a5a] text-xs uppercase tracking-widest">
                  Depth: {displayDepth}
                </div>
              )}

              {/* Feedback text */}
              <div className="text-[#e0e0e0] text-[15px] leading-[1.75] font-light">
                {currentFeedback || 'The Oracle awaits your query...'}
              </div>

              {/* Follow-up response */}
              {followUpResponse && (
                <div className="border-l-2 border-[#5a5a5a] pl-4">
                  <div className="text-[#5a5a5a] text-xs uppercase tracking-widest mb-2">Your challenge addressed</div>
                  <div className="text-[#c0c0c0] text-sm leading-relaxed font-light">{followUpResponse}</div>
                </div>
              )}

              {/* Follow-up input */}
              {showFollowUp && !followUpUsed && (
                <div className="space-y-3">
                  <div className="text-[#5a5a5a] text-xs uppercase tracking-widest">Challenge the Oracle's assessment</div>
                  {/* Pass 2 Finding 14 remediation: maxLength + visible
                      counter so the user sees the cap before the server
                      truncates. Matches MAX_USER_RESPONSE_CHARS in
                      functions/index.js. */}
                  <textarea
                    value={followUpText}
                    onChange={e => setFollowUpText(e.target.value)}
                    rows={2}
                    maxLength={8000}
                    className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#5a5a5a] focus:outline-none resize-none text-sm placeholder-[#3a3a3a]"
                    placeholder="State your specific pushback..."
                  />
                  <div className="text-[#3a3a3a] text-xs text-right" aria-live="polite">
                    {followUpText.length} / 8000
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleFollowUp}
                      disabled={!followUpText.trim() || followUpLoading}
                      className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-all bg-[#1a1a1a] border border-[#2a2a2a] text-[#8a8a8a] hover:text-white disabled:opacity-40"
                    >
                      {followUpLoading ? 'Processing...' : 'Submit'}
                    </button>
                    <button
                      onClick={() => { setShowFollowUp(false); setFollowUpText(''); }}
                      className="px-4 py-2.5 text-sm rounded-xl bg-transparent text-[#3a3a3a] hover:text-[#5a5a5a] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* BER-136: Regenerate + Go Deeper buttons */}
              {currentFeedback && (canRegen || canFollowUp) && (
                <div className="flex gap-2 flex-wrap">
                  {canRegen && (
                    <button
                      onClick={handleRegenerate}
                      disabled={regenLoading}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#1a1a1a] text-[#5a5a5a] hover:border-[#2a2a2a] hover:text-[#8a8a8a] transition-all disabled:opacity-40"
                    >
                      {regenLoading ? 'Regenerating...' : `Regenerate · ${MAX_REGEN - regenCount} of ${MAX_REGEN} remaining`}
                    </button>
                  )}
                  {canFollowUp && !showFollowUp && (
                    <button
                      onClick={() => setShowFollowUp(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#1a1a1a] text-[#5a5a5a] hover:border-[#2a2a2a] hover:text-[#8a8a8a] transition-all"
                    >
                      Go deeper
                    </button>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-[#1a1a1a]" />

              {/* Reactions */}
              {currentFeedback && (
                <div>
                  <div className="text-[#3a3a3a] text-xs uppercase tracking-widest mb-3">How did this land?</div>
                  <div className="flex flex-wrap gap-2">
                    {REACTIONS.map((r) => {
                      const isSelected = selectedReaction === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => handleReaction(r.id)}
                          className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all duration-200 ${
                            isSelected
                              ? ''
                              : 'bg-transparent border border-[#1a1a1a] text-[#5a5a5a] hover:border-[#2a2a2a] hover:text-[#8a8a8a]'
                          }`}
                          style={isSelected ? {
                            backgroundColor: `${r.color}12`,
                            borderWidth: 1,
                            borderStyle: 'solid',
                            borderColor: `${r.color}40`,
                            color: r.color,
                          } : undefined}
                        >
                          <span className="text-[10px]">{r.icon}</span>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Close */}
              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 bg-[#111] border border-[#1a1a1a] text-[#8a8a8a] hover:text-white hover:border-[#2a2a2a]"
              >
                {selectedReaction ? 'Done' : 'Close'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
    </InlineErrorBoundary>
  );
};

export default OracleModal;
