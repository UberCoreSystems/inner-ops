
import { useEffect, useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getAuth } from 'firebase/auth';
import { generateAIFeedback } from '../utils/aiFeedback';
import { resolveTriggeredCriterion } from '../utils/confrontationCriteria';
import logger from '../utils/logger';
import { ouraToast } from '../utils/toast';
import { InlineErrorBoundary } from './ErrorBoundary';
import { useFocusTrap } from '../hooks/useFocusTrap';

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
    const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });
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

// Eng #3: fetch the validated receipts the Oracle reasons from (global + this
// entry's module), for provenance display. Read-only, server-assembled, no LLM
// call. Degrades to [] so the modal simply omits the panel on any failure.
async function fetchOnRecord(moduleName) {
  try {
    const functions = getFunctions();
    const fn = httpsCallable(functions, 'getOnRecord', { timeout: 15000 });
    const result = await fn({ moduleName: moduleName || '' });
    return Array.isArray(result.data?.onRecord) ? result.data.onRecord : [];
  } catch (err) {
    logger.warn('getOnRecord failed:', err?.message);
    return [];
  }
}

const OracleModal = ({
  isOpen,
  onClose,
  feedback,
  content,
  isLoading = false,
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
  // Eng #3: validated receipts the Oracle reasons from ("on record" provenance)
  const [onRecord, setOnRecord] = useState([]);

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
      // Eng #3: reset, then fetch the validated receipts on record for this entry's module
      setOnRecord([]);
      try {
        const uid = getAuth().currentUser?.uid;
        if (uid) {
          resolveTriggeredCriterion(uid)
            .then((result) => setResolvedCriterion(result))
            .catch(() => {});
          fetchOnRecord(entryModuleName || moduleName)
            .then((items) => setOnRecord(items))
            .catch(() => {});
        }
      } catch { /* no-op */ }
    }
    // generateOracleFeedback is an unmemoized closure (new each render) — adding
    // it would regenerate on every render. metacognitiveDepth is intentionally
    // re-applied only on open, not on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Persist only a genuine Oracle reply. Persisting the unavailable-
      // fallback would write a non-response onto the entry that survives reload
      // and reads as the Oracle's considered answer.
      if (onFollowUpStored && followUpFeedback) {
        onFollowUpStored({ followUpText: followUpText.trim(), followUpResponse: followUpFeedback });
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
  const isCurrentlyLoading = isLoading || isGenerating;
  const canRegen = !!entryText && regenCount < MAX_REGEN && !regenLoading && !isCurrentlyLoading && !!currentFeedback;
  const canFollowUp = !!entryText && !followUpUsed && !followUpLoading && !isCurrentlyLoading && !!currentFeedback;

  // a11y: trap keyboard focus inside the modal while open and restore focus on close.
  const trapRef = useFocusTrap(isOpen);

  // a11y: Esc closes the modal.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <InlineErrorBoundary name="OracleModal">
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Oracle feedback"
      className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4"
    >
      <div ref={trapRef} className="bg-black rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-[#1a1a1a]">

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isCurrentlyLoading ? (
            /* ── Loading state ── */
            <div className="flex flex-col items-center justify-center py-16 relative">
              {/* Dismiss button — always visible so user is never trapped on Oracle failure */}
              <button
                onClick={onClose}
                aria-label="Close Oracle"
                className="absolute top-0 right-0 text-[#858585] hover:text-[#ababab] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
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
              <div className="text-[#858585] text-xs uppercase tracking-widest">Reading</div>
            </div>
          ) : (
            /* ── Feedback state ── */
            <div className="space-y-6">
              {/* BER-200: Confrontation trigger — user's own pre-committed question */}
              {resolvedCriterion && (
                <div className="border border-[#2a2a2a] rounded-xl p-4 space-y-3">
                  <div className="text-[#858585] text-xs uppercase tracking-widest">Confrontation Trigger</div>
                  <div className="text-[#ababab] text-xs">{resolvedCriterion.dataSummary}</div>
                  <div className="border-l-2 border-[#3a3a3a] pl-3">
                    <div className="text-[#858585] text-[10px] uppercase tracking-widest mb-1">Your pre-committed question</div>
                    <div className="text-[#d1d1d1] text-sm leading-relaxed">{resolvedCriterion.criterion.question}</div>
                  </div>
                </div>
              )}

              {/* Oracle label */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#d1d1d1]" />
                  <span className="text-[#858585] text-xs uppercase tracking-widest font-medium">Oracle</span>
                </div>
                <button
                  onClick={onClose}
                  className="text-[#858585] hover:text-[#ababab] transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* BER-225/BER-229: Metacognitive depth — use local state so regen updates it */}
              {displayDepth && (
                <div className="text-[#858585] text-xs uppercase tracking-widest">
                  Depth: {displayDepth}
                </div>
              )}

              {/* Feedback text */}
              <div className="text-[#e0e0e0] text-[15px] leading-[1.75] font-light">
                {currentFeedback || 'The Oracle awaits your query...'}
              </div>

              {/* Eng #3: ON RECORD — the validated receipts the Oracle reasons from.
                  These are substring-validated at write time (never fabricated),
                  so they are shown as the user's own words. Omitted entirely when
                  there is no record yet (cold start). */}
              {onRecord.length > 0 && (
                <div className="border-t border-[#1a1a1a] pt-5">
                  <div className="text-[#858585] text-xs uppercase tracking-widest mb-1">On record</div>
                  <div className="text-[#6f6f6f] text-[11px] mb-3">Your own words, validated against your entries.</div>
                  <div className="space-y-2">
                    {onRecord.map((r, i) => (
                      <div key={i} className="border-l-2 border-[#2a2a2a] pl-3">
                        <p className="text-[#c0c0c0] text-sm leading-relaxed italic">“{r.quote}”</p>
                        {(r.date || r.source) && (
                          <p className="text-[#6f6f6f] text-[10px] uppercase tracking-widest mt-1">
                            {[r.date, r.source].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Follow-up response */}
              {followUpResponse && (
                <div className="border-l-2 border-[#5a5a5a] pl-4">
                  <div className="text-[#858585] text-xs uppercase tracking-widest mb-2">Your challenge addressed</div>
                  <div className="text-[#c0c0c0] text-sm leading-relaxed font-light">{followUpResponse}</div>
                </div>
              )}

              {/* Follow-up input */}
              {showFollowUp && !followUpUsed && (
                <div className="space-y-3">
                  <div className="text-[#858585] text-xs uppercase tracking-widest">Challenge the Oracle's assessment</div>
                  {/* Pass 2 Finding 14 remediation: maxLength + visible
                      counter so the user sees the cap before the server
                      truncates. Matches MAX_USER_RESPONSE_CHARS in
                      functions/index.js. */}
                  <textarea
                    value={followUpText}
                    onChange={e => setFollowUpText(e.target.value)}
                    rows={2}
                    maxLength={8000}
                    className="w-full p-3 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#5a5a5a] focus:outline-none resize-none text-sm placeholder-[#828282]"
                    placeholder="State your specific pushback..."
                  />
                  <div className="text-[#858585] text-xs text-right" aria-live="polite">
                    {followUpText.length} / 8000
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleFollowUp}
                      disabled={!followUpText.trim() || followUpLoading}
                      className="flex-1 py-2.5 text-sm font-medium rounded-xl transition-all bg-[#1a1a1a] border border-[#2a2a2a] text-[#ababab] hover:text-white disabled:opacity-40"
                    >
                      {followUpLoading ? 'Processing...' : 'Submit'}
                    </button>
                    <button
                      onClick={() => { setShowFollowUp(false); setFollowUpText(''); }}
                      className="px-4 py-2.5 text-sm rounded-xl bg-transparent text-[#858585] hover:text-[#858585] transition-colors"
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
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#1a1a1a] text-[#858585] hover:border-[#2a2a2a] hover:text-[#ababab] transition-all disabled:opacity-40"
                    >
                      {regenLoading ? 'Regenerating...' : `Regenerate · ${MAX_REGEN - regenCount} of ${MAX_REGEN} remaining`}
                    </button>
                  )}
                  {canFollowUp && !showFollowUp && (
                    <button
                      onClick={() => setShowFollowUp(true)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium bg-transparent border border-[#1a1a1a] text-[#858585] hover:border-[#2a2a2a] hover:text-[#ababab] transition-all"
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
                  <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">How did this land?</div>
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
                              : 'bg-transparent border border-[#1a1a1a] text-[#858585] hover:border-[#2a2a2a] hover:text-[#ababab]'
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
                className="w-full py-3 rounded-xl text-sm font-medium transition-all duration-200 bg-[#111] border border-[#1a1a1a] text-[#ababab] hover:text-white hover:border-[#2a2a2a]"
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
