import React, { useState } from 'react';
import { formatDriftSignalText } from '../utils/relapseTaxonomy';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import OracleModal from './OracleModal';
import logger from '../utils/logger';

export default function PatternConfrontationCard({ signalReport, hardLessons = [] }) {
  const driftSignals = signalReport?.driftSignals || [];
  const violatedInWindow = signalReport?.ruleIntegrity?.violatedInWindow || 0;
  const activeSignal = driftSignals[0] || null;

  const signalKey = activeSignal
    ? `drift_${activeSignal.type}_${activeSignal.archetype || activeSignal.condition || activeSignal.targetId || 'general'}`
    : violatedInWindow > 0
      ? 'rule_violation'
      : null;
  const dismissKey = signalKey ? `confrontation_dismissed_${signalKey}` : null;

  const priorDismiss = (() => {
    if (!dismissKey) return null;
    const raw = sessionStorage.getItem(dismissKey);
    if (!raw) return null;
    const ts = parseInt(raw, 10);
    return Number.isFinite(ts) ? ts : null;
  })();
  const dismissedRecently = priorDismiss && (Date.now() - priorDismiss < 86400000);

  const [modalState, setModalState] = useState({ isOpen: false, content: '', isLoading: false, entryCount: null });
  const [localDismissed, setLocalDismissed] = useState(false);

  if (localDismissed || dismissedRecently) return null;
  if (!activeSignal && violatedInWindow === 0) return null;

  const handleDismiss = () => {
    if (dismissKey) sessionStorage.setItem(dismissKey, Date.now().toString());
    setLocalDismissed(true);
  };

  const handleConfront = async () => {
    let entryText;
    if (activeSignal) {
      const formatted = formatDriftSignalText(activeSignal);
      entryText = `The system has flagged a drift signal: ${formatted}. I want to confront this pattern before it compounds. What should I examine, and what is the specific move required now?`;
    } else {
      const violatedLessons = (hardLessons || []).filter(l => l?.isRuleViolation);
      const recent = violatedLessons[0];
      entryText = recent?.ruleGoingForward
        ? `A rule I committed to is showing violations: "${recent.ruleGoingForward}". What made me believe this time would be different, and what decision is required now?`
        : `${violatedInWindow} of my finalized rules have been violated in the last 14 days. What pattern am I most reluctant to name precisely?`;
    }

    setModalState({ isOpen: true, content: '', isLoading: true, entryCount: null });
    try {
      const { text } = await generateAIFeedback('oracle', entryText, []);
      setModalState({
        isOpen: true,
        content: text || 'Oracle unavailable. The signal is still yours to confront.',
        isLoading: false,
        entryCount: getCachedTotalEntryCount(),
      });
      if (dismissKey) sessionStorage.setItem(dismissKey, Date.now().toString());
    } catch (error) {
      logger.error('Pattern confrontation Oracle error:', error);
      setModalState({
        isOpen: true,
        content: 'Oracle unavailable. The signal is still yours to confront.',
        isLoading: false,
        entryCount: null,
      });
    }
  };

  const headline = activeSignal
    ? formatDriftSignalText(activeSignal)
    : `${violatedInWindow} of your finalized rules have been violated in the last 14 days.`;

  const label = activeSignal
    ? activeSignal.type.replace(/_/g, ' ')
    : 'rule violation';

  return (
    <>
      <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.07s' }}>
        <div
          className="oura-card p-6 border-l-2 border-[#b45309]"
          style={{ background: 'linear-gradient(90deg, rgba(180, 83, 9, 0.05) 0%, transparent 40%), linear-gradient(180deg, #0a0a0a 0%, #050505 100%)' }}
        >
          <div className="flex items-start justify-between mb-3">
            <p className="text-[#b45309] text-xs font-medium uppercase tracking-widest">
              Pattern Surfaced — {label}
            </p>
            <button
              onClick={handleDismiss}
              className="text-[#6a6a6a] hover:text-[#858585] transition-colors shrink-0"
              aria-label="Dismiss for 24 hours"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-white text-sm leading-relaxed mb-5">{headline}</p>
          <button
            onClick={handleConfront}
            disabled={modalState.isLoading}
            className="px-5 py-2.5 bg-white text-black text-sm font-medium rounded-xl hover:bg-[#d1d1d1] hover:shadow-[0_0_20px_rgba(255,255,255,0.08)] disabled:opacity-50 transition-all"
          >
            {modalState.isLoading ? 'Oracle thinking' : 'Confront this'}
          </button>
        </div>
      </section>
      <OracleModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
        feedback={modalState.content}
        content={modalState.content}
        loading={modalState.isLoading}
        isLoading={modalState.isLoading}
        moduleName="oracle"
        entryText={modalState.isOpen ? headline : ''}
        entryModuleName="oracle"
        entryCount={modalState.entryCount}
      />
    </>
  );
}
