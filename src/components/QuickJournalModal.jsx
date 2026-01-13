import React, { useState, useEffect, useCallback } from 'react';
import { writeData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

const quickMoods = [
  { emoji: '⚡', label: 'Electric', value: 'electric', color: '#00d4aa' },
  { emoji: '🗡️', label: 'Sharp', value: 'sharp', color: '#4da6ff' },
  { emoji: '🌪️', label: 'Chaotic', value: 'chaotic', color: '#a855f7' },
  { emoji: '🪨', label: 'Heavy', value: 'heavy', color: '#f59e0b' },
  { emoji: '🦋', label: 'Light', value: 'light', color: '#22c55e' },
  { emoji: '🕳️', label: 'Hollow', value: 'hollow', color: '#ef4444' },
];

const quickPrompts = [
  "What's on your mind right now?",
  "How are you really feeling?",
  "What's one thing you're grateful for?",
  "What challenged you today?",
  "What pattern did you notice?",
  "What do you need to let go of?",
];

const QuickJournalModal = React.memo(function QuickJournalModal({ isOpen, onClose, onSuccess }) {
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [showOracle, setShowOracle] = useState(false);
  const [oracleResponse, setOracleResponse] = useState('');
  const [oracleLoading, setOracleLoading] = useState(false);

  // Set random prompt on open
  useEffect(() => {
    if (isOpen) {
      setCurrentPrompt(quickPrompts[Math.floor(Math.random() * quickPrompts.length)]);
      setEntry('');
      setMood(null);
      setShowOracle(false);
      setOracleResponse('');
    }
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSave = useCallback(async () => {
    if (!entry.trim()) return;

    setSaving(true);
    try {
      const journalEntry = {
        content: entry.trim(),
        mood: mood || 'neutral',
        intensity: 3, // Default intensity for quick entries
        createdAt: new Date().toISOString(),
        isQuickEntry: true,
      };

      await writeData('journalEntries', journalEntry);
      
      ouraToast.success('Quick journal entry saved');
      
      // Generate Oracle feedback if entry is substantial
      if (entry.trim().split(/\s+/).length >= 10) {
        setOracleLoading(true);
        try {
          const feedback = await generateAIFeedback(entry, 'journal', {
            mood: mood || 'neutral',
            intensity: 3,
          });
          setOracleResponse(feedback);
          setShowOracle(true);
        } catch (error) {
          logger.error('Oracle feedback error:', error);
        }
        setOracleLoading(false);
      } else {
        // Quick close for short entries
        onSuccess?.();
        onClose();
      }
    } catch (error) {
      logger.error('Error saving quick entry:', error);
    } finally {
      setSaving(false);
    }
  }, [entry, mood, onSuccess, onClose]);

  const handleDone = useCallback(() => {
    onSuccess?.();
    onClose();
  }, [onSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl shadow-2xl animate-fade-in-up overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#a855f7]/10 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v16H4z" />
                <path d="M8 8h8M8 12h8M8 16h4" opacity="0.7" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-light">Quick Entry</h2>
              <p className="text-[#5a5a5a] text-xs">{currentPrompt}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5a5a5a] hover:text-white hover:bg-[#1a1a1a] transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {!showOracle ? (
          <>
            {/* Mood Selection */}
            <div className="p-4 border-b border-[#1a1a1a]">
              <p className="text-[#5a5a5a] text-xs uppercase tracking-wider mb-3">How are you feeling?</p>
              <div className="flex gap-2 flex-wrap">
                {quickMoods.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setMood(m.value)}
                    className={`px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-all ${
                      mood === m.value
                        ? 'bg-[#1a1a1a] border-2'
                        : 'bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#2a2a2a]'
                    }`}
                    style={{ 
                      borderColor: mood === m.value ? m.color : undefined,
                      color: mood === m.value ? m.color : '#8a8a8a'
                    }}
                  >
                    <span>{m.emoji}</span>
                    <span className="hidden sm:inline">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Text Input */}
            <div className="p-4">
              <textarea
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="Write what's on your mind..."
                className="w-full h-32 bg-transparent text-white placeholder-[#3a3a3a] resize-none outline-none text-base font-light leading-relaxed"
                autoFocus
              />
              
              {/* Character/Word count */}
              <div className="flex items-center justify-between mt-2 text-[#3a3a3a] text-xs">
                <span>{entry.trim().split(/\s+/).filter(w => w).length} words</span>
                <span className="text-[#5a5a5a]">Press ⌘+Enter to save</span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 border-t border-[#1a1a1a] bg-[#050505]">
              <button
                onClick={onClose}
                className="px-4 py-2 text-[#5a5a5a] text-sm hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!entry.trim() || saving}
                className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                  entry.trim() && !saving
                    ? 'bg-[#a855f7] text-white hover:bg-[#9333ea] hover:shadow-lg hover:shadow-[#a855f7]/20'
                    : 'bg-[#1a1a1a] text-[#3a3a3a] cursor-not-allowed'
                }`}
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                    Save Entry
                  </>
                )}
              </button>
            </div>
          </>
        ) : (
          /* Oracle Response */
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#a855f7] to-[#6366f1] flex items-center justify-center">
                <span className="text-lg">🔮</span>
              </div>
              <div>
                <h3 className="text-white font-light">The Oracle Speaks</h3>
                <p className="text-[#5a5a5a] text-xs">Reflection on your entry</p>
              </div>
            </div>
            
            {oracleLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-8 h-8 border-2 border-[#a855f7]/30 border-t-[#a855f7] rounded-full animate-spin" />
              </div>
            ) : (
              <div className="bg-[#1a1a1a]/50 rounded-xl p-4 mb-6">
                <p className="text-[#8a8a8a] text-sm leading-relaxed italic">
                  "{oracleResponse}"
                </p>
              </div>
            )}
            
            <button
              onClick={handleDone}
              className="w-full py-3 rounded-xl bg-[#a855f7] text-white font-medium hover:bg-[#9333ea] transition-all"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export default QuickJournalModal;
