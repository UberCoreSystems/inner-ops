
import React, { useEffect, useState } from 'react';
import { generateAIFeedback } from '../utils/aiFeedback';
import logger from '../utils/logger';

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

  // Auto-fetch Oracle feedback when modal opens with target context
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

  const handleReaction = (reactionId) => {
    setSelectedReaction(reactionId);
    if (onReaction) {
      onReaction(reactionId);
    }
  };

  const currentFeedback = feedback || content || oracleFeedback;
  const isCurrentlyLoading = loading || isLoadingProp || isGenerating;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-[#0a0a0a] p-6 border-b border-[#1a1a1a]">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-[#a855f7]" />
              </div>
              <span className="text-xs font-medium uppercase tracking-widest text-[#888]">
                Oracle
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5a5a5a] hover:text-white hover:bg-[#1a1a1a] transition-all"
              disabled={isCurrentlyLoading}
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
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b border-[#a855f7] mb-4" />
              <div className="text-[#888] text-sm">Generating feedback...</div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Oracle feedback */}
              <div className="bg-[#0a0a0a] border border-[#1a1a1a] border-l-2 border-l-[#a855f7] rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3 pb-3 border-b border-[#1a1a1a]">
                  <h4 className="text-[#888] font-medium text-xs uppercase tracking-widest">Oracle</h4>
                </div>
                <div className="bg-[#050505] rounded-xl p-4 border border-[#1a1a1a]">
                  <div className="text-[#f5f5f5] leading-relaxed whitespace-pre-line text-sm">
                    {currentFeedback || 'The Oracle awaits your query...'}
                  </div>
                </div>
              </div>

              {/* Reactions */}
              {currentFeedback && !isCurrentlyLoading && (
                <div className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl p-4">
                  <label className="block text-[#888] font-medium text-xs uppercase tracking-widest mb-3">
                    How did this land?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {REACTIONS.map((r) => {
                      const isSelected = selectedReaction === r.id;
                      return (
                        <button
                          key={r.id}
                          onClick={() => handleReaction(r.id)}
                          className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                            isSelected
                              ? 'scale-[1.02] ring-1'
                              : 'bg-[#0a0a0a] border border-[#1a1a1a] text-[#8a8a8a] hover:border-[#2a2a2a] hover:text-white'
                          }`}
                          style={isSelected ? {
                            backgroundColor: `${r.color}15`,
                            borderColor: `${r.color}50`,
                            color: r.color,
                            ringColor: `${r.color}30`,
                          } : undefined}
                        >
                          <span style={isSelected ? { color: r.color } : undefined}>{r.icon}</span>
                          {r.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Close button */}
              <div className="flex flex-col gap-2 pt-2">
                <button
                  onClick={onClose}
                  className="w-full bg-[#a855f7] hover:bg-[#9333ea] text-white px-6 py-3 rounded-xl transition-colors font-medium text-sm"
                >
                  {selectedReaction ? 'Done' : 'Close'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OracleModal;
