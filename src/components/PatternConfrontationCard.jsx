import { useEffect, useState } from 'react';
import { formatDriftSignalText } from '../utils/relapseTaxonomy';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import { readUserData, writeData, updateData } from '../utils/firebaseUtils';
import { COLLECTIONS, CONFRONTATION_FIELDS } from '../utils/schema';
import OracleModal from './OracleModal';
import ConfrontationHistoryPanel from './ConfrontationHistoryPanel';
import logger from '../utils/logger';

/**
 * PatternConfrontationCard — surfaces the top drift signal or rule violation
 * and lets the user confront it via the Oracle. Each confrontation writes a
 * document to COLLECTIONS.CONFRONTATIONS that powers:
 *   • the signal-key dedupe gate (once a signal is confronted or dismissed,
 *     it stays hidden until a NEW signal with a different key appears),
 *   • the OracleModal reaction capture (onReaction patches the same doc),
 *   • the inline ConfrontationHistoryPanel below the card,
 *   • the Confrontation Rate metric in clarityScore.js.
 *
 * Dedupe is purely signalKey-based — no time window. Resurfacing is driven
 * by the underlying drift detection: a different archetype, condition,
 * targetId, or signal type produces a different signalKey, which the dedupe
 * does not match against past confrontations, so the new signal appears.
 */

function buildSignalKey(activeSignal, violatedInWindow) {
  if (activeSignal) {
    const tail = activeSignal.archetype || activeSignal.condition || activeSignal.targetId || 'general';
    return `drift_${activeSignal.type}_${tail}`;
  }
  if (violatedInWindow > 0) return 'rule_violation';
  return null;
}

function buildSignalSnapshot(activeSignal, violatedInWindow, violatedRule) {
  if (activeSignal) {
    return { ...activeSignal };
  }
  return {
    violatedInWindow,
    ruleText: violatedRule?.ruleGoingForward || null,
  };
}

