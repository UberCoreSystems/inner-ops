
import React, { useEffect, useState } from 'react';
import { generateAIFeedback } from '../utils/aiFeedback';

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
  onFeedbackGenerated = null 
}) => {
  const [oracleFeedback, setOracleFeedback] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Auto-fetch Oracle feedback when modal opens with target context
  useEffect(() => {
    if (isOpen && target && moduleName && !feedback && !content) {
      generateOracleFeedback();
    } else if (isOpen && (feedback || content)) {
      setOracleFeedback(feedback || content);
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
      
      // Notify parent component of generated feedback for saving
      if (onFeedbackGenerated) {
        onFeedbackGenerated(generatedFeedback);
      }
    } catch (error) {
      console.error("Error generating Oracle feedback:", error);
      setOracleFeedback("The Oracle encounters interference... Please try again in a moment.");
    } finally {
      setIsGenerating(false);
    }
  };

  const currentFeedback = feedback || content || oracleFeedback;
  const isCurrentlyLoading = loading || isLoadingProp || isGenerating;
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border-2 border-purple-500 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-6 border-b border-purple-500">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="text-3xl">🔮</div>
              <h3 className="text-xl font-bold text-white">Oracle's Judgment</h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-2xl"
              disabled={isCurrentlyLoading}
            >
              ×
            </button>
          </div>
          <p className="text-purple-200 text-sm mt-2">
            Ancient wisdom channeled through consciousness...
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          {isCurrentlyLoading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mb-4"></div>
              <div className="text-purple-300 italic">
                The Oracle peers into the depths of your soul...
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Oracle Wisdom Display - Scrollable with Enhanced Styling */}
              <div className="bg-gray-800 border border-purple-500/30 rounded-lg p-4 max-h-96 overflow-y-auto">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-700">
                  <span className="text-purple-400">🔮</span>
                  <h4 className="text-purple-300 font-medium text-sm">Oracle's Wisdom</h4>
                </div>
                <div className="bg-gray-700/50 rounded-lg p-4 border border-gray-600/50">
                  <div className="text-gray-200 leading-relaxed whitespace-pre-line italic font-light">
                    {currentFeedback || "The Oracle awaits your query..."}
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <button
                  onClick={onClose}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-8 py-3 rounded-lg transition-colors font-medium shadow-lg transform hover:scale-105"
                >
                  Acknowledge Wisdom
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-800 border-t border-purple-500/30 p-4 text-center">
          <p className="text-purple-300 text-xs italic">
            "The unexamined life is not worth living" - Ancient Wisdom
          </p>
        </div>
      </div>
    </div>
  );
};

export default OracleModal;
