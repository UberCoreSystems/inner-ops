import React, { useState, useEffect, useCallback } from 'react';
import { writeData } from '../utils/firebaseUtils';
import { generateAIFeedback, composeJournalContent } from '../utils/aiFeedback';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { InlineErrorBoundary } from './ErrorBoundary';

// Quick capture still routes through the structural-frame pattern established
// in Journal.jsx (UXR-002 Spec 3). Mood selector UI was retired across the
// product — no icons, no valence groupings, no intensity rings. Two required
// fields: event (what happened) and attribution (what in you produced the
// reading). Expansion is intentionally omitted here — this modal is for fast
// capture; deeper reflection belongs in the Journal page.
const EVENT_MIN = 30;
const ATTRIBUTION_MIN = 40;

const QuickJournalModal = React.memo(function QuickJournalModal({ isOpen, onClose, onSuccess }) {
  const [event, setEvent] = useState('');
  const [attribution, setAttribution] = useState('');
  const [saving, setSaving] = useState(false);
  const [showOracle, setShowOracle] = useState(false);
  const [oracleResponse, setOracleResponse] = useState('');
  const [oracleLoading, setOracleLoading] = useState(false);

  const eventValid = event.trim().length >= EVENT_MIN;
  const attributionValid = attribution.trim().length >= ATTRIBUTION_MIN;
  const canSubmit = eventValid && attributionValid && !saving;

  // Reset transient state on open
  useEffect(() => {
    if (isOpen) {
      setEvent('');
      setAttribution('');
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
    if (!eventValid || !attributionValid) return;

    setSaving(true);
    try {
      const content = composeJournalContent({ event, attribution });

      const journalEntry = {
        content,
        event,
        attribution,
        expansion: null,
        createdAt: new Date().toISOString(),
        isQuickEntry: true,
      };

      await writeData('journalEntries', journalEntry);

      ouraToast.success('Quick journal entry saved');

      setOracleLoading(true);
      setOracleResponse('');
      setShowOracle(true);
      try {
        const { text: feedback } = await generateAIFeedback({
          moduleName: 'journal',
          event,
          attribution,
          pastEntries: [],
        });
        setOracleResponse(feedback);
      } catch (error) {
        logger.error('Oracle feedback error:', error);
      }
      setOracleLoading(false);
    } catch (error) {
      logger.error('Error saving quick entry:', error);
    } finally {
      setSaving(false);
    }
  }, [event, attribution, eventValid, attributionValid]);

  const handleDone = useCallback(() => {
    onSuccess?.();
    onClose();
  }, [onSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <InlineErrorBoundary name="QuickJournalModal">
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl bg-[#0a0a0a] border border-[#1a1a1a] rounded-2xl shadow-2xl animate-fade-in-up overflow-hidden">

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
              <p className="text-[#858585] text-xs">Name the event. Name what in you produced the reading.</p>
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
            {/* Field 1 — Event */}
            <div className="p-4 border-b border-[#1a1a1a]">
              <label htmlFor="quick-event-input" className="block text-white text-sm font-medium mb-1">
                What actually happened?
              </label>
              <p className="text-[#858585] text-xs mb-2">Time, place, what occurred, one concrete detail.</p>
              <textarea
                id="quick-event-input"
                value={event}
                onChange={(e) => setEvent(e.target.value)}
                rows={2}
                className={`w-full p-3 bg-[#050505] text-white rounded-xl border ${
                  event.length > 0 && !eventValid ? 'border-[#ef4444]/40' : 'border-[#1a1a1a]'
                } focus:border-[#00d4aa] focus:outline-none resize-none transition-colors text-sm`}
                placeholder="The event, in specifics."
                autoFocus
              />
              <div className={`mt-1 text-[11px] ${eventValid ? 'text-[#858585]' : 'text-[#ababab]'}`}>
                {event.trim().length}/{EVENT_MIN} {eventValid ? '— ok' : '— minimum not met'}
              </div>
            </div>

            {/* Field 2 — Attribution */}
            <div className="p-4 border-b border-[#1a1a1a]">
              <label htmlFor="quick-attribution-input" className="block text-white text-sm font-medium mb-1">
                What in me produced this reading of it?
              </label>
              <p className="text-[#858585] text-xs mb-2">The belief, pattern, or expectation that shaped your interpretation. Not how you felt — what produced the feeling.</p>
              <textarea
                id="quick-attribution-input"
                value={attribution}
                onChange={(e) => setAttribution(e.target.value)}
                rows={3}
                className={`w-full p-3 bg-[#050505] text-white rounded-xl border ${
                  attribution.length > 0 && !attributionValid ? 'border-[#ef4444]/40' : 'border-[#1a1a1a]'
                } focus:border-[#00d4aa] focus:outline-none resize-none transition-colors text-sm`}
                placeholder="The assumption, fear, or frame in you that produced this read."
              />
              <div className={`mt-1 text-[11px] ${attributionValid ? 'text-[#858585]' : 'text-[#ababab]'}`}>
                {attribution.trim().length}/{ATTRIBUTION_MIN} {attributionValid ? '— ok' : '— minimum not met'}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between p-4 border-t border-[#1a1a1a] bg-[#050505]">
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
