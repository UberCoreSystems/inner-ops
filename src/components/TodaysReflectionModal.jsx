import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { writeData } from '../utils/firebaseUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { InlineErrorBoundary } from './ErrorBoundary';
import CrossModuleExtractionPrompts from './CrossModuleExtractionPrompts';
import { moodCategories, moodOptions, intensityLevels } from '../constants/moods';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  classifyAndExtract,
  stashKillListExtraction,
  stashRelapseExtraction,
  stashHardLessonExtraction,
} from '../utils/crossModuleExtraction';

// Today's Reflection mirrors the Journal page entry form: mood, intensity, freeform
// textarea. Trimmed layout for modal context — no category tabs, no rotating
// prompts — but the underlying shape (content + mood + intensity) and the
// Oracle feedback pass match Journal.jsx exactly so entries stay consistent
// across surfaces.

const TodaysReflectionModal = React.memo(function TodaysReflectionModal({ isOpen, onClose, onSuccess, initialEntry = '' }) {
  const navigate = useNavigate();
  const [entry, setEntry] = useState('');
  const [mood, setMood] = useState('focused');
  const [intensity, setIntensity] = useState(3);
  const [saving, setSaving] = useState(false);
  const [showOracle, setShowOracle] = useState(false);
  const [oracleResponse, setOracleResponse] = useState('');
  const [oracleLoading, setOracleLoading] = useState(false);
  const [extractions, setExtractions] = useState({ killList: null, relapseRadar: null, hardLesson: null });
  const [savedEntryId, setSavedEntryId] = useState(null);
  const textareaRef = useRef(null);

  const canSubmit = entry.trim().length > 0 && !saving;

  useEffect(() => {
    if (isOpen) {
      // When opened with a prefilled question (from Today's Reflection),
      // seed the textarea with `<question>\n\n` so the user can write the
      // answer below it. The cursor is placed at the end in the effect below.
      setEntry(initialEntry ? `${initialEntry}\n\n` : '');
      setMood('focused');
      setIntensity(3);
      setShowOracle(false);
      setOracleResponse('');
      setExtractions({ killList: null, relapseRadar: null, hardLesson: null });
      setSavedEntryId(null);
    }
  }, [isOpen, initialEntry]);

  // After a prefilled open, focus the textarea and place the cursor at the
  // end so typing lands directly in the answer position.
  useEffect(() => {
    if (!isOpen || !initialEntry) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    try { el.setSelectionRange(len, len); } catch { /* old browsers */ }
  }, [isOpen, initialEntry]);

  // Auto-grow the textarea so longer entries stay visible while the user
  // writes. Reset to 'auto' first so the height shrinks when content does.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [entry, isOpen]);

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

      const { text: feedbackText, metacognitiveDepth, closingQuestion } = await generateAIFeedback('journal', inputText, []);

      const saved = await writeData('journalEntries', {
        content: entry,
        mood,
        intensity,
        eventOccurredAt: new Date().toISOString(),
        entryProximityFlag: 'contemporaneous',
        oracleJudgment: feedbackText,
        isTodaysReflection: true,
        ...(metacognitiveDepth ? { metacognitiveDepth } : {}),
        ...(closingQuestion ? { oracleClosingQuestion: closingQuestion } : {}),
      });
      if (saved?.id) setSavedEntryId(saved.id);

      setOracleResponse(feedbackText || 'Oracle unavailable. Entry saved.');
      ouraToast.success('Journal entry saved');

      // Non-blocking cross-module classification + conditional extraction.
      // Mirrors the Journal page on-save flow so Today's Reflection surfaces the
      // same Hard Lesson / Ledger / Signal cards when warranted.
      const entrySnapshot = entry;
      classifyAndExtract(entrySnapshot)
        .then((results) => {
          if (results && (results.killList || results.relapseRadar || results.hardLesson)) {
            setExtractions({
              killList: results.killList,
              relapseRadar: results.relapseRadar,
              hardLesson: results.hardLesson,
            });
          }
        })
        .catch((err) => logger.error('[TodaysReflection] cross-module extraction failed:', err?.message));
    } catch (error) {
      logger.error("Error saving today's reflection:", error);
      setOracleResponse('Oracle unavailable. Entry saved.');
    } finally {
      setSaving(false);
      setOracleLoading(false);
    }
  }, [entry, mood, intensity]);

  const handleDismissKillList = useCallback(() => {
    setExtractions(prev => ({ ...prev, killList: null }));
  }, []);
  const handleDismissRelapse = useCallback(() => {
    setExtractions(prev => ({ ...prev, relapseRadar: null }));
  }, []);
  const handleDismissHardLesson = useCallback(() => {
    setExtractions(prev => ({ ...prev, hardLesson: null }));
  }, []);

  const handleConfirmKillList = useCallback((extraction) => {
    stashKillListExtraction(extraction);
    setExtractions(prev => ({ ...prev, killList: null }));
    onClose();
    navigate('/ledger');
  }, [navigate, onClose]);
  const handleConfirmRelapse = useCallback((extraction) => {
    stashRelapseExtraction(extraction);
    setExtractions(prev => ({ ...prev, relapseRadar: null }));
    onClose();
    navigate('/relapse');
  }, [navigate, onClose]);
  const handleConfirmHardLesson = useCallback((extraction) => {
    stashHardLessonExtraction(extraction, savedEntryId);
    setExtractions(prev => ({ ...prev, hardLesson: null }));
    onClose();
    navigate('/hardlessons');
  }, [navigate, onClose, savedEntryId]);

  const handleDone = useCallback(() => {
    onSuccess?.();
    onClose();
  }, [onSuccess, onClose]);

  // a11y: focus trap + Esc handler
  const trapRef = useFocusTrap(isOpen);

  if (!isOpen) return null;

  const selectedMoodOption = moodOptions.find(m => m.value === mood);

  return (
    <InlineErrorBoundary name="TodaysReflectionModal">
      <div role="dialog" aria-modal="true" aria-label="Today's reflection" className="fixed inset-0 z-50 flex items-center justify-center px-4">
        <button
          type="button"
          aria-label="Close today's reflection"
          onClick={onClose}
          className="absolute inset-0 bg-black/80 backdrop-blur-sm cursor-default"
        />

        <div ref={trapRef} className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl shadow-2xl animate-fade-in-up">

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
                <h2 className="text-white font-light">Today's Reflection</h2>
                <p className="text-[#858585] text-xs">Write freely. The Oracle reads for signal.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close today's reflection"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-all"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
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
                      <span className="text-[10px] text-[#858585] uppercase tracking-widest w-20 shrink-0" style={{ color: `${cat.color}99` }}>{cat.name}</span>
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
                <label htmlFor="todays-reflection-input" className="block text-[#ababab] text-xs uppercase tracking-wider mb-3">
                  What's on your mind?
                </label>
                <textarea
                  id="todays-reflection-input"
                  ref={textareaRef}
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  rows={5}
                  style={{ minHeight: '8rem', maxHeight: '60vh' }}
                  className="w-full p-3 bg-[#050505] text-white rounded-xl border border-[#1a1a1a] focus:border-[#a855f7] focus:outline-none resize-none transition-colors text-sm placeholder-[#555555] overflow-y-auto"
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
                      : 'bg-[#1a1a1a] text-[#858585] cursor-not-allowed'
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
                  <span className="text-[10px] text-[#858585] ml-auto" style={{ color: `${selectedMoodOption.color}99` }}>
                    {selectedMoodOption.label} · {intensity}/5
                  </span>
                )}
              </div>

              {oracleLoading ? (
                <div className="mb-6 border border-[#1a1a1a] animate-border-breathe rounded-2xl p-4 animate-fade-in-up">
                  <div className="flex items-center gap-3">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#a855f7] opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#a855f7]"></span>
                    </span>
                    <p className="text-white text-sm font-medium">
                      Reading the signal…
                    </p>
                  </div>
                </div>
              ) : (
                <div className="bg-[#050505] border border-[#1a1a1a] border-l-2 border-l-[#a855f7] rounded-xl p-4 mb-6">
                  <p className="text-[#f5f5f5] text-sm leading-relaxed whitespace-pre-line">
                    {oracleResponse || 'Oracle unavailable. Entry saved.'}
                  </p>
                </div>
              )}

              <CrossModuleExtractionPrompts
                extractions={extractions}
                onDismissKillList={handleDismissKillList}
                onDismissRelapseRadar={handleDismissRelapse}
                onDismissHardLesson={handleDismissHardLesson}
                onConfirmKillList={handleConfirmKillList}
                onConfirmRelapseRadar={handleConfirmRelapse}
                onConfirmHardLesson={handleConfirmHardLesson}
              />

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

export default TodaysReflectionModal;
