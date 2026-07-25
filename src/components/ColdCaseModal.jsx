import { useState, useEffect } from 'react';
import { AppIcon } from './AppIcons';
import { useFocusTrap } from '../hooks/useFocusTrap';

const ORACLE = '#a855f7';
const ENGAGE = '#ef4444';

/**
 * ColdCaseModal — the intent fork when a confirmed kill is reopened.
 *
 *   fork     — "Why are you back here?" Reference hands off to the read-only
 *              record (ContractClosedModal, via the parent); the other door
 *              opens the protocol.
 *   describe — one report: what the user is seeing now. Specifics, not mood.
 *   oracle   — the comparison against the file, driven by the parent
 *              (oraclePhase overrides the local step, same contract as
 *              ContractClosedModal). Ends in Re-engage or Walk away.
 *
 * The kill is never un-killed here. Re-engage only asks the parent to draft
 * a new lineage-linked contract.
 */
export default function ColdCaseModal({
  isOpen,
  kill,
  oraclePhase = 'idle',   // 'idle' | 'loading' | 'done'
  oracleResponse,
  onReference,
  onRunProtocol,
  onReengage,
  onClose,
}) {
  const [phase, setPhase] = useState('fork');
  const [description, setDescription] = useState('');
  const dialogRef = useFocusTrap(isOpen);

  // The parent keeps this mounted across opens, so reset per record.
  useEffect(() => {
    if (isOpen) {
      setPhase('fork');
      setDescription('');
    }
  }, [isOpen, kill?.id]);

  if (!isOpen || !kill) return null;

  const step = oraclePhase === 'idle' ? phase : 'oracle';
  const canRun = description.trim().length > 0;

  const handleEscapeKey = (e) => {
    if (e.key !== 'Escape') return;
    if (step === 'describe' && description.trim()) {
      if (!window.confirm('Close the file? Your report will be lost.')) return;
    }
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
      onClick={step === 'oracle' && oraclePhase === 'done' ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Cold case"
        onKeyDown={handleEscapeKey}
        className="w-full max-w-lg bg-black border border-[#1a1a1a] rounded-2xl max-h-[calc(100dvh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — present in every phase. */}
        <div className="p-6 pb-4 shrink-0 border-b border-[#1a1a1a]">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: ORACLE }}>
              Cold Case
            </div>
            <button
              onClick={onClose}
              aria-label="Close the file"
              title="Close the file"
              className="-mt-1 w-8 h-8 max-sm:w-11 max-sm:h-11 shrink-0 flex items-center justify-center rounded-full text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <h3 className="text-[#ababab] text-xl font-light leading-snug line-through decoration-[#4a4a4a]">
            {kill.title}
          </h3>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'fork' && (
            <div className="space-y-5">
              <p className="text-white text-lg font-light">Why are you back here?</p>
              <div className="space-y-3">
                <button
                  onClick={onReference}
                  className="w-full text-left p-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl hover:border-[#2a2a2a] transition-colors"
                >
                  <div className="text-white text-sm font-medium">Reference.</div>
                  <div className="text-[#858585] text-xs mt-1">Read the record. Leave it closed.</div>
                </button>
                <button
                  onClick={() => setPhase('describe')}
                  className="w-full text-left p-4 bg-[#0a0a0a] border rounded-xl transition-colors"
                  style={{ borderColor: `${ORACLE}33` }}
                >
                  <div className="text-sm font-medium" style={{ color: ORACLE }}>It&apos;s moving again.</div>
                  <div className="text-[#858585] text-xs mt-1">The pattern shows signs of life. Open the file.</div>
                </button>
              </div>
            </div>
          )}

          {step === 'describe' && (
            <>
              <label
                htmlFor="cold-case-report"
                className="block text-[#ababab] text-sm uppercase tracking-wider mb-3"
              >
                What are you seeing?
              </label>
              <textarea
                id="cold-case-report"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Specifics. When, where, what it looked like. Not how you feel about it."
                rows={4}
                autoFocus
                className="w-full bg-[#0a0a0a] text-white p-4 rounded-xl border border-[#1a1a1a] focus:outline-none resize-none text-sm placeholder-[#828282] transition-colors"
                style={{ borderColor: description ? `${ORACLE}80` : undefined }}
              />
            </>
          )}

          {step === 'oracle' && (
            <div className="p-4 bg-[#0a0a0a] border rounded-xl" style={{ borderColor: `${ORACLE}4d` }}>
              <div className="text-xs uppercase tracking-widest mb-2 flex items-center gap-2" style={{ color: ORACLE }}>
                <AppIcon name="insight" size={12} color={ORACLE} />
                Oracle
              </div>
              {oraclePhase === 'loading' ? (
                <div className="flex items-center gap-2 text-[#858585] text-sm italic">
                  <div className="w-3 h-3 border border-[#a855f7] border-t-transparent rounded-full animate-spin" />
                  Reading the file…
                </div>
              ) : (
                <p className="text-[#d1d1d1] text-sm leading-relaxed italic">{oracleResponse}</p>
              )}
            </div>
          )}
        </div>

        {/* Actions — the fork's doors are the actions; loading has none. */}
        {(step === 'describe' || (step === 'oracle' && oraclePhase === 'done')) && (
        <div className="p-6 pt-4 shrink-0 border-t border-[#1a1a1a] flex justify-end gap-2">
          {step === 'describe' && (
            <>
              <button
                onClick={() => setPhase('fork')}
                className="px-4 py-2.5 text-sm bg-[#1a1a1a] text-[#ababab] border border-[#2a2a2a] rounded-xl hover:text-white transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => canRun && onRunProtocol?.(description.trim())}
                disabled={!canRun}
                className="px-5 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:bg-[#1a1a1a] disabled:text-[#858585]"
                style={canRun ? { backgroundColor: ORACLE, color: '#000' } : undefined}
              >
                Run the comparison
              </button>
            </>
          )}

          {step === 'oracle' && oraclePhase === 'done' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2.5 text-sm bg-[#1a1a1a] text-[#ababab] border border-[#2a2a2a] rounded-xl hover:text-white transition-colors"
              >
                Walk away.
              </button>
              <button
                onClick={onReengage}
                className="px-5 py-2.5 text-sm font-medium rounded-xl transition-colors"
                style={{ backgroundColor: ENGAGE, color: '#fff' }}
              >
                Re-engage.
              </button>
            </>
          )}
        </div>
        )}
      </div>
    </div>
  );
}
