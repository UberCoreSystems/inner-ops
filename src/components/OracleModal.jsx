
import React, { useEffect, useState } from 'react';
import { generateAIFeedback } from '../utils/aiFeedback';
import logger from '../utils/logger';
import { ouraToast } from '../utils/toast';
import { InlineErrorBoundary } from './ErrorBoundary';

const REACTIONS = [
  { id: 'landed',   label: 'This landed',           color: '#22c55e', icon: '◉' },
  { id: 'disagree', label: 'I disagree',             color: '#ef4444', icon: '✕' },
  { id: 'sit',      label: 'I need to sit with this', color: '#f59e0b', icon: '◎' },
  { id: 'missed',   label: 'This missed',            color: '#5a5a5a', icon: '○' },
];

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
}) => {
  const [oracleFeedback, setOracleFeedback] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedReaction, setSelectedReaction] = useState(null);

  useEffect(() => {
    if (isOpen && target && moduleName && !feedback && !content) {
      generateOracleFeedback();
    } else if (isOpen && (feedback || content)) {
      setOracleFeedback(feedback || content);
    }
    if (isOpen) {
      setSelectedReaction(null);
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

  const currentFeedback = feedback || content || oracleFeedback;
  const isCurrentlyLoading = loading || isLoadingProp || isGenerating;
  if (!isOpen) return null;

  return (
    <InlineErrorBoundary name="OracleModal">
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-black rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col border border-[#1a1a1a]">

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isCurrentlyLoading ? (
            /* ── Loading state ── */
            <div className="flex flex-col items-center justify-center py-16">
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

              {/* Feedback text */}
              <div className="text-[#e0e0e0] text-[15px] leading-[1.75] font-light">
                {currentFeedback || 'The Oracle awaits your query...'}
              </div>

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
