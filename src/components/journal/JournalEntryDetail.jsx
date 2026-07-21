import { useEffect, useRef } from 'react';
import { moodOptions, intensityLevels } from '../../constants/moods';
import { parseDate } from '../../utils/dateUtils';
import { MoodIcons } from './MoodIcons';
import OracleReactionChip from './OracleReactionChip';

/**
 * Full view of a single journal entry. The list rows carry only a snippet, so
 * this is where the entry, the Oracle reading, and any follow-up exchange are
 * read in full — nothing here is clamped.
 *
 * Overlay shell (Escape, Tab trap, focus restore) mirrors RedirectTargetModal.
 */
export default function JournalEntryDetail({ entry, onClose, onEdit, onArchive }) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!entry) return;
    previousFocusRef.current = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const prior = previousFocusRef.current;
      if (prior && typeof prior.focus === 'function') {
        try { prior.focus(); } catch { /* element may have been removed */ }
      }
    };
  }, [entry, onClose]);

  if (!entry) return null;

  const moodOption = moodOptions.find(m => m.value === entry.mood);
  const intensityLabel = intensityLevels.find(i => i.value === entry.intensity)?.label;
  const date = parseDate(entry.timestamp) || parseDate(entry.createdAt);
  const dateLabel = date
    ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Unknown date';
  const oracleText = typeof entry.oracleJudgment === 'string'
    ? entry.oracleJudgment
    : entry.oracleJudgment ? JSON.stringify(entry.oracleJudgment) : '';

  return (
    // z-[60] clears the mobile bottom nav (`fixed bottom-0 z-50`), which would
    // otherwise sit over the footer actions on a full-screen sheet.
    <div
      className="fixed inset-0 z-[60] sm:flex sm:items-center sm:justify-center sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Journal entry from ${dateLabel}`}
        className="flex flex-col h-full sm:h-auto w-full sm:max-w-2xl bg-[#0a0a0a] sm:border sm:border-[#2a2a2a] sm:rounded-2xl sm:max-h-[85vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-5 border-b border-[#1a1a1a] shrink-0">
          {moodOption ? (
            <div className="flex items-center space-x-3 min-w-0">
              <div
                className="w-10 h-10 rounded-full bg-black border border-[#1a1a1a] flex items-center justify-center shrink-0"
                style={{ color: moodOption.color }}
              >
                <span className="w-5 h-5 block">{MoodIcons[moodOption.value]}</span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium">{moodOption.label}</p>
                <p className="text-[#858585] text-xs">
                  {dateLabel}{intensityLabel ? ` · ${intensityLabel}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-[#858585] text-xs uppercase tracking-widest">{dateLabel}</div>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors"
            aria-label="Close entry"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-[#d1d1d1] leading-relaxed whitespace-pre-wrap">
            {entry.content}
          </p>

          {oracleText && (
            <div className="p-4 bg-black border border-[#1a1a1a] border-l-2 border-l-[#a855f7] rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[#888] font-medium text-xs uppercase tracking-widest">Oracle</h4>
                <OracleReactionChip reaction={entry.oracleReaction} />
              </div>
              <div className="text-[#f5f5f5] text-sm leading-relaxed whitespace-pre-line">
                {oracleText}
              </div>

              {entry.userResponse && typeof entry.userResponse === 'string' && (
                <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
                  <h5 className="text-[#888] font-medium text-xs mb-2 uppercase tracking-widest">Your Response</h5>
                  <div className="text-[#d1d1d1] text-sm leading-relaxed whitespace-pre-line">
                    {entry.userResponse}
                  </div>
                </div>
              )}

              {entry.oracleFollowUp && typeof entry.oracleFollowUp === 'string' && (
                <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
                  <h5 className="text-[#888] font-medium text-xs mb-2 uppercase tracking-widest">Oracle — Reflection</h5>
                  <div className="text-[#f5f5f5] text-sm leading-relaxed whitespace-pre-line">
                    {entry.oracleFollowUp}
                  </div>
                </div>
              )}

              {entry.classification?.reasoning && (
                <p className="text-[#828282] text-xs italic mt-4 pt-3 border-t border-[#1a1a1a] leading-relaxed">
                  Oracle: {entry.classification.reasoning}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 p-5 border-t border-[#1a1a1a] shrink-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="flex-1 px-4 py-2.5 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-white text-sm font-medium rounded-xl transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onArchive(entry.id)}
            className="px-4 py-2.5 bg-transparent border border-[#1a1a1a] text-[#858585] hover:text-[#b45309] hover:border-[#b45309]/30 text-sm font-medium rounded-xl transition-colors"
          >
            Archive
          </button>
        </div>
      </div>
    </div>
  );
}
