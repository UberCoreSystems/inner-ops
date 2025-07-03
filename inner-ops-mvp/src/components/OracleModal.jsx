
import React from 'react';

const OracleModal = ({ isOpen, onClose, feedback, loading }) => {
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
              disabled={loading}
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
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mb-4"></div>
              <div className="text-purple-300 italic">
                The Oracle peers into the depths of your soul...
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-gray-800 border border-purple-500/30 rounded-lg p-4">
                <div className="text-gray-200 leading-relaxed whitespace-pre-line">
                  {feedback}
                </div>
              </div>
              
              <div className="text-center">
                <button
                  onClick={onClose}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
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
