
import React, { useEffect, useState } from 'react';
import { generateAIFeedback, generateOracleFollowUp } from '../utils/aiFeedback';
import logger from '../utils/logger';

const OracleModal = ({ 
  isOpen, 
  onClose, 
  feedback, 
  loading, 
  content, // Backward compatibility
  isLoading: isLoadingProp, // Backward compatibility - renamed to avoid conflict
  target = null, 
  moduleName = '', 
  context = '', 
  onFeedbackGenerated = null,
  onFollowUpSaved = null // Callback when follow-up is saved
}) => {
  const [oracleFeedback, setOracleFeedback] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [userResponse, setUserResponse] = useState('');
  const [oracleFollowUp, setOracleFollowUp] = useState('');
  const [isGeneratingFollowUp, setIsGeneratingFollowUp] = useState(false);
  const [isSecondLayer, setIsSecondLayer] = useState(false);
  const [originalInput, setOriginalInput] = useState('');
  const [originalFeedback, setOriginalFeedback] = useState('');

  // Auto-fetch Oracle feedback when modal opens with target context
  useEffect(() => {
    if (isOpen && target && moduleName && !feedback && !content) {
      generateOracleFeedback();
    } else if (isOpen && (feedback || content)) {
      setOracleFeedback(feedback || content);
      setOriginalFeedback(feedback || content);
    }
    // Reset state when modal opens
    if (isOpen) {
      setUserResponse('');
      setOracleFollowUp('');
      setIsSecondLayer(false);
    }
  }, [isOpen, target, moduleName, feedback, content]);

  const generateOracleFeedback = async () => {
    if (!target || !moduleName) return;
    
    setIsGenerating(true);
    try {
      const feedbackContext = context || `Kill Target: ${target.title}
Description: ${target.description}
Status: ${target.status}
Priority: ${target.priority}
Reflection: ${target.reflectionNotes || 'No reflection yet'}`;

      const generatedFeedback = await generateAIFeedback(moduleName, feedbackContext, []);
      setOracleFeedback(generatedFeedback);
      setOriginalFeedback(generatedFeedback);
      
      // Notify parent component of generated feedback for saving
      if (onFeedbackGenerated) {
        onFeedbackGenerated(generatedFeedback);
      }
    } catch (error) {
      logger.error("Error generating Oracle feedback:", error);
      setOracleFeedback("The Oracle encounters interference... Please try again in a moment.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSubmitResponse = async () => {
    if (!userResponse.trim()) return;

    setIsGeneratingFollowUp(true);
    try {
      const followUp = await generateOracleFollowUp(
        originalInput || oracleFeedback,
        originalFeedback || oracleFeedback,
        userResponse
      );
      setOracleFollowUp(followUp);
      setIsSecondLayer(true);
      
      // Notify parent component that follow-up was generated
      if (onFollowUpSaved) {
        onFollowUpSaved(followUp);
      }
    } catch (error) {
      logger.error("Error generating Oracle follow-up:", error);
      setOracleFollowUp("The Oracle's wisdom is momentarily obscured... Please try again.");
    } finally {
      setIsGeneratingFollowUp(false);
    }
  };

  const resetToFirstLayer = () => {
    setUserResponse('');
    setOracleFollowUp('');
    setIsSecondLayer(false);
  };

  const currentFeedback = feedback || content || oracleFeedback;
  const isCurrentlyLoading = loading || isLoadingProp || isGenerating;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0a0a0a] to-[#111] p-6 border-b border-[#1a1a1a]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-[#a855f7]/10 flex items-center justify-center text-xl">
                🔮
              </div>
              <div>
                <h3 className="text-lg font-light text-white">
                  {isSecondLayer ? "✨ Oracle's Deeper Reflection" : "🔮 Oracle's Judgment"}
                </h3>
                <p className="text-[#5a5a5a] text-xs mt-1">
                  {isSecondLayer 
                    ? "The Oracle reflects on your answer..." 
                    : "Ancient wisdom channeled through consciousness..."}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5a5a5a] hover:text-white hover:bg-[#1a1a1a] transition-all"
              disabled={isCurrentlyLoading || isGeneratingFollowUp}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isCurrentlyLoading ? (
            <div className="text-center py-12 flex flex-col items-center justify-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b border-[#a855f7] mb-4"></div>
              <div className="text-[#a855f7] italic text-sm">
                The Oracle peers into the depths of your soul...
              </div>
            </div>
          ) : isSecondLayer ? (
            // Second layer: Display follow-up response
            <div className="space-y-4">
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#1a1a1a]">
                  <span className="text-[#a855f7]">❓</span>
                  <h4 className="text-[#a855f7] font-medium text-xs uppercase tracking-widest">Your Response</h4>
                </div>
                <div className="bg-[#050505] rounded-xl p-4 border border-[#1a1a1a]">
                  <div className="text-[#d1d1d1] leading-relaxed whitespace-pre-line text-sm">
                    {userResponse}
                  </div>
                </div>
              </div>

              <div className="bg-[#0a0a0a] border border-[#a855f7]/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#1a1a1a]">
                  <span className="text-[#a855f7]">🔮</span>
                  <h4 className="text-[#a855f7] font-medium text-xs uppercase tracking-widest">Oracle's Deeper Wisdom</h4>
                </div>
                {isGeneratingFollowUp ? (
                  <div className="text-center py-8 flex flex-col items-center">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b border-[#a855f7] mb-3"></div>
                    <div className="text-[#a855f7] italic text-sm">
                      Synthesizing deeper wisdom...
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#050505] rounded-xl p-4 border border-[#1a1a1a]">
                    <div className="text-[#d8b4fe] leading-relaxed whitespace-pre-line text-sm italic font-light">
                      {oracleFollowUp || "The Oracle awaits reflection..."}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={resetToFirstLayer}
                  className="flex-1 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white px-6 py-3 rounded-xl transition-colors font-medium text-sm disabled:opacity-50"
                  disabled={isGeneratingFollowUp}
                >
                  ← Back to Judgment
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 bg-[#a855f7] hover:bg-[#9333ea] text-white px-6 py-3 rounded-xl transition-colors font-medium text-sm"
                >
                  Complete Entry
                </button>
              </div>
            </div>
          ) : (
            // First layer: Initial judgment with option to respond
            <div className="space-y-4">
              <div className="bg-[#0a0a0a] border border-[#a855f7]/20 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#1a1a1a]">
                  <span className="text-[#a855f7]">🔮</span>
                  <h4 className="text-[#a855f7] font-medium text-xs uppercase tracking-widest">Oracle's Wisdom</h4>
                </div>
                <div className="bg-[#050505] rounded-xl p-4 border border-[#1a1a1a]">
                  <div className="text-[#d8b4fe] leading-relaxed whitespace-pre-line text-sm italic font-light">
                    {currentFeedback || "The Oracle awaits your query..."}
                  </div>
                </div>
              </div>
              
              {/* Second layer option - only if there's valid feedback */}
              {currentFeedback && !isCurrentlyLoading && (
                <div className="bg-[#0a0a0a] border border-[#a855f7]/20 rounded-2xl p-4">
                  <label className="block text-[#a855f7] font-medium text-xs uppercase tracking-widest mb-3">
                    💬 The Oracle asks a question—share your response for deeper wisdom?
                  </label>
                  <textarea
                    value={userResponse}
                    onChange={(e) => setUserResponse(e.target.value)}
                    placeholder="Share your thoughts, feelings, or answer to the Oracle's question..."
                    rows={3}
                    className="w-full p-3 bg-[#050505] text-[#d1d1d1] rounded-xl border border-[#1a1a1a] focus:border-[#a855f7] focus:outline-none resize-none placeholder-[#5a5a5a] text-sm mb-3 transition-colors"
                    disabled={isGeneratingFollowUp}
                  />
                  <button
                    onClick={handleSubmitResponse}
                    disabled={!userResponse.trim() || isGeneratingFollowUp}
                    className="w-full bg-[#a855f7] hover:bg-[#9333ea] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-white px-6 py-2 rounded-xl transition-colors font-medium text-sm"
                  >
                    {isGeneratingFollowUp ? 'Oracle is reflecting...' : 'Ask the Oracle for Deeper Insight'}
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="w-full bg-[#a855f7] hover:bg-[#9333ea] text-white px-6 py-3 rounded-xl transition-colors font-medium text-sm"
                >
                  {userResponse ? 'Save Entry Without Follow-up' : 'Acknowledge Wisdom'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#050505] border-t border-[#1a1a1a] p-4 text-center">
          <p className="text-[#5a5a5a] text-xs italic">
            "The unexamined life is not worth living" - Socrates
          </p>
        </div>
      </div>
    </div>
  );
};

export default OracleModal;
