import { useEffect, useRef } from 'react';
import { categories } from '../utils/killListCategories';

const ACCENT = '#ef4444';

const categoryLabel = (value) =>
  categories.find((c) => c.value === value)?.label || 'Other';

/**
 * RedirectTargetModal — interrupts contract creation when the Oracle judges
 * the named target to be mis-framed. Shows the flaw in the framing and 1-3
 * truer targets the user can pursue instead. Non-blocking: "Keep my target"
 * proceeds with the original. Mirrors KillClosureModal's overlay + focus trap.
 */
export default function RedirectTargetModal({
  isOpen,
  originalTitle,
  critique,
  suggestions = [],
  onKeep,
  onAdopt,
  onClose,
}) {
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Framing Check"
        className="w-full max-w-lg bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5">
          <div className="text-xs uppercase tracking-widest mb-1" style={{ color: ACCENT }}>
            Framing Check
          </div>
          <h3 className="text-white text-lg font-medium">
            <span className="text-[#858585]">You named: </span>
            {originalTitle}
          </h3>
        </div>

        {critique && (
          <p className="text-[#d1d1d1] text-sm leading-relaxed mb-5">{critique}</p>
        )}

        <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">
          The real target
        </div>
        <div className="space-y-3">
          {suggestions.map((s, i) => (
            <div
              key={`${s.title}-${i}`}
              className="bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium">{s.title}</div>
                  <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]">
                    {categoryLabel(s.category)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onAdopt?.(s)}
                  className="shrink-0 px-3 py-1.5 text-xs rounded-lg border transition-colors"
                  style={{ borderColor: `${ACCENT}66`, color: ACCENT }}
                >
                  Pursue this instead
                </button>
              </div>
              {s.why && (
                <p className="text-[#858585] text-xs leading-relaxed mt-2.5">{s.why}</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-6 pt-5 border-t border-[#1a1a1a]">
          <button
            type="button"
            onClick={onKeep}
            className="px-5 py-2 text-sm font-medium rounded-xl bg-[#1a1a1a] text-[#ababab] border border-[#2a2a2a] hover:text-white transition-colors"
          >
            Keep my target
          </button>
        </div>
      </div>
    </div>
  );
}