export default function PatternConfrontationCard({ signalReport, hardLessons = [] }) {
  const driftSignals = signalReport?.driftSignals || [];
  const violatedInWindow = signalReport?.ruleIntegrity?.violatedInWindow || 0;
  const activeSignal = driftSignals[0] || null;
  const signalKey = buildSignalKey(activeSignal, violatedInWindow);

  const [confrontations, setConfrontations] = useState([]);
  const [confrontationsLoaded, setConfrontationsLoaded] = useState(false);
  const [modalState, setModalState] = useState({ isOpen: false, content: '', isLoading: false, entryCount: null });
  const [activeDocId, setActiveDocId] = useState(null);
  const [localDismissedKey, setLocalDismissedKey] = useState(null);

  // Load past confrontations once on mount. Drives both the 24h dedupe
  // gate AND the inline history panel — single fetch, two consumers.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const docs = await readUserData(COLLECTIONS.CONFRONTATIONS);
        if (cancelled) return;
        setConfrontations(Array.isArray(docs) ? docs : []);
      } catch (err) {
        logger.warn('PatternConfrontationCard: failed to load confrontations', err?.message);
      } finally {
        if (!cancelled) setConfrontationsLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Signal-key-based dedupe: once a signalKey appears in past confrontations
  // (whether the user fully confronted or just dismissed via the × button),
  // hide the card for that signalKey indefinitely. A NEW signal with a
  // different key — different archetype, condition, target, or signal type —
  // will produce its own signalKey and re-surface the card. No time window.
  const alreadyConfronted = (() => {
    if (!signalKey) return false;
    return confrontations.some(
      (c) => c?.[CONFRONTATION_FIELDS.SIGNAL_KEY] === signalKey
    );
  })();

  // The local dismissal flag is synchronous — covers the gap between a
  // manual × dismiss write and the next mount fetch picking up the new
  // doc. Not used for confrontations: handleConfront updates `confrontations`
  // state directly, which the dedupe gate reads. (Setting localDismissed in
  // handleConfront caused a regression where the Oracle modal vanished a
  // second after appearing — the gate hid the entire component including
  // the modal.)
  const localDismissed = localDismissedKey && localDismissedKey === signalKey;
  const cardHidden = !activeSignal && violatedInWindow === 0
    || localDismissed
    || alreadyConfronted;

  const violatedRule = !activeSignal && violatedInWindow > 0
    ? (hardLessons || []).filter((l) => l?.isRuleViolation)[0]
    : null;

  const handleDismiss = () => {
    // Manual dismiss without confronting still hides the card until a
    // different signal appears — write a confrontation doc with no Oracle
    // response so the dedupe honors it. Tagged with reaction:'missed' so
    // the engagement reader doesn't count this as a real engagement, AND
    // so the archive shows the user dismissed without engaging.
    const nowIso = new Date().toISOString();
    const payload = {
      [CONFRONTATION_FIELDS.CREATED_AT]: nowIso,
      [CONFRONTATION_FIELDS.SIGNAL_KEY]: signalKey,
      [CONFRONTATION_FIELDS.SIGNAL_TYPE]: activeSignal ? 'drift' : 'rule_violation',
      [CONFRONTATION_FIELDS.SIGNAL_SNAPSHOT]: buildSignalSnapshot(activeSignal, violatedInWindow, violatedRule),
      [CONFRONTATION_FIELDS.PROMPT]: null,
      [CONFRONTATION_FIELDS.ORACLE_RESPONSE]: null,
      [CONFRONTATION_FIELDS.REACTION]: 'missed',
      [CONFRONTATION_FIELDS.FOLLOW_UP_RESPONSE]: null,
      [CONFRONTATION_FIELDS.ORACLE_ENGAGED]: false,
      // Engagement-rate signal: dismissing without confronting is a "miss"
      // for the Confrontation Rate metric in clarityScore.getConfrontationRate.
      oracleDismissed: true,
    };
    writeData(COLLECTIONS.CONFRONTATIONS, payload).catch((err) => {
      logger.warn('PatternConfrontationCard: dismissal write failed', err?.message);
    });
    setLocalDismissedKey(signalKey);
  };

  const handleConfront = async () => {
    let entryText;
    if (activeSignal) {
      const formatted = formatDriftSignalText(activeSignal);
      entryText = `The system has flagged a drift signal: ${formatted}. I want to confront this pattern before it compounds. What should I examine, and what is the specific move required now?`;
    } else if (violatedRule?.ruleGoingForward) {
      entryText = `A rule I committed to is showing violations: "${violatedRule.ruleGoingForward}". What made me believe this time would be different, and what decision is required now?`;
    } else {
      entryText = `${violatedInWindow} of my finalized rules have been violated in the last 14 days. What pattern am I most reluctant to name precisely?`;
    }

    setModalState({ isOpen: true, content: '', isLoading: true, entryCount: null });
    let response = '';
    try {
      const { text } = await generateAIFeedback('oracle', entryText, []);
      response = text || 'Oracle unavailable. The signal is still yours to confront.';
    } catch (error) {
      logger.error('Pattern confrontation Oracle error:', error);
      response = 'Oracle unavailable. The signal is still yours to confront.';
    }

    setModalState({
      isOpen: true,
      content: response,
      isLoading: false,
      entryCount: getCachedTotalEntryCount(),
    });

    // Persist the confrontation. The 24h dedupe + history panel + engagement
    // reader all read this doc.
    const nowIso = new Date().toISOString();
    const payload = {
      [CONFRONTATION_FIELDS.CREATED_AT]: nowIso,
      [CONFRONTATION_FIELDS.SIGNAL_KEY]: signalKey,
      [CONFRONTATION_FIELDS.SIGNAL_TYPE]: activeSignal ? 'drift' : 'rule_violation',
      [CONFRONTATION_FIELDS.SIGNAL_SNAPSHOT]: buildSignalSnapshot(activeSignal, violatedInWindow, violatedRule),
      [CONFRONTATION_FIELDS.PROMPT]: entryText,
      [CONFRONTATION_FIELDS.ORACLE_RESPONSE]: response,
      [CONFRONTATION_FIELDS.REACTION]: null,
      [CONFRONTATION_FIELDS.FOLLOW_UP_RESPONSE]: null,
      [CONFRONTATION_FIELDS.ORACLE_ENGAGED]: true,
    };
    try {
      const saved = await writeData(COLLECTIONS.CONFRONTATIONS, payload);
      if (saved?.id) {
        setActiveDocId(saved.id);
        // Adding the new doc to local state feeds the signalKey dedupe gate
        // on the next render after the modal closes — the card hides for
        // this signalKey until a different signal appears. Do NOT also set
        // localDismissedKey here; that would re-render and hide the modal
        // mid-conversation.
        setConfrontations((prev) => [{ ...payload, id: saved.id }, ...prev]);
      }
    } catch (err) {
      logger.warn('PatternConfrontationCard: confrontation write failed', err?.message);
    }
  };

  const handleReaction = async (reactionId) => {
    if (!activeDocId) return;
    try {
      await updateData(COLLECTIONS.CONFRONTATIONS, activeDocId, {
        [CONFRONTATION_FIELDS.REACTION]: reactionId,
      });
      setConfrontations((prev) => prev.map((c) =>
        c.id === activeDocId ? { ...c, [CONFRONTATION_FIELDS.REACTION]: reactionId } : c
      ));
    } catch (err) {
      logger.warn('PatternConfrontationCard: reaction write failed', err?.message);
    }
  };

  const handleFollowUpStored = async ({ followUpResponse } = {}) => {
    if (!activeDocId || !followUpResponse) return;
    try {
      await updateData(COLLECTIONS.CONFRONTATIONS, activeDocId, {
        [CONFRONTATION_FIELDS.FOLLOW_UP_RESPONSE]: followUpResponse,
      });
      setConfrontations((prev) => prev.map((c) =>
        c.id === activeDocId ? { ...c, [CONFRONTATION_FIELDS.FOLLOW_UP_RESPONSE]: followUpResponse } : c
      ));
    } catch (err) {
      logger.warn('PatternConfrontationCard: follow-up write failed', err?.message);
    }
  };

  const headline = activeSignal
    ? formatDriftSignalText(activeSignal)
    : `${violatedInWindow} of your finalized rules have been violated in the last 14 days.`;

  const label = activeSignal
    ? activeSignal.type.replace(/_/g, ' ')
    : 'rule violation';

  // While the initial confrontations fetch is in flight, render only the
  // modal (in case it's already open from a previous interaction). Avoids
  // a flash where the card briefly appears for a signal already confronted
  // today before the dedupe data lands.
  const showCard = confrontationsLoaded && !cardHidden;
  const showHistory = confrontationsLoaded;

  return (
    <>
      {showCard && (
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
                className="text-[#858585] hover:text-[#858585] transition-colors shrink-0"
                aria-label="Dismiss until a new signal appears"
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
      )}
      {showHistory && <ConfrontationHistoryPanel confrontations={confrontations} />}
      {/* Modal renders independently of card/history gating — closing the
          card after a successful confrontation must NOT unmount this. */}
      <OracleModal
        isOpen={modalState.isOpen}
        onClose={() => setModalState((prev) => ({ ...prev, isOpen: false }))}
        feedback={modalState.content}
        content={modalState.content}
        isLoading={modalState.isLoading}
        moduleName="oracle"
        entryText={modalState.isOpen ? headline : ''}
        entryModuleName="oracle"
        entryCount={modalState.entryCount}
        onReaction={handleReaction}
        onFollowUpStored={handleFollowUpStored}
      />
    </>
  );
}
