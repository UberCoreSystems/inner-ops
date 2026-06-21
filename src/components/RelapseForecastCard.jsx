import { useEffect, useMemo, useState } from 'react';
import { computeRelapseForecast } from '../utils/relapseForecast';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import { readUserData, writeData, updateData } from '../utils/firebaseUtils';
import { COLLECTIONS, CONFRONTATION_FIELDS } from '../utils/schema';
import { getEntryTimestamp } from '../utils/dateUtils';
import OracleModal from './OracleModal';
import logger from '../utils/logger';

/**
 * RelapseForecastCard — forward-looking confrontation for Relapse Radar.
 *
 * Surfaces ONLY when computeRelapseForecast fires (known antecedents of past
 * relapses are converging in the current window). The Oracle is called at most
 * once per convergence event: tap-to-fire (never on mount/render), deduped via
 * the confrontations signalKey so it shares the daily Oracle pool responsibly.
 * Below the trust gate (insufficient-signal) it renders nothing.
 */

const ANTECEDENT_LABELS = {
  'relapse:signal': 'a relapse precursor signal',
  'relapse:relapse': 'a relapse',
  'hardlesson:violation': 'breaking a hard-earned rule',
  'killlist:escape': 'a Kill List escape',
  'killlist:checkin_broke': 'a failed Kill List check-in',
  'killlist:checkin_held': 'a held Kill List check-in',
  'killlist:killed': 'killing a Kill List target',
  'killlist:created': 'naming a new Kill List target',
  'journal:entry': 'a journal entry',
};

function antecedentPhrase(a) {
  const label = ANTECEDENT_LABELS[a.type];
  if (!label) return null;
  const n = Math.max(1, Math.round(Number(a.lagMedian) || 0));
  const unit = a.lagUnit === 'hours' ? 'hours' : 'days';
  return `${label} (typically precedes by ~${n} ${unit})`;
}

function buildForecastEntryText(activeAntecedents, convergencePoint) {
  const phrases = activeAntecedents.map(antecedentPhrase).filter(Boolean);
  const list = phrases.join('; ');
  const conv = convergencePoint ? ` Standing convergence: ${convergencePoint}` : '';
  return (
    `Pre-failure check. These antecedents of my past relapses are active right now: ${list}.` +
    `${conv} No relapse has happened yet — this is the window before it.`
  );
}

export default function RelapseForecastCard({ relapseEntries = [], killTargets = [] }) {
  const [hardLessons, setHardLessons] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [synthesis, setSynthesis] = useState(null);
  const [confrontations, setConfrontations] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [dismissedKey, setDismissedKey] = useState(null);
  const [modalState, setModalState] = useState({ isOpen: false, content: '', isLoading: false, entryCount: null });
  const [activeDocId, setActiveDocId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lessons, journals, syntheses, confs] = await Promise.all([
          readUserData(COLLECTIONS.HARD_LESSONS).catch(() => []),
          readUserData(COLLECTIONS.JOURNAL_ENTRIES).catch(() => []),
          readUserData(COLLECTIONS.SYNTHESES).catch(() => []),
          readUserData(COLLECTIONS.CONFRONTATIONS).catch(() => []),
        ]);
        if (cancelled) return;
        setHardLessons(Array.isArray(lessons) ? lessons : []);
        setJournalEntries(Array.isArray(journals) ? journals : []);
        // Reuse the most recent synthesis briefing's signalDelta / convergencePoint
        // rather than re-deriving them here.
        const latest = (Array.isArray(syntheses) ? syntheses : [])
          .slice()
          .sort((a, b) => getEntryTimestamp(b) - getEntryTimestamp(a))[0] || null;
        setSynthesis(latest);
        setConfrontations(Array.isArray(confs) ? confs : []);
      } catch (err) {
        logger.warn('RelapseForecastCard: load failed', err?.message);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const forecast = useMemo(
    () =>
      computeRelapseForecast({
        killTargets,
        relapseEntries,
        hardLessons,
        journalEntries,
        now: Date.now(),
        signalDelta: synthesis?.signalDelta ?? null,
      }),
    [killTargets, relapseEntries, hardLessons, journalEntries, synthesis]
  );

  const alreadyConfronted =
    forecast.signalKey &&
    confrontations.some((c) => c?.[CONFRONTATION_FIELDS.SIGNAL_KEY] === forecast.signalKey);
  const dismissed = dismissedKey && dismissedKey === forecast.signalKey;
  const showCard = loaded && forecast.fired && !alreadyConfronted && !dismissed;

  const headline = useMemo(() => {
    if (!forecast.fired) return '';
    const phrases = forecast.activeAntecedents.map(antecedentPhrase).filter(Boolean);
    return `${phrases.length} known antecedent${phrases.length === 1 ? '' : 's'} of your past relapses ${phrases.length === 1 ? 'is' : 'are'} active right now: ${phrases.join('; ')}.`;
  }, [forecast]);

  const handleConfront = async () => {
    const entryText = buildForecastEntryText(forecast.activeAntecedents, synthesis?.convergencePoint);
    setModalState({ isOpen: true, content: '', isLoading: true, entryCount: null });

    let response = '';
    try {
      const { text } = await generateAIFeedback({
        moduleName: 'relapse',
        content: entryText,
        promptContextKey: 'relapse_forecast',
        promptContextParams: { activeCount: forecast.activeAntecedents.length },
      });
      response = text || 'Oracle unavailable. The signal is still yours to confront.';
    } catch (error) {
      logger.error('Relapse forecast Oracle error:', error);
      response = 'Oracle unavailable. The signal is still yours to confront.';
    }

    setModalState({ isOpen: true, content: response, isLoading: false, entryCount: getCachedTotalEntryCount() });

    const payload = {
      [CONFRONTATION_FIELDS.CREATED_AT]: new Date().toISOString(),
      [CONFRONTATION_FIELDS.SIGNAL_KEY]: forecast.signalKey,
      [CONFRONTATION_FIELDS.SIGNAL_TYPE]: 'relapse_forecast',
      [CONFRONTATION_FIELDS.SIGNAL_SNAPSHOT]: {
        activeAntecedents: forecast.activeAntecedents.map((a) => ({
          type: a.type, confidence: a.confidence, support: a.support,
          lagMedian: a.lagMedian, lagUnit: a.lagUnit,
        })),
        convergenceScore: forecast.convergenceScore,
      },
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
        // Feed the dedupe gate so the card hides for this convergence event.
        setConfrontations((prev) => [{ ...payload, id: saved.id }, ...prev]);
      }
    } catch (err) {
      logger.warn('RelapseForecastCard: confrontation write failed', err?.message);
    }
  };

  const handleReaction = async (reactionId) => {
    if (!activeDocId) return;
    try {
      await updateData(COLLECTIONS.CONFRONTATIONS, activeDocId, {
        [CONFRONTATION_FIELDS.REACTION]: reactionId,
      });
    } catch (err) {
      logger.warn('RelapseForecastCard: reaction write failed', err?.message);
    }
  };

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
                Pre-Failure Signal
              </p>
              <button
                onClick={() => setDismissedKey(forecast.signalKey)}
                className="text-[#858585] hover:text-white transition-colors shrink-0"
                aria-label="Dismiss until the pattern changes"
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
              {modalState.isLoading ? 'Oracle thinking' : 'Confront the pattern'}
            </button>
          </div>
        </section>
      )}
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
      />
    </>
  );
}
