import { useState, useMemo, useEffect } from 'react';
import { AppIcon } from './AppIcons';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { coerceClosureResponseText } from '../utils/composeClosureFeedback';
import { parseDateOnlyLocal, parseDate } from '../utils/dateUtils';

// Shared vocabulary with KillClosureModal's kill mode — both write `closureTags`
// into the same confirmedKills records, so the values must not diverge.
const FRAMING_TAGS = [
  { value: 'identity_shifted', label: 'Identity shifted' },
  { value: 'environment_changed', label: 'Environment changed' },
  { value: 'cost_unbearable', label: 'Cost became unbearable' },
];

const ACCENT = '#4da6ff';
const BREACH = '#b45309';

// Ribbon cap. Long-running contracts accumulate hundreds of check-ins; showing
// the tail keeps the run legible on a 360px screen. Earlier days are summarized
// as a count rather than silently dropped.
const RIBBON_MAX = 60;

const formatDate = (value) => {
  // Date-only strings anchor at local noon (parseDateOnlyLocal) so they never
  // render a day early; everything else falls through to parseDate.
  const d = parseDateOnlyLocal(value) || parseDate(value);
  return d
    ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
};

function Ribbon({ checkIns }) {
  const shown = checkIns.length > RIBBON_MAX ? checkIns.slice(-RIBBON_MAX) : checkIns;
  const hidden = checkIns.length - shown.length;

  return (
    <div>
      <div className="flex flex-wrap gap-1" role="img" aria-label={`${checkIns.length} tracked days`}>
        {shown.map((c, i) => {
          const held = c?.held !== false;
          return (
            <span
              key={`${c?.date || i}-${i}`}
              title={`${c?.date || ''} — ${held ? (c?.backfilled ? 'reconciled' : 'held') : 'breached'}`}
              className="w-2.5 h-2.5 rounded-[2px] shrink-0"
              style={
                held
                  ? c?.backfilled
                    ? { backgroundColor: 'transparent', border: '1px solid #4a4a4a' }
                    : { backgroundColor: '#d1d1d1' }
                  : { backgroundColor: BREACH }
              }
            />
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-[10px] uppercase tracking-widest text-[#858585]">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[2px] bg-[#d1d1d1]" /> Held
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[2px] border border-[#4a4a4a]" /> Reconciled
        </span>
        {checkIns.some(c => c?.held === false) && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-[2px]" style={{ backgroundColor: BREACH }} /> Breached
          </span>
        )}
        {hidden > 0 && <span className="text-[#6a6a6a] normal-case tracking-normal">+{hidden} earlier days not shown</span>}
      </div>
    </div>
  );
}

function Stat({ value, label }) {
  return (
    <div className="flex-1 min-w-[80px]">
      <div className="text-2xl font-light tabular-nums text-white">{value}</div>
      <div className="text-[10px] uppercase tracking-widest text-[#858585] mt-1">{label}</div>
    </div>
  );
}

/**
 * ContractClosedModal — the closing sequence when a kill contract reaches its
 * threshold. Three phases:
 *
 *   dossier — the record shown back: the run, the figures, the intention that
 *             was pre-committed, and any breaches survived on the way.
 *   closure — one sentence of evidence plus optional framing. A close without a
 *             captured reason is a hollow event (same standard as the escape
 *             autopsy).
 *   oracle  — the Oracle reads the closure. Dismissable while in flight; the
 *             parent surfaces the response by toast if the user leaves.
 *
 * Everything rendered in the dossier is already on the contract record — this
 * component adds no reads and no new fields.
 */
export default function ContractClosedModal({
  isOpen,
  target,
  threshold,
  onClose,
  onSubmit,
  oraclePhase = 'idle',   // 'idle' | 'loading' | 'done'
  oracleResponse,
}) {
  const [phase, setPhase] = useState('dossier');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const dialogRef = useFocusTrap(isOpen);

  const checkIns = useMemo(
    () => (Array.isArray(target?.checkIns) ? target.checkIns.filter(Boolean) : []),
    [target],
  );

  // The parent keeps this mounted across opens, so reset per contract.
  useEffect(() => {
    if (isOpen) {
      setPhase('dossier');
      setNote('');
      setTags([]);
      setSubmitting(false);
    }
  }, [isOpen, target?.id]);

  if (!isOpen || !target) return null;

  const escapes = Array.isArray(target.escapeData) ? target.escapeData.filter(Boolean) : [];
  const intention = target.implementationIntention;
  const activeDuration = Number(target.activeDuration) || 0;
  const streak = Number(target.streak) || 0;
  const trackedDays = Number(target.totalTrackedDays) || checkIns.length;
  const canSubmit = note.trim().length > 0 && !submitting;

  // The Oracle phase is driven by the parent; it overrides the local step.
  const step = oraclePhase === 'idle' ? phase : 'oracle';

  // Re-opening an already-closed contract from the archive lands straight on
  // the Oracle step with no local input — echo what was persisted instead.
  const echoNote = note || target.closureNote || '';
  const echoTags = tags.length ? tags : (Array.isArray(target.closureTags) ? target.closureTags : []);

  const toggleTag = (value) => {
    setTags(prev => (prev.includes(value) ? prev.filter(t => t !== value) : [...prev, value]));
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

  const handleEscapeKey = (e) => {
    if (e.key !== 'Escape') return;
    if (step === 'closure' && note.trim()) {
      if (!window.confirm('Discard this closure? Your note will be lost.')) return;
    }
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
      onClick={step === 'oracle' && oraclePhase === 'done' ? onClose : undefined}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Contract closed"
        onKeyDown={handleEscapeKey}
        className="w-full max-w-lg bg-black border border-[#1a1a1a] rounded-2xl max-h-[calc(100dvh-2rem)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — the verdict. Present in every phase. */}
        <div className="p-6 pb-4 shrink-0 border-b border-[#1a1a1a]">
          <div className="flex items-start justify-between gap-3">
            <div className="text-xs uppercase tracking-widest mb-2" style={{ color: ACCENT }}>
              Contract Closed
            </div>
            <button
              onClick={onClose}
              aria-label="Dismiss"
              title="Dismiss"
              className="-mt-1 w-8 h-8 max-sm:w-11 max-sm:h-11 shrink-0 flex items-center justify-center rounded-full text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <h3 className="text-white text-xl font-light leading-snug line-through decoration-[#4a4a4a]">
            {target.title}
          </h3>
          <p className="text-[#858585] text-xs mt-2">
            {threshold} consecutive days held
            {formatDate(target.createdAt) && ` · opened ${formatDate(target.createdAt)}`}
            {formatDate(target.killedAt) && ` · closed ${formatDate(target.killedAt)}`}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'dossier' && (
            <div className="space-y-6">
              {checkIns.length > 0 && (
                <div>
                  <div className="text-[#ababab] text-xs uppercase tracking-widest mb-3">The run</div>
                  <Ribbon checkIns={checkIns} />
                </div>
              )}

              <div className="flex gap-4 flex-wrap">
                <Stat value={streak || threshold} label="Final streak" />
                <Stat value={trackedDays} label="Days tracked" />
                <Stat value={activeDuration} label="Days under contract" />
              </div>

              {activeDuration > threshold && (
                <p className="text-[#858585] text-sm leading-relaxed">
                  The contract was open for {activeDuration} days. {threshold} of them were the
                  unbroken run that closed it. The gap is the part that took the longest.
                </p>
              )}

              {escapes.length > 0 && (
                <div
                  className="p-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl"
                  style={{ borderLeft: `2px solid ${BREACH}` }}
                >
                  <div className="text-[#b45309] text-[10px] uppercase tracking-widest mb-2">
                    Breached {escapes.length} time{escapes.length !== 1 ? 's' : ''} before this
                  </div>
                  <p className="text-[#ababab] text-sm leading-relaxed">
                    {escapes[escapes.length - 1]?.rationalization
                      ? `The last thing you told yourself: "${escapes[escapes.length - 1].rationalization}"`
                      : 'The autopsies are on record.'}
                  </p>
                </div>
              )}

              {intention?.trigger && intention?.response && (
                <div className="p-4 bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl">
                  <div className="text-[#858585] text-[10px] uppercase tracking-widest mb-2">
                    What you pre-committed to
                  </div>
                  <p className="text-[#d1d1d1] text-sm leading-relaxed">
                    When <span className="text-white">{intention.trigger}</span>, I will{' '}
                    <span className="text-white">{intention.response}</span>.
                  </p>
                  <p className="text-[#858585] text-xs mt-3 leading-relaxed">
                    Whether that clause is what held, or whether something else did, is the
                    question worth answering before this closes.
                  </p>
                </div>
              )}
            </div>
          )}

          {step === 'closure' && (
            <>
              <label
                htmlFor="contract-closure-note"
                className="block text-[#ababab] text-sm uppercase tracking-wider mb-3"
              >
                What ended this?
              </label>
              <textarea
                id="contract-closure-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="One sentence. Be specific — what made this kill possible now?"
                rows={3}
                autoFocus
                className="w-full bg-[#0a0a0a] text-white p-4 rounded-xl border border-[#1a1a1a] focus:outline-none resize-none text-sm placeholder-[#828282] transition-colors"
                style={{ borderColor: note ? `${ACCENT}80` : undefined }}
              />

              <div className="mt-4">
                <div className="text-[#858585] text-xs uppercase tracking-widest mb-2">Optional framing</div>
                <div className="flex flex-wrap gap-2">
                  {FRAMING_TAGS.map(tag => {
                    const selected = tags.includes(tag.value);
                    return (
                      <button
                        key={tag.value}
                        type="button"
                        onClick={() => toggleTag(tag.value)}
                        className="px-3 py-1.5 rounded-lg text-xs transition-colors border"
                        style={
                          selected
                            ? { backgroundColor: `${ACCENT}1a`, color: ACCENT, borderColor: `${ACCENT}66` }
                            : { backgroundColor: '#0a0a0a', color: '#8a8a8a', borderColor: '#1a1a1a' }
                        }
                      >
                        {tag.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {step === 'oracle' && (
            <>
              <div className="mb-4 p-4 bg-[#0a0a0a] border rounded-xl" style={{ borderColor: `${ACCENT}33` }}>
                <div className="text-xs uppercase tracking-widest mb-2" style={{ color: ACCENT }}>
                  Closing Entry
                </div>
                <p className="text-[#d1d1d1] text-sm leading-relaxed">{echoNote}</p>
                {echoTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {echoTags.map(t => (
                      <span
                        key={t}
                        className="text-[10px] px-2 py-0.5 bg-[#1a1a1a] text-[#ababab] rounded-lg border border-[#2a2a2a]"
                      >
                        {FRAMING_TAGS.find(c => c.value === t)?.label || t}
                      </span>
                    ))}
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
                  <p className="text-[#d1d1d1] text-sm leading-relaxed italic">
                    {coerceClosureResponseText(oracleResponse)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="p-6 pt-4 shrink-0 border-t border-[#1a1a1a] flex justify-end gap-2">
          {step === 'dossier' && (
            <button
              onClick={() => setPhase('closure')}
              className="px-5 py-2.5 text-sm font-medium rounded-xl transition-colors"
              style={{ backgroundColor: ACCENT, color: '#000' }}
            >
              Close the contract
            </button>
          )}

          {step === 'closure' && (
            <>
              <button
                onClick={() => setPhase('dossier')}
                disabled={submitting}
                className="px-4 py-2.5 text-sm bg-[#1a1a1a] text-[#ababab] border border-[#2a2a2a] rounded-xl hover:text-white disabled:opacity-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="px-5 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:bg-[#1a1a1a] disabled:text-[#858585]"
                style={canSubmit ? { backgroundColor: ACCENT, color: '#000' } : undefined}
              >
                {submitting ? 'Recording…' : 'Record closure'}
              </button>
            </>
          )}

          {step === 'oracle' && (
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-medium rounded-xl transition-colors border"
              style={{ backgroundColor: `${ACCENT}1a`, color: ACCENT, borderColor: `${ACCENT}4d` }}
            >
              {oraclePhase === 'loading' ? 'Dismiss' : 'Acknowledge'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
