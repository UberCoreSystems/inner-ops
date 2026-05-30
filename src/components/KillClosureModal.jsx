import { useState, useEffect, useRef } from 'react';
import { AppIcon } from './AppIcons';
import { coerceClosureResponseText } from '../utils/composeClosureFeedback';

const MODE_CONFIG = {
  kill: {
    headerEyebrow: 'Closing Contract',
    prompt: 'What ended this?',
    placeholder: 'One sentence. Be specific — what made this kill possible now?',
    accent: '#4da6ff',
    submitLabel: 'Close Contract',
    tags: [
      { value: 'identity_shifted', label: 'Identity shifted' },
      { value: 'environment_changed', label: 'Environment changed' },
      { value: 'cost_unbearable', label: 'Cost became unbearable' },
    ],
  },
  escape: {
    headerEyebrow: 'Contract Breach',
    prompt: 'What caught you?',
    placeholder: 'One sentence. What surprised you, what did you miss?',
    accent: '#b45309',
    submitLabel: 'Log Breach',
    tags: [
      { value: 'trigger_surprised', label: 'Trigger surprised you' },
      { value: 'discipline_slipped', label: 'Discipline slipped' },
      { value: 'environment_failed', label: 'Environment failed' },
    ],
  },
};

/**
 * KillClosureModal — forces a closing entry when a kill contract ends
 * (killed) or breaks (escaped). A closure without a captured reason is
 * a hollow event. One sentence of evidence, optional framing tag, and a
 * one-line Oracle response.
 *
 * During Oracle loading the user may dismiss; the parent keeps the
 * Oracle call in flight and persists/toasts the response when it arrives.
 */
export default function KillClosureModal({
  isOpen,
  mode = 'kill',
  target,
  onClose,
  onSubmit,
  oraclePhase,     // 'idle' | 'loading' | 'done'
  oracleResponse,
}) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.kill;
  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNote('');
      setTags([]);
      setSubmitting(false);
    }
  }, [isOpen, target?.id, mode]);

  // Pass 3 New Finding 12 remediation: simple focus trap for keyboard users.
  // Captures the originating focus on open, traps Tab inside the modal, and
  // restores focus to the originating element on close. Keeps the dependency
  // footprint zero — no react-focus-lock import.
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  useEffect(() => {
    if (!isOpen) return;
    previousFocusRef.current = document.activeElement;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && oraclePhase !== 'idle') {
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
      // Restore focus to the originating element so keyboard users land back
      // where they were before the modal opened.
      const prior = previousFocusRef.current;
      if (prior && typeof prior.focus === 'function') {
        try { prior.focus(); } catch { /* element may have been removed */ }
      }
    };
  }, [isOpen, oraclePhase, onClose]);

  if (!isOpen || !target) return null;

  const canSubmit = note.trim().length > 0 && !submitting;

  const toggleTag = (value) => {
    setTags(prev =>
      prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value]
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({ note: note.trim(), tags });
    } catch {
      setSubmitting(false);
    }
  };

  const showForm = oraclePhase === 'idle';
  const showOracle = oraclePhase === 'loading' || oraclePhase === 'done';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={oraclePhase === 'done' ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={config.headerEyebrow}
        className="w-full max-w-lg bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div className="flex-1 min-w-0">
            <div
              className="text-xs uppercase tracking-widest mb-1"
              style={{ color: config.accent }}
            >
              {config.headerEyebrow}
            </div>
            <h3 className="text-white text-lg font-medium truncate">{target.title}</h3>
          </div>
          {/* Close button is always available once the write has landed. */}
          {oraclePhase !== 'idle' && (
            <button
              onClick={onClose}
              aria-label="Dismiss closure dialog"
              className="ml-3 w-8 h-8 flex items-center justify-center rounded-full text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors"
              title="Dismiss"
            >
              <span aria-hidden="true">✕</span>
            </button>
          )}
        </div>

        {showForm && (
          <>
            <label className="block text-[#ababab] text-sm uppercase tracking-wider mb-3">
              {config.prompt}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={config.placeholder}
              rows={3}
              autoFocus
              className="w-full bg-[#0a0a0a] text-white p-4 rounded-xl border border-[#1a1a1a] focus:outline-none resize-none text-sm placeholder-[#6a6a6a] transition-colors"
              style={{ borderColor: note ? `${config.accent}80` : undefined }}
            />

            <div className="mt-4">
              <div className="text-[#858585] text-xs uppercase tracking-widest mb-2">Optional framing</div>
              <div className="flex flex-wrap gap-2">
                {config.tags.map(tag => {
                  const selected = tags.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => toggleTag(tag.value)}
                      className="px-3 py-1.5 rounded-lg text-xs transition-colors border"
                      style={
                        selected
                          ? {
                              backgroundColor: `${config.accent}1a`,
                              color: config.accent,
                              borderColor: `${config.accent}66`,
                            }
                          : {
                              backgroundColor: '#0a0a0a',
                              color: '#8a8a8a',
                              borderColor: '#1a1a1a',
                            }
                      }
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm bg-[#1a1a1a] text-[#ababab] border border-[#2a2a2a] rounded-xl hover:text-white disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-5 py-2 text-sm font-medium rounded-xl transition-colors flex items-center gap-2 disabled:bg-[#1a1a1a] disabled:text-[#858585]"
                style={canSubmit ? { backgroundColor: config.accent, color: '#000' } : undefined}
              >
                {config.submitLabel}
              </button>
            </div>
          </>
        )}

        {showOracle && (
          <div className="py-2">
            <div
              className="mb-4 p-4 bg-[#0a0a0a] border rounded-xl"
              style={{ borderColor: `${config.accent}33` }}
            >
              <div
                className="text-xs uppercase tracking-widest mb-2"
                style={{ color: config.accent }}
              >
                {mode === 'kill' ? 'Closing Entry' : 'Breach Entry'}
              </div>
              <p className="text-[#d1d1d1] text-sm leading-relaxed">{note}</p>
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {tags.map(t => {
                    const def = config.tags.find(c => c.value === t);
                    return (
                      <span key={t} className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]">
                        {def?.label || t}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 bg-[#0a0a0a] border border-[#a855f7]/30 rounded-xl">
              <div className="text-[#a855f7] text-xs uppercase tracking-widest mb-2 flex items-center gap-2">
                <AppIcon name="insight" size={12} color="#a855f7" />
                Oracle
              </div>
              {oraclePhase === 'loading' ? (
                <div className="flex items-center gap-2 text-[#858585] text-sm italic">
                  <div className="w-3 h-3 border border-[#a855f7] border-t-transparent rounded-full animate-spin" />
                  Reading the closure…
                </div>
              ) : (
                <p className="text-[#d1d1d1] text-sm leading-relaxed italic">{coerceClosureResponseText(oracleResponse)}</p>
              )}
            </div>

            <div className="flex justify-end mt-5">
              <button
                onClick={onClose}
                className="px-5 py-2 text-sm font-medium rounded-xl transition-colors border"
                style={{
                  backgroundColor: `${config.accent}1a`,
                  color: config.accent,
                  borderColor: `${config.accent}4d`,
                }}
              >
                {oraclePhase === 'loading' ? 'Dismiss' : 'Acknowledge'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
