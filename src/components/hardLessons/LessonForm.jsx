import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import {
  EVENT_CATEGORIES,
  COST_CATEGORIES,
  FIELD_LABELS,
  canSaveDraft,
  missingForFinalize,
} from '../../utils/lessonDraft';

export const ORACLE_MIN_CHARS = 30;
export const fieldId = (key) => `hl-field-${key}`;

const inputClass = (missing) =>
  `w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border ${missing ? 'border-[#ef4444]/60' : 'border-[#1a1a1a]'} focus:border-[#f59e0b] focus:outline-none transition-colors`;

const chipClass = (on) =>
  `px-3 min-h-11 rounded-xl border text-sm text-left transition-colors ${
    on ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-white' : 'border-[#1a1a1a] bg-[#0a0a0a] text-[#ababab] hover:border-[#2a2a2a]'
  }`;

function FieldLabel({ fieldKey, hint, missing, oracle, as = 'label' }) {
  const Tag = as;
  return (
    <div className="mb-3">
      <Tag
        {...(as === 'label' ? { htmlFor: fieldId(fieldKey) } : { id: `${fieldId(fieldKey)}-label` })}
        className="flex items-center gap-2 text-sm uppercase tracking-wider text-[#ababab]"
      >
        <span>{FIELD_LABELS[fieldKey]}</span>
        {oracle && <span className="text-[10px] normal-case tracking-normal px-1.5 py-0.5 rounded border border-[#4da6ff]/30 text-[#4da6ff]">Oracle</span>}
        {missing && <span className="text-[10px] normal-case tracking-normal text-[#ef4444]">Required to lock</span>}
      </Tag>
      {hint && <p className="text-xs text-[#858585] mt-1">{hint}</p>}
    </div>
  );
}

function Suggestion({ text, onUse }) {
  if (!text) return null;
  return (
    <div className="mt-2 px-4 py-3 rounded-xl border border-[#4da6ff]/20 bg-[#4da6ff]/5 flex items-start gap-3">
      <p className="flex-1 text-sm text-[#ababab] leading-relaxed">
        <span className="text-[#4da6ff]">Oracle's version: </span>{text}
      </p>
      <button
        type="button"
        onClick={onUse}
        className="shrink-0 px-3 min-h-11 rounded-lg border border-[#4da6ff]/30 text-[#4da6ff] text-xs hover:bg-[#4da6ff]/10 transition-colors"
      >
        Use this
      </button>
    </div>
  );
}

function RuleMatch({ ruleMatch, onAnswerMatch }) {
  if (!ruleMatch?.rule) return null;
  const { rule, answer, linking } = ruleMatch;
  return (
    <div className="mt-3 px-4 py-3 rounded-xl border border-[#b45309]/40 bg-[#b45309]/5" role="group" aria-label="Rule match">
      <p className="text-xs uppercase tracking-widest text-[#858585] mb-1">Matches your rule</p>
      <p className="text-[#fbbf24] text-sm leading-relaxed">{rule.ruleGoingForward}</p>
      {answer === 'broke' ? (
        <p className="text-xs text-[#ababab] mt-2">Break recorded on this rule. It is under review.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="text-sm text-white mr-1">Did this break it?</span>
          <button
            type="button"
            onClick={() => onAnswerMatch('broke')}
            disabled={linking}
            className="px-3 min-h-11 rounded-lg border border-[#ef4444]/40 text-[#ef4444] text-xs hover:bg-[#ef4444]/10 transition-colors disabled:opacity-40"
          >
            {linking ? 'Recording...' : 'It broke'}
          </button>
          <button
            type="button"
            onClick={() => onAnswerMatch('different')}
            disabled={linking}
            className="px-3 min-h-11 rounded-lg border border-[#2a2a2a] text-[#ababab] text-xs hover:text-white transition-colors disabled:opacity-40"
          >
            Different situation
          </button>
        </div>
      )}
    </div>
  );
}

