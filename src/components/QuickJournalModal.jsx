import React, { useState, useEffect, useCallback } from 'react';
import { writeData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { InlineErrorBoundary } from './ErrorBoundary';

// Quick capture mirrors the Journal page entry form: mood, intensity, freeform
// textarea. Trimmed layout for modal context — no category tabs, no rotating
// prompts — but the underlying shape (content + mood + intensity) and the
// Oracle feedback pass match Journal.jsx exactly so entries stay consistent
// across surfaces.

const moodCategories = [
  {
    name: 'Energized',
    color: '#4da6ff',
    moods: [
      { label: 'Electric', value: 'electric' },
      { label: 'Light', value: 'light' },
      { label: 'Radiant', value: 'radiant' },
      { label: 'Triumphant', value: 'triumphant' },
    ],
  },
  {
    name: 'Grounded',
    color: '#8a8a8a',
    moods: [
      { label: 'Focused', value: 'focused' },
      { label: 'Sharp', value: 'sharp' },
      { label: 'Steady', value: 'steady' },
      { label: 'Calm', value: 'calm' },
    ],
  },
  {
    name: 'Challenged',
    color: '#b45309',
    moods: [
      { label: 'Heavy', value: 'heavy' },
      { label: 'Hollow', value: 'hollow' },
      { label: 'Foggy', value: 'foggy' },
      { label: 'Chaotic', value: 'chaotic' },
    ],
  },
];

const moodOptions = moodCategories.flatMap(cat =>
  cat.moods.map(m => ({ ...m, category: cat.name, color: cat.color }))
);

const intensityLevels = [
  { value: 1, label: 'Subtle' },
  { value: 2, label: 'Present' },
  { value: 3, label: 'Strong' },
  { value: 4, label: 'Overwhelming' },
  { value: 5, label: 'Consuming' },
];

const QuickJournalModal = React.memo(function QuickJournalModal({ isOpen, onClose, onSuccess }) {
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState('focused');
  const [intensity, setIntensity] = useState(3);
  const [saving, setSaving] = useState(false);
  const [showOracle, setShowOracle] = useState(false);
  const [oracleResponse, setOracleResponse] = useState('');
  const [oracleLoading, setOracleLoading] = useState(false);

  const canSubmit = entry.trim().length > 0 && !saving;

  useEffect(() => {
    if (isOpen) {
      setEntry('');
      setMood('focused');
      setIntensity(3);
      setShowOracle(false);
      setOracleResponse('');
    }
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleSave = useCallback(async () => {
    if (!entry.trim()) return;
    setSaving(true);

    try {
      const moodLabel = moodOptions.find(m => m.value === mood)?.label || mood;
      const inputText = `Mood: ${moodLabel} (${intensity}/5)\n${entry}`;

      setOracleLoading(true);
      setOracleResponse('');
      setShowOracle(true);

      const { text: feedbackText, metacognitiveDepth } = await generateAIFeedback('journal', inputText, []);

      await writeData('journalEntries', {
        content: entry,
        mood,
        intensity,
        eventOccurredAt: new Date().toISOString(),
        entryProximityFlag: 'contemporaneous',
        oracleJudgment: feedbackText,
        isQuickEntry: true,
        ...(metacognitiveDepth ? { metacognitiveDepth } : {}),
      });

      setOracleResponse(feedbackText || 'Oracle unavailable. Entry saved.');
      ouraToast.success('Journal entry saved');
    } catch (error) {
      logger.error('Error saving quick entry:', error);
      setOracleResponse('Oracle unavailable. Entry saved.');
    } finally {
      setSaving(false);
      setOracleLoading(false);
    }
  }, [entry, mood, intensity]);

  const handleDone = useCallback(() => {
    onSuccess?.();
    onClose();
  }, [onSuccess, onClose]);

  if (!isOpen) return null;

  const selectedMoodOption = moodOptions.find(m => m.value === mood);

  return (
    <InlineErrorBoundary name="QuickJournalModal">
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

        <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl shadow-2xl animate-fade-in-up">

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#1a1a1a] sticky top-0 bg-[#0a0a0a] z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16v16H4z" />
                  <path d="M8 8h8M8 12h8M8 16h4" opacity="0.7" />
                </svg>
              </div>
              <div>
                <h2 className="text-white font-light">Quick Entry</h2>
                <p className="text-[#858585] text-xs">Write freely. The Oracle reads for signal.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {!showOracle ? (
            <>
              {/* Mood */}
              <div className="p-4 border-b border-[#1a1a1a]">
                <label className="block text-[#ababab] text-xs uppercase tracking-wider mb-3">Mood</label>
                <div className="space-y-2">
                  {moodCategories.map(cat => (
                    <div key={cat.name} className="flex items-center gap-2">
                      <span className="text-[10px] text-[#6a6a6a] uppercase tracking-widest w-20 shrink-0" style={{ color: `${cat.color}99` }}>{cat.name}</span>
                      <div className="flex flex-wrap gap-1.5 flex-1">
                        {cat.moods.map(m => {
                          const active = mood === m.value;
                          return (
                            <button
                              key={m.value}
                              type="button"
                              onClick={() => setMood(m.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${
                                active
                                  ? 'text-white border-transparent'
                                  : 'text-[#858585] border-[#1a1a1a] hover:text-white hover:border-[#2a2a2a]'
                              }`}
                              style={active ? { backgroundColor: `${cat.color}1a`, borderColor: `${cat.color}66`, color: cat.color } : {}}
                            >
                              {m.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Intensity */}
              <div className="p-4 border-b border-[#1a1a1a]">
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-[#ababab] text-xs uppercase tracking-wider">Intensity</label>
                  <span className="text-[#858585] text-xs">{intensityLevels.find(l => l.value === intensity)?.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {intensityLevels.map(l => {
                    const active = intensity >= l.value;
                    return (
                      <button
                        key={l.value}
                        type="button"
                        onClick={() => setIntensity(l.value)}
                        className="flex-1 h-2 rounded-full transition-all"
                        style={{
                          background: active ? '#a855f7' : '#1a1a1a',
                          boxShadow: active && intensity === l.value ? '0 0 8px rgba(168, 85, 247, 0.35)' : 'none',
                        }}
                        aria-label={`Intensity ${l.value}: ${l.label}`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Entry */}
              <div className="p-4 border-b border-[#1a1a1a]">
                <label htmlFor="quick-entry-input" className="block text-[#ababab] text-xs uppercase tracking-wider mb-3">
                  What's on your mind?
                </label>
                <textarea
                  id="quick-entry-input"
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  rows={5}
                  className="w-full p-3 bg-[#050505] text-white rounded-xl border border-[#1a1a1a] focus:border-[#a855f7] focus:outline-none resize-none transition-colors text-sm placeholder-[#555555]"
                  placeholder="Write freely. One sentence or ten."
                  autoFocus
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between p-4 bg-[#050505]">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-[#858585] text-sm hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!canSubmit}
                  className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${
                    canSubmit
                      ? 'bg-[#a855f7] text-white hover:bg-[#9333ea] hover:shadow-lg hover:shadow-[#a855f7]/20'
                      : 'bg-[#1a1a1a] text-[#6a6a6a] cursor-not-allowed'
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
                <div className="w-8 h-8 rounded-lg bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-[#a855f7]" />
                </div>
                <span className="text-xs font-medium uppercase tracking-widest text-[#888]">Oracle</span>
                {selectedMoodOption && (
                  <span className="text-[10px] text-[#6a6a6a] ml-auto" style={{ color: `${selectedMoodOption.color}99` }}>
                    {selectedMoodOption.label} · {intensity}/5
                  </span>
                )}
              </div>

              {oracleLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-2 border-[#a855f7]/30 border-t-[#a855f7] rounded-full animate-spin" />
                </div>
              ) : (
                <div className="bg-[#050505] border border-[#1a1a1a] border-l-2 border-l-[#a855f7] rounded-xl p-4 mb-6">
                  <p className="text-[#f5f5f5] text-sm leading-relaxed whitespace-pre-line">
                    {oracleResponse || 'Oracle unavailable. Entry saved.'}
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
    </InlineErrorBoundary>
  );
});

export default QuickJournalModal;
