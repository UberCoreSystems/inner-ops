import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '../firebase';
import { readUserData, updateData, deleteData } from '../utils/firebaseUtils';
import { generateSynthesisBriefing } from '../utils/generateSynthesisBriefing';
import { composeSeededPreview } from '../utils/composeSeededPreview';
import { getUserProfile } from '../utils/userProfile';
import { COLLECTIONS, KILL_TARGET_FIELDS, HARD_LESSON_FIELDS } from '../utils/schema';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';

// Cap stored briefings per user. Anything older than the cap gets pruned
// after a successful Generate Now so the archive can't grow unbounded.
const MAX_STORED_BRIEFINGS = 24;

const CADENCE_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
];

const SIGNAL_DELTA_LABELS = {
  improving: 'Improving',
  stable: 'Stable',
  deteriorating: 'Deteriorating',
};

const SIGNAL_DELTA_COLORS = {
  improving: 'text-[#22c55e]',
  stable: 'text-[#ababab]',
  deteriorating: 'text-[#ef4444]',
};

export default function SynthesisBriefing() {
  const [userId, setUserId] = useState(null);
  const [briefings, setBriefings] = useState([]);
  const [reckonings, setReckonings] = useState([]);
  const [runningReckoning, setRunningReckoning] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [cadence, setCadence] = useState('weekly');
  const [selectedArchive, setSelectedArchive] = useState(null);
  // hasCrossModuleData gates the Generate Now button. Synthesis is a
  // cross-module read; with only journal entries the briefing has nothing
  // to converge on and produces boilerplate.
  const [hasCrossModuleData, setHasCrossModuleData] = useState(true);
  // Day-one seeded preview from onboarding answers — personalizes the empty
  // state so a user with no briefings still sees what synthesis will read.
  const [seededPreview, setSeededPreview] = useState(null);

  useEffect(() => {
    let unsubscribe;
    const setup = async () => {
      const auth = await getAuth();
      unsubscribe = onAuthStateChanged(auth, (user) => {
        setUserId(user?.uid || null);
        if (user) {
          loadBriefings();
        } else {
          setBriefings([]);
          setInitialLoading(false);
        }
      });
    };
    setup();
    return () => { if (unsubscribe) unsubscribe(); };
  }, []);

  const loadBriefings = async () => {
    setInitialLoading(true);
    try {
      const data = await readUserData('syntheses');
      const byRecency = (a, b) => new Date(b.generatedAt) - new Date(a.generatedAt);
      // Reckoning docs share the collection but are a distinct type — keep them
      // out of the synthesis briefing list and render them on their own surface.
      const sorted = (data || []).filter((d) => (d.type || 'synthesis') !== 'reckoning').sort(byRecency);
      setReckonings((data || []).filter((d) => d.type === 'reckoning').sort(byRecency));
      setBriefings(sorted);
      // The seeded teaser only renders in the empty state, so only pay for the
      // profile read when there are no briefings yet.
      if (sorted.length === 0) {
        getUserProfile().then((profile) => setSeededPreview(composeSeededPreview(profile)));
      }
    } catch (err) {
      logger.error('Failed to load syntheses:', err);
    } finally {
      setInitialLoading(false);
    }

    // Determine whether the user has any cross-module signal for synthesis.
    // The Generate Now button is disabled when all three are empty — a
    // journal-only user gets boilerplate convergence and a generic question.
    try {
      const [killTargets, hardLessons, relapseEntries] = await Promise.all([
        readUserData(COLLECTIONS.KILL_TARGETS).catch(() => []),
        readUserData(COLLECTIONS.HARD_LESSONS).catch(() => []),
        readUserData(COLLECTIONS.RELAPSE_ENTRIES).catch(() => []),
      ]);
      const hasActiveTarget = (killTargets || []).some(t => t[KILL_TARGET_FIELDS.STATUS] === 'active');
      const hasFinalizedRule = (hardLessons || []).some(l => l[HARD_LESSON_FIELDS.IS_FINALIZED]);
      const hasRelapseEntry = (relapseEntries || []).length > 0;
      setHasCrossModuleData(hasActiveTarget || hasFinalizedRule || hasRelapseEntry);
    } catch (err) {
      logger.warn('cross-module data check failed:', err?.message);
      // Fail open — don't lock the user out on a transient read error.
      setHasCrossModuleData(true);
    }
  };

  const pruneToCap = useCallback(async () => {
    try {
      const data = await readUserData('syntheses');
      const sorted = (data || []).sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
      const toDelete = sorted.slice(MAX_STORED_BRIEFINGS).filter(b => b.id);
      if (toDelete.length === 0) return;
      await Promise.all(toDelete.map(b => deleteData('syntheses', b.id)));
      logger.log(`pruned ${toDelete.length} briefing(s) over cap of ${MAX_STORED_BRIEFINGS}`);
    } catch (err) {
      logger.warn('prune-to-cap failed:', err?.message);
    }
  }, []);

  // Mark latest briefing as read when the page is opened
  useEffect(() => {
    if (briefings.length === 0) return;
    const latest = briefings[0];
    if (latest?.isNew === true && latest?.id) {
      updateData('syntheses', latest.id, { isNew: false, readAt: new Date().toISOString() }).catch(err => {
        logger.warn('Failed to mark synthesis as read:', err?.message);
      });
    }
  }, [briefings]);

  const handleGenerate = async () => {
    if (!userId || generating) return;
    if (!hasCrossModuleData) {
      ouraToast.info('Add a Kill Contract, Hard Lesson, or Relapse entry first.');
      return;
    }
    setGenerating(true);
    try {
      // Manual on-demand trigger bypasses the cadence gate. The generator
      // still enforces a 1-hour write-cooldown — repeat clicks within the
      // hour return the existing briefing (result.reused === true) instead
      // of piling up duplicates.
      const result = await generateSynthesisBriefing(userId, cadence, { bypassCadence: true });
      if (result?.status === 'ok' && result.briefing) {
        // Re-read from Firestore so local state matches what's actually
        // stored (including doc ids) instead of stacking a local copy.
        await loadBriefings();
        if (!result.reused) await pruneToCap();
        ouraToast.info(result.reused ? 'Latest briefing is under an hour old — showing it.' : 'Briefing generated');
      } else if (result?.status === 'locked') {
        ouraToast.info(`Next briefing eligible in ${result.remainingDays} day(s).`);
      } else if (result?.status === 'insufficient-data') {
        // Defense in depth — the button is already disabled by hasCrossModuleData,
        // but a stale flag from a race could let a click through.
        ouraToast.info('Add a Kill Contract, Hard Lesson, or Relapse entry first.');
      }
    } catch (err) {
      logger.error('Synthesis generation failed:', err);
      ouraToast.error('Failed to generate briefing');
    } finally {
      setGenerating(false);
    }
  };

  const handleRunReckoning = async () => {
    if (!userId || runningReckoning) return;
    if (!hasCrossModuleData) {
      ouraToast.info('Add a Kill Contract, Hard Lesson, or Relapse entry first.');
      return;
    }
    setRunningReckoning(true);
    try {
      // On-demand: bypass cadence; the engine still enforces the write-cooldown.
      const result = await generateSynthesisBriefing(userId, cadence, { mode: 'reckoning', bypassCadence: true });
      if (result?.status === 'ok') {
        await loadBriefings();
        ouraToast.info(result.reused ? 'Latest reckoning is under an hour old — showing it.' : 'The Reckoning is ready.');
      } else if (result?.status === 'insufficient-data') {
        ouraToast.info('No contradictions to reckon with this period.');
      }
    } catch (err) {
      logger.error('Reckoning generation failed:', err);
      ouraToast.error('Failed to run The Reckoning');
    } finally {
      setRunningReckoning(false);
    }
  };

  // Mark latest reckoning as read on open.
  useEffect(() => {
    const latest = reckonings[0];
    if (latest?.isNew === true && latest?.id) {
      updateData('syntheses', latest.id, { isNew: false, readAt: new Date().toISOString() }).catch((err) => {
        logger.warn('Failed to mark reckoning as read:', err?.message);
      });
    }
  }, [reckonings]);

  const handleDeleteBriefing = useCallback(async (briefingId) => {
    if (!briefingId) return;
    try {
      await deleteData('syntheses', briefingId);
      setBriefings(prev => prev.filter(b => b.id !== briefingId));
      setSelectedArchive(prev => (prev?.id === briefingId ? null : prev));
      ouraToast.info('Briefing deleted');
    } catch (err) {
      logger.error('Failed to delete briefing:', err);
      ouraToast.error('Delete failed');
    }
  }, []);

  const handleCleanupOldBriefings = useCallback(async () => {
    const sorted = [...briefings].sort((a, b) => new Date(b.generatedAt) - new Date(a.generatedAt));
    const toDelete = sorted.slice(1).filter(b => b.id);
    if (toDelete.length === 0) {
      ouraToast.info('Nothing to clean up.');
      return;
    }
    if (!window.confirm(`Delete ${toDelete.length} older briefing${toDelete.length === 1 ? '' : 's'}? The latest will be kept.`)) return;
    try {
      await Promise.all(toDelete.map(b => deleteData('syntheses', b.id)));
      await loadBriefings();
      ouraToast.info(`Deleted ${toDelete.length} briefing${toDelete.length === 1 ? '' : 's'}.`);
    } catch (err) {
      logger.error('Cleanup failed:', err);
      ouraToast.error('Cleanup failed');
    }
  }, [briefings]);

  const latestBriefing = briefings[0] || null;
  const archiveBriefings = briefings.slice(1);
  const displayBriefing = selectedArchive || latestBriefing;

  // "Sparse" briefing: no cross-module signal — every section will be generic.
  // Detect from meta so we can explain WHY the content reads as boilerplate.
  const meta = displayBriefing?.meta || {};
  const isSparseBriefing = displayBriefing && (
    !meta.dominantArchetype &&
    !meta.recentRelapseCount &&
    !meta.activeTargetCount &&
    !meta.highEscapeTargetCount &&
    !meta.finalizedRuleCount &&
    (!displayBriefing.violatedRules || displayBriefing.violatedRules.length === 0)
  );

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-[#858585] text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-black">
      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-10">
          <h1 className="text-2xl sm:text-4xl font-light text-white tracking-tight mb-3">Synthesis Briefing</h1>
          <p className="text-[#858585] text-sm leading-relaxed">
            Cross-module behavioral intelligence. What your own data reveals across domains.
          </p>
        </div>

        {/* Generate controls — always visible. Manual trigger bypasses cadence. */}
        <div className="oura-card p-6 mb-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[#ababab] text-sm mb-1">Run a briefing on-the-spot.</p>
              <p className="text-[#858585] text-xs">
                {hasCrossModuleData
                  ? 'The cadence below governs the automatic weekly/biweekly generation.'
                  : 'Synthesis needs cross-module data. Add a Kill Contract, Hard Lesson, or Relapse entry first.'}
              </p>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !hasCrossModuleData}
              title={!hasCrossModuleData ? 'Add a Kill Contract, Hard Lesson, or Relapse entry first' : undefined}
              className="px-6 py-2.5 bg-[#a855f7] hover:bg-[#9333ea] hover:shadow-lg hover:shadow-[#a855f7]/20 disabled:bg-[#1a1a1a] disabled:text-[#858585] disabled:shadow-none disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all text-sm flex items-center gap-2"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate now'
              )}
            </button>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-[#1a1a1a]">
            <span className="text-[#858585] text-xs uppercase tracking-widest mr-1">Auto cadence</span>
            {CADENCE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setCadence(opt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${cadence === opt.value ? 'bg-white text-black font-medium' : 'bg-[#1a1a1a] text-[#ababab] hover:text-white'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* The Reckoning — stated commitments vs documented behavior */}
        <div className="oura-card p-6 mb-8 border-l-2 border-[#b45309]">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[#b45309] text-xs font-medium uppercase tracking-widest mb-1">The Reckoning</p>
              <p className="text-[#858585] text-xs max-w-md">
                Your stated commitments laid against what you actually did. Every line traces to a logged event — no metrics, no averages.
              </p>
            </div>
            <button
              onClick={handleRunReckoning}
              disabled={runningReckoning || !hasCrossModuleData}
              title={!hasCrossModuleData ? 'Add a Kill Contract, Hard Lesson, or Relapse entry first' : undefined}
              className="px-6 py-2.5 bg-[#b45309] hover:bg-[#92400e] disabled:bg-[#1a1a1a] disabled:text-[#858585] disabled:cursor-not-allowed text-white rounded-xl font-medium transition-all text-sm"
            >
              {runningReckoning ? 'Reckoning…' : 'Run The Reckoning'}
            </button>
          </div>

          {reckonings[0] && (
            <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
              <p className="text-white text-sm leading-relaxed whitespace-pre-line mb-4">
                {reckonings[0].reckoningConfrontation}
              </p>
              <ul className="space-y-2">
                {(reckonings[0].contradictions || []).map((c, i) => (
                  <li key={i} className="text-xs">
                    <span className="text-[#ababab]">{c.commitment?.text}</span>
                    <span className="text-[#858585]">
                      {' '}— contradicted by {c.evidence?.length} logged event(s): {(c.evidence || []).map((e) => (e.date || '').slice(0, 10)).join(', ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-[#5a5a5a] text-[10px] mt-3">
                Generated {new Date(reckonings[0].generatedAt).toLocaleDateString()} · {reckonings[0].meta?.evidenceCount} events traced
              </p>
            </div>
          )}
        </div>

        {/* No briefings yet */}
        {briefings.length === 0 && (
          <>
            <div className="oura-card p-12 text-center">
              <p className="text-[#858585] text-sm mb-2">No briefings generated yet.</p>
              <p className="text-[#858585] text-xs">This is the one screen that reads every other module at once.</p>
              <p className="text-[#858585] text-xs mt-3 max-w-md mx-auto leading-relaxed">
                Synthesis reads across modules. Convergence detection sharpens once you have entries in at least two — the journal plus one of General Ledger, Hard Lessons, or the Signal.
              </p>
            </div>

            {/* Day-1 teaser: seeded from onboarding answers when available, else the
                structural shape of a real briefing. Never fabricated metrics. */}
            {(() => {
              const seeded = seededPreview && seededPreview.status !== 'empty';
              return (
                <div className="mt-6 opacity-60">
                  <p className="text-[#858585] text-xs uppercase tracking-widest mb-4">
                    {seeded ? 'Your first synthesis, seeded from what you declared' : 'Your first synthesis will look like'}
                  </p>
                  <div className="oura-card p-8 space-y-8">
                    <div>
                      <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">Convergence Point</div>
                      <p className="text-[#7a7a7a] text-sm leading-relaxed">
                        {seeded && seededPreview.direction
                          ? `You named your direction: “${seededPreview.direction}”. The briefing reads your journal, contracts, lessons, and signals against it.`
                          : 'Where your journal, contracts, lessons, and signals point at the same thing — named in one paragraph.'}
                      </p>
                    </div>
                    <div>
                      <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">Violated Rules</div>
                      <p className="text-[#7a7a7a] text-sm leading-relaxed">The rules you wrote and then broke this period, with how many times.</p>
                    </div>
                    <div>
                      <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">Signal Delta</div>
                      <p className="text-[#7a7a7a] text-lg font-light">Improving · Stable · Deteriorating</p>
                    </div>
                    <div className="border-t border-[#1a1a1a] pt-8">
                      <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">Confrontation Question</div>
                      <p className="text-[#7a7a7a] text-lg font-light leading-relaxed">
                        {seeded && seededPreview.firstQuestion
                          ? seededPreview.firstQuestion
                          : 'The one question your own data forces you to answer.'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* Current / selected briefing */}
        {displayBriefing && (
          <div className="mb-10">
            {selectedArchive && (
              <div className="flex items-center gap-3 mb-4">
                <button onClick={() => setSelectedArchive(null)} className="text-[#858585] text-xs hover:text-white transition-colors">← Latest</button>
                <span className="text-[#858585] text-xs">Archive record</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="text-[#858585] text-xs">
                {new Date(displayBriefing.generatedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                {' · '}
                {displayBriefing.cadencePeriod}
              </div>
              {displayBriefing.id && (
                <button
                  onClick={() => handleDeleteBriefing(displayBriefing.id)}
                  className="text-[#858585] text-xs hover:text-[#ef4444] transition-colors"
                  title="Delete this briefing"
                >
                  Delete
                </button>
              )}
            </div>

            {isSparseBriefing && (
              <div className="mb-6 border border-[#1a1a1a] bg-[#0a0a0a] rounded-xl px-4 py-3">
                <p className="text-[#ababab] text-sm leading-relaxed">
                  This briefing reads generic because there's no cross-module signal yet — no recent relapse entries, no active General Ledger contracts, no finalized Hard Lessons. Add data in two or more modules and the next briefing will surface real convergence.
                </p>
              </div>
            )}

            {/* Section 1: Convergence Point */}
            <div className="mb-8">
              <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">Convergence Point</div>
              <p className="text-[#d1d1d1] text-base leading-relaxed break-words">{displayBriefing.convergencePoint}</p>
            </div>

            {/* Section 2: Violated Rules */}
            <div className="mb-8">
              <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">Violated Rules</div>
              {displayBriefing.violatedRules?.length > 0 ? (
                <div className="space-y-2">
                  {displayBriefing.violatedRules.map((vr, idx) => (
                    <div key={idx} className="border-l-4 border-[#ef4444]/60 pl-4 py-1">
                      <p className="text-[#d1d1d1] text-sm">{vr.rule}</p>
                      <p className="text-[#858585] text-xs mt-0.5">{vr.source}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#858585] text-sm">No rule violations detected this period.</p>
              )}
            </div>

            {/* Section 3: Signal Delta */}
            <div className="mb-8">
              <div className="text-[#858585] text-xs uppercase tracking-widest mb-3">Signal Delta</div>
              <div className={`text-2xl font-light ${SIGNAL_DELTA_COLORS[displayBriefing.signalDelta] || 'text-[#ababab]'}`}>
                {SIGNAL_DELTA_LABELS[displayBriefing.signalDelta] || displayBriefing.signalDelta}
              </div>
              {displayBriefing.signalDeltaNote && (
                <p className="text-[#ababab] text-sm mt-3 leading-relaxed">{displayBriefing.signalDeltaNote}</p>
              )}
            </div>

            {/* Section 4: Confrontation Question */}
            <div className="border-t border-[#1a1a1a] pt-8">
              <div className="text-[#858585] text-xs uppercase tracking-widest mb-5">Confrontation Question</div>
              <p className="text-white text-lg sm:text-xl font-light leading-relaxed break-words">
                {displayBriefing.confrontationQuestion}
              </p>
            </div>
          </div>
        )}

        {/* Archive */}
        {archiveBriefings.length > 0 && (
          <div className="mt-10">
            <div className="flex items-center justify-between mb-4">
              <div className="text-[#858585] text-xs uppercase tracking-widest">Previous Briefings ({archiveBriefings.length})</div>
              <button
                onClick={handleCleanupOldBriefings}
                className="text-xs px-3 py-1.5 rounded-lg border border-[#1a1a1a] text-[#858585] hover:text-[#ef4444] hover:border-[#ef4444]/40 transition-colors"
                title="Delete every briefing except the latest"
              >
                Delete all but latest
              </button>
            </div>
            <div className="space-y-2">
              {archiveBriefings.map((b) => (
                <div
                  key={b.id || b.generatedAt}
                  className={`w-full flex items-center justify-between px-5 py-4 rounded-xl border transition-colors ${selectedArchive === b ? 'border-[#f59e0b]/40 bg-[#f59e0b]/5' : 'border-[#1a1a1a] hover:border-[#2a2a2a] bg-[#0a0a0a]'}`}
                >
                  <button
                    onClick={() => setSelectedArchive(b)}
                    className="text-left flex-1"
                  >
                    <div className="text-[#ababab] text-sm">
                      {new Date(b.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className={`text-xs mt-1 ${SIGNAL_DELTA_COLORS[b.signalDelta] || 'text-[#858585]'}`}>
                      {SIGNAL_DELTA_LABELS[b.signalDelta] || b.signalDelta}
                    </div>
                  </button>
                  {b.id && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBriefing(b.id); }}
                      className="ml-3 text-[#858585] text-xs hover:text-[#ef4444] transition-colors px-2"
                      title="Delete this briefing"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