function ReviewSheet({ draft, ruleMatch, onAnswerMatch, onLock, onBack, saving }) {
  const trapRef = useFocusTrap(true);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  const unanswered = ruleMatch?.rule && !ruleMatch.answer;
  return createPortal(
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-4">
      <div
        ref={trapRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="hl-review-title"
        tabIndex={-1}
        className="bg-[#0a0a0a] border border-[#2a2a2a] rounded-2xl max-w-lg w-full p-6 max-h-[85vh] overflow-y-auto"
      >
        <h3 id="hl-review-title" className="text-white text-lg font-light mb-1">Lock this lesson</h3>
        <p className="text-[#858585] text-xs mb-5">Locked lessons cannot be edited or archived.</p>
        <p className="text-xs uppercase tracking-widest text-[#858585] mb-1">The lesson</p>
        <p className="text-[#f59e0b] text-sm leading-relaxed mb-4">{draft.extractedLesson}</p>
        <p className="text-xs uppercase tracking-widest text-[#858585] mb-1">The rule going forward</p>
        <p className="text-[#fbbf24] text-sm leading-relaxed border-l-4 border-[#f59e0b] pl-3 mb-4">{draft.ruleGoingForward}</p>
        {unanswered && <RuleMatch ruleMatch={ruleMatch} onAnswerMatch={onAnswerMatch} />}
        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onLock}
            disabled={saving || ruleMatch?.linking}
            className="flex-1 px-5 min-h-11 bg-[#ef4444] hover:bg-[#dc2626] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-black rounded-xl font-medium transition-colors"
          >
            {saving ? 'Locking...' : 'Lock it'}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="px-5 min-h-11 bg-[#1a1a1a] hover:bg-[#2a2a2a] text-[#ababab] hover:text-white rounded-xl font-medium transition-colors"
          >
            Back
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/**
 * Controlled lesson form. The page owns the draft and every write; this
 * component owns only what is on screen (missing markers, review sheet).
 */
export default function LessonForm({
  draft,
  onChange,
  isEdit,
  oracle,
  ruleMatch,
  onAnswerMatch,
  onAskOracle,
  onUseSuggestion,
  onSaveDraft,
  onReview,
  onLock,
  onDiscard,
  onCollapse,
  saving,
}) {
  const [showMissing, setShowMissing] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const missing = missingForFinalize(draft);
  const isMissing = (key) => showMissing && missing.includes(key);
  const isOracle = (key) => (draft.oracleFilled || []).includes(key);
  const eventLength = draft.eventDescription.trim().length;
  const charsShort = Math.max(0, ORACLE_MIN_CHARS - eventLength);

  const hasAnalysis = !!(
    draft.eventCategory || draft.myAssumption.trim() || draft.signalIgnored.trim() ||
    draft.costDescription.trim() || draft.extractedLesson.trim() || draft.ruleGoingForward.trim() ||
    draft.costs.length || draft.oracleSuggestion
  );
  const showAll = expanded || isEdit || hasAnalysis || showMissing;

  const handleFinalize = () => {
    if (missing.length > 0) {
      setShowMissing(true);
      setExpanded(true);
      requestAnimationFrame(() => {
        const el = document.getElementById(fieldId(missing[0]));
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus?.({ preventScroll: true });
      });
      return;
    }
    onReview?.();
    setReviewOpen(true);
  };

  const toggleCost = (value) => {
    const costs = draft.costs.includes(value) ? draft.costs.filter(c => c !== value) : [...draft.costs, value];
    onChange({ costs });
  };

  const textArea = (key, placeholder, rows = 2) => (
    <textarea
      id={fieldId(key)}
      value={draft[key]}
      onChange={(e) => onChange({ [key]: e.target.value })}
      rows={rows}
      aria-invalid={isMissing(key) || undefined}
      className={`${inputClass(isMissing(key))} resize-none`}
      placeholder={placeholder}
    />
  );

  return (
    <div id="hl-form" className="oura-card p-5 sm:p-8 mb-8 border-l-4 border-[#f59e0b] scroll-mt-24">
      <div className="flex items-start justify-between gap-3 mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-white">{isEdit ? 'Edit draft' : 'Record a lesson'}</h2>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onDiscard}
            className="px-3 min-h-11 text-[#858585] hover:text-white text-xs uppercase tracking-widest transition-colors"
          >
            {isEdit ? 'Close' : 'Discard'}
          </button>
          <button
            type="button"
            onClick={onCollapse}
            className="px-3 min-h-11 text-[#858585] hover:text-white text-xs uppercase tracking-widest transition-colors"
          >
            Collapse
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div>
          <FieldLabel fieldKey="eventDescription" hint="What happened. Facts, no interpretation." missing={isMissing('eventDescription')} oracle={isOracle('eventDescription')} />
          {textArea('eventDescription', 'The concrete event.', 3)}
          {charsShort > 0 && eventLength > 0 && (
            <p className="text-xs text-[#858585] mt-2">{charsShort} more character{charsShort === 1 ? '' : 's'} for the Oracle.</p>
          )}
          <RuleMatch ruleMatch={ruleMatch} onAnswerMatch={onAnswerMatch} />
        </div>

        {oracle?.message && (
          <p role="status" className="px-4 py-3 rounded-xl border border-[#2a2a2a] bg-[#0a0a0a] text-sm text-[#ababab]">{oracle.message}</p>
        )}

        {!showAll && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="px-3 min-h-11 text-[#ababab] hover:text-white text-sm underline underline-offset-4 decoration-[#2a2a2a] transition-colors"
          >
            Fill in the rest now
          </button>
        )}

        {showAll && (
          <>
            <div>
              <FieldLabel fieldKey="eventCategory" as="p" missing={isMissing('eventCategory')} oracle={isOracle('eventCategory')} />
              <div id={fieldId('eventCategory')} tabIndex={-1} role="group" aria-labelledby={`${fieldId('eventCategory')}-label`} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {EVENT_CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    type="button"
                    aria-pressed={draft.eventCategory === cat.value}
                    onClick={() => onChange({ eventCategory: draft.eventCategory === cat.value ? '' : cat.value })}
                    className={chipClass(draft.eventCategory === cat.value)}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel fieldKey="myAssumption" hint="What you believed that turned out to be false." missing={isMissing('myAssumption')} oracle={isOracle('myAssumption')} />
              {textArea('myAssumption', 'I assumed that...')}
            </div>

            <div>
              <FieldLabel fieldKey="signalIgnored" hint="The warning you noticed and discounted." missing={isMissing('signalIgnored')} oracle={isOracle('signalIgnored')} />
              {textArea('signalIgnored', 'I ignored the signal that...')}
            </div>

            <div>
              <FieldLabel fieldKey="costs" as="p" hint="Select all that apply." missing={isMissing('costs')} oracle={isOracle('costs')} />
              <div id={fieldId('costs')} tabIndex={-1} role="group" aria-labelledby={`${fieldId('costs')}-label`} className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {COST_CATEGORIES.map(cost => (
                  <button
                    key={cost.value}
                    type="button"
                    aria-pressed={draft.costs.includes(cost.value)}
                    onClick={() => toggleCost(cost.value)}
                    className={chipClass(draft.costs.includes(cost.value))}
                  >
                    {cost.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel fieldKey="costDescription" hint="What it cost. Specific." missing={isMissing('costDescription')} oracle={isOracle('costDescription')} />
              {textArea('costDescription', 'The cost paid.')}
            </div>

            <div>
              <FieldLabel fieldKey="extractedLesson" hint="One sentence. Yours." missing={isMissing('extractedLesson')} oracle={isOracle('extractedLesson')} />
              <input
                id={fieldId('extractedLesson')}
                type="text"
                value={draft.extractedLesson}
                onChange={(e) => onChange({ extractedLesson: e.target.value })}
                aria-invalid={isMissing('extractedLesson') || undefined}
                className={inputClass(isMissing('extractedLesson'))}
                placeholder="The lesson is..."
              />
              {!draft.extractedLesson.trim() && (
                <Suggestion text={draft.oracleSuggestion?.extractedLesson} onUse={() => onUseSuggestion('extractedLesson')} />
              )}
            </div>

            <div>
              <FieldLabel fieldKey="ruleGoingForward" hint="An enforceable constraint, not advice. Yours." missing={isMissing('ruleGoingForward')} oracle={isOracle('ruleGoingForward')} />
              <input
                id={fieldId('ruleGoingForward')}
                type="text"
                value={draft.ruleGoingForward}
                onChange={(e) => onChange({ ruleGoingForward: e.target.value })}
                aria-invalid={isMissing('ruleGoingForward') || undefined}
                className={inputClass(isMissing('ruleGoingForward'))}
                placeholder="If... then... / Always... / Never..."
              />
              {!draft.ruleGoingForward.trim() && (
                <Suggestion text={draft.oracleSuggestion?.ruleGoingForward} onUse={() => onUseSuggestion('ruleGoingForward')} />
              )}
            </div>

            <button
              type="button"
              onClick={onAskOracle}
              disabled={oracle?.pending || saving || charsShort > 0}
              className="px-3 min-h-11 text-[#4da6ff] disabled:text-[#858585] text-sm underline underline-offset-4 decoration-[#4da6ff]/30 transition-colors"
            >
              {oracle?.pending ? 'Oracle reading...' : draft.isOracleExtracted ? 'Ask Oracle again' : 'Ask Oracle'}
            </button>
          </>
        )}

        <div className="flex gap-3 pt-4 border-t border-[#1a1a1a] max-sm:sticky max-sm:bottom-16 max-sm:bg-black/95 max-sm:backdrop-blur-sm max-sm:z-10 max-sm:py-3 max-sm:-mx-5 max-sm:px-5">
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={saving || !canSaveDraft(draft)}
            className="flex-1 sm:flex-none px-5 min-h-11 bg-[#f59e0b] hover:bg-[#ea580c] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-black rounded-2xl font-medium transition-colors"
          >
            {saving ? 'Saving...' : 'Save draft'}
          </button>
          {showAll ? (
            <button
              type="button"
              onClick={handleFinalize}
              disabled={saving || !canSaveDraft(draft)}
              className="flex-1 sm:flex-none px-5 min-h-11 bg-[#0a0a0a] border border-[#ef4444]/50 text-[#ef4444] hover:bg-[#ef4444]/10 disabled:border-[#1a1a1a] disabled:text-[#858585] rounded-2xl font-medium transition-colors"
            >
              Finalize...
            </button>
          ) : (
            <button
              type="button"
              onClick={onAskOracle}
              disabled={oracle?.pending || saving || charsShort > 0}
              className="flex-1 sm:flex-none px-5 min-h-11 bg-[#4da6ff] hover:bg-[#3d8fd9] disabled:bg-[#1a1a1a] disabled:text-[#858585] text-black rounded-2xl font-medium transition-colors"
            >
              {oracle?.pending ? 'Oracle reading...' : 'Ask Oracle'}
            </button>
          )}
        </div>
      </div>

      {reviewOpen && (
        <ReviewSheet
          draft={draft}
          ruleMatch={ruleMatch}
          onAnswerMatch={onAnswerMatch}
          saving={saving}
          onBack={() => setReviewOpen(false)}
          onLock={async () => {
            const ok = await onLock();
            if (ok !== false) setReviewOpen(false);
          }}
        />
      )}
    </div>
  );
}
