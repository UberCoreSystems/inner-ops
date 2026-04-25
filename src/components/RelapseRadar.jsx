
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { getAuth } from '../firebase';
import { writeData, readUserData, updateData } from '../utils/firebaseUtils';
import { archiveEntry, restoreEntry, deleteArchivedEntry, subscribeToArchive } from '../utils/archiveUtils';
import { redirectIfAuthLost } from '../utils/authErrorHandler';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import { detectDriftSignals } from '../utils/detectDriftSignals';
import VoiceInputButton from './VoiceInputButton';
import OracleModal from './OracleModal';
import ArchiveToggle from './ArchiveToggle';
import ouraToast from '../utils/toast';
import logger from '../utils/logger';
import { useOracleModal } from '../hooks/useOracleModal';
import { useOuraData } from '../hooks/useOuraData';
import {
  ARCHETYPE_IDS,
  HABIT_IDS,
  SUBSTANCE_OPTIONS,
  resolveArchetypeLabel,
  resolveHabitLabel,
  resolveSubstanceLabel,
  formatDriftSignalText,
} from '../utils/relapseTaxonomy';

// UXR-002 Spec 4: archetype IDs, habit IDs, and substance options live in
// src/utils/relapseTaxonomy.js. See that file for the rationale (self-
// verification theory, behavioral-descriptor labels over identity nouns).

const PRECURSOR_CONDITIONS = [
  'Sleep deprived',
  'Isolated',
  'High stress',
  'Major decision pending',
  'Social pressure',
  'Avoided something important',
  'Rationalizing',
  'Environmental exposure',
  'Craving',
  'Minimizing risk',
  'Bored / restless',
  'Emotionally numb',
  'None of the above',
];

const RelapseRadar = () => {
  const mountedRef = useRef(true);
  const [step, setStep] = useState(1);
  const [selectedSelf, setSelectedSelf] = useState('');
  const [selectedHabits, setSelectedHabits] = useState([]);
  const [substanceUse, setSubstanceUse] = useState([]);
  const [reflection, setReflection] = useState('');
  const [relapseEntries, setRelapseEntries] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const { oracleModal, openLoading: openOracleLoading, openWithContent: openOracleWithContent, close: closeOracle } = useOracleModal();
  const [currentEntryId, setCurrentEntryId] = useState(null);

  // BER-128: precursor capture + drift detection
  const [selectedPrecursors, setSelectedPrecursors] = useState([]);
  const [precursorContext, setPrecursorContext] = useState('');
  const [driftThreshold, setDriftThreshold] = useState(3);
  const [killTargets, setKillTargets] = useState([]);

  // BER-133: archetype-to-kill-list match prompt shown after submission
  const [archetypeMatchPrompt, setArchetypeMatchPrompt] = useState(null); // { targetName, targetId, archetype }

  // BER-139: event timestamp
  const [eventOccurredAt, setEventOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));

  // BER-136: capture entry text for Oracle regen
  const oracleEntryTextRef = useRef(null);
  const submittingRef = useRef(false);

  const [view, setView] = useState('active');
  const [archivedEntries, setArchivedEntries] = useState([]);

  // BER-182: Oura Ring biometric precursor data
  const {
    connected: ouraConnected,
    biometrics: ouraBiometrics,
    hrvBaseline,
    loading: ouraLoading,
    isPhysiologicalAlert,
    isHrvAlert,
    isReadinessAlert,
    connectOura,
  } = useOuraData();

  useEffect(() => {
    mountedRef.current = true;
    let unsubscribe = null;

    const setupAuthListener = async () => {
      const auth = await getAuth();
      if (!mountedRef.current) return;
      const unsub = onAuthStateChanged(auth, (user) => {
        if (!mountedRef.current) return;
        if (user) {
          loadRelapseEntries();
          readUserData('killTargets').then(targets => {
            if (mountedRef.current) setKillTargets(targets || []);
          }).catch(() => {});
        } else {
          setRelapseEntries([]);
          setKillTargets([]);
        }
      });
      if (mountedRef.current) {
        unsubscribe = unsub;
      } else {
        unsub();
      }
    };

    setupAuthListener();
    return () => {
      mountedRef.current = false;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Subscribe to archived relapse entries
  useEffect(() => {
    let unsub = null;
    let mounted = true;
    subscribeToArchive('relapseEntries', (data) => {
      if (mounted) setArchivedEntries(data);
    }).then(u => {
      if (mounted) unsub = u;
      else try { u(); } catch {}
    });
    return () => { mounted = false; if (unsub) try { unsub(); } catch {} };
  }, []);

  // Read journal cross-module extraction pre-fill on mount (set by Journal.jsx on confirm)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('relapse_extraction_prefill');
      if (!raw) return;
      sessionStorage.removeItem('relapse_extraction_prefill');
      const data = JSON.parse(raw);
      // Map extraction precursor conditions to PRECURSOR_CONDITIONS options
      if (Array.isArray(data.precursorConditions) && data.precursorConditions.length > 0) {
        const PRECURSOR_MAP = {
          isolation: 'Isolated',
          stress_without_coping: 'High stress',
          emotional_flooding: 'High stress',
          routine_disruption: 'Sleep deprived',
          rationalization: 'Rationalizing',
          environmental_exposure: 'Environmental exposure',
          craving: 'Craving',
          minimization: 'Minimizing risk',
          boredom: 'Bored / restless',
          numbness: 'Emotionally numb',
        };
        const mapped = [...new Set(
          data.precursorConditions.map(c => PRECURSOR_MAP[c]).filter(Boolean)
        )];
        if (mapped.length > 0) setSelectedPrecursors(mapped);
      }
      // Pre-fill precursor context with signal summary
      if (data.signalSummary) setPrecursorContext(data.signalSummary);
    } catch { /* ignore */ }
  }, []);

  const loadRelapseEntries = async () => {
    if (mountedRef.current) setLoadError(false);
    try {
      const entries = await readUserData('relapseEntries');
      if (mountedRef.current) setRelapseEntries(entries);
    } catch (error) {
      logger.error("Error loading relapse entries:", error);
      if (mountedRef.current) setLoadError(true);
    }
  };

  const archiveRelapseEntry = async (entry) => {
    if (!entry) return;
    setRelapseEntries(prev => prev.filter(e => e.id !== entry.id));
    try {
      await archiveEntry('relapseEntries', entry);
      ouraToast.success('Entry archived');
    } catch (error) {
      logger.error('Error archiving relapse entry:', error);
      setRelapseEntries(prev => [entry, ...prev]);
      ouraToast.error('Failed to archive entry');
    }
  };

  const restoreRelapseEntry = async (archived) => {
    try {
      await restoreEntry('relapseEntries', archived);
      setRelapseEntries(prev => [{ ...archived, archivedAt: undefined }, ...prev]);
      ouraToast.success('Entry restored');
    } catch (error) {
      logger.error('Error restoring relapse entry:', error);
      if (redirectIfAuthLost(error)) return;
      loadRelapseEntries();
      ouraToast.error('Failed to restore entry');
    }
  };

  const permanentlyDeleteRelapseEntry = async (archived) => {
    if (!window.confirm('Permanently delete this entry? This cannot be undone.')) return;
    try {
      await deleteArchivedEntry('relapseEntries', archived);
      ouraToast.success('Entry permanently deleted');
    } catch (error) {
      logger.error('Error permanently deleting relapse entry:', error);
      ouraToast.error('Failed to delete entry');
    }
  };

  const archetypeFrequency = useMemo(() => {
    if (relapseEntries.length === 0) return [];
    const counts = {};
    relapseEntries.forEach(e => {
      if (e.selectedSelf) counts[e.selectedSelf] = (counts[e.selectedSelf] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ id, label: resolveArchetypeLabel(id), count }));
  }, [relapseEntries]);

  const daysSinceLastRelapse = useMemo(() => {
    if (relapseEntries.length === 0) return null;
    const sorted = [...relapseEntries].sort((a, b) => {
      const aTime = a.createdAt?.toDate?.()?.getTime() ?? a.timestamp ?? 0;
      const bTime = b.createdAt?.toDate?.()?.getTime() ?? b.timestamp ?? 0;
      return bTime - aTime;
    });
    const latest = sorted[0].createdAt?.toDate?.() ?? (sorted[0].timestamp ? new Date(sorted[0].timestamp) : null);
    if (!latest || isNaN(latest.getTime())) return null;
    return Math.floor((Date.now() - latest.getTime()) / (1000 * 60 * 60 * 24));
  }, [relapseEntries]);

  const topHabit = useMemo(() => {
    const allHabits = relapseEntries.flatMap(e => e.selectedHabits || []);
    if (allHabits.length === 0) return null;
    const counts = {};
    allHabits.forEach(h => { counts[h] = (counts[h] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return top ? { id: top[0], label: resolveHabitLabel(top[0]), count: top[1] } : null;
  }, [relapseEntries]);

  const driftSignals = useMemo(() => {
    // Finding 14: detectDriftSignals now returns { signals, skippedCount }.
    const { signals } = detectDriftSignals(relapseEntries, killTargets, driftThreshold);
    return signals;
  }, [relapseEntries, killTargets, driftThreshold]);

  const crossSignalTimeline = useMemo(() => {
    const windowMs = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const events = [];

    relapseEntries.forEach(e => {
      const t = e.createdAt?.toDate?.()?.getTime() ?? e.timestamp ?? 0;
      if (now - t < windowMs) {
        events.push({ type: 'relapse', date: t, label: resolveArchetypeLabel(e.selectedSelf) || 'Relapse', id: e.id });
      }
    });

    killTargets.forEach(target => {
      (target.escapeData || []).forEach(escape => {
        if (!escape.date) return;
        const t = new Date(escape.date).getTime();
        if (now - t < windowMs) {
          events.push({ type: 'escape', date: t, label: target.title, id: `${target.id}-${escape.date}` });
        }
      });
    });

    return events.sort((a, b) => b.date - a.date);
  }, [relapseEntries, killTargets]);

  // BER-133: active kill targets correlated with dominant archetype (48h escape window)
  const archetypeKillTargets = useMemo(() => {
    if (!archetypeFrequency[0]) return [];
    const dominantArchetypeId = archetypeFrequency[0].id;
    const archetypeEntries = relapseEntries.filter(e => e.selectedSelf === dominantArchetypeId);
    const windowMs = 48 * 60 * 60 * 1000;
    const activeTargets = killTargets.filter(t => t.status === 'active');

    return activeTargets
      .map(target => {
        const correlatedEscapes = (target.escapeData || []).filter(escape => {
          if (!escape.date) return false;
          const escapeTime = new Date(escape.date).getTime();
          return archetypeEntries.some(entry => {
            const entryTime = entry.createdAt?.toDate?.()?.getTime() ?? entry.timestamp ?? 0;
            return Math.abs(escapeTime - entryTime) < windowMs;
          });
        }).length;
        return { target, correlatedEscapes };
      })
      .filter(({ correlatedEscapes }) => correlatedEscapes > 0)
      .sort((a, b) => b.correlatedEscapes - a.correlatedEscapes)
      .slice(0, 3);
  }, [archetypeFrequency, relapseEntries, killTargets]);

  const weeklyEntryCounts = useMemo(() => {
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;
    let thisWeek = 0;
    let lastWeek = 0;
    relapseEntries.forEach(e => {
      const t = e.createdAt?.toDate?.()?.getTime() ?? e.timestamp ?? 0;
      const age = now - t;
      if (age < oneWeekMs) thisWeek++;
      else if (age < 2 * oneWeekMs) lastWeek++;
    });
    return { thisWeek, lastWeek };
  }, [relapseEntries]);

  // BER-139: proximity ratio analytics
  const proximityStats = useMemo(() => {
    if (relapseEntries.length === 0) return null;
    const retrospective = relapseEntries.filter(e => e.entryProximityFlag === 'retrospective').length;
    const total = relapseEntries.length;
    const contemporaneous = total - retrospective;
    return { contemporaneous, retrospective, total };
  }, [relapseEntries]);

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const filteredRelapseEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return relapseEntries;

    return relapseEntries.filter((entry) => {
      // Search across stored IDs AND resolved behavioral-descriptor labels so
      // users can find historical entries using the new taxonomy.
      const haystack = [
        entry.selectedSelf,
        resolveArchetypeLabel(entry.selectedSelf),
        entry.selectedHabits?.join(' '),
        entry.selectedHabits?.map(resolveHabitLabel).join(' '),
        entry.substanceUse?.join(' '),
        entry.substanceUse?.map(resolveSubstanceLabel).join(' '),
        entry.reflection,
        entry.oracleFeedback,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [relapseEntries, searchQuery]);

  const handlePrecursorToggle = (condition) => {
    setSelectedPrecursors(prev =>
      prev.includes(condition)
        ? prev.filter(p => p !== condition)
        : [...prev, condition]
    );
  };

  const handleHabitToggle = (habit) => {
    setSelectedHabits(prev => 
      prev.includes(habit) 
        ? prev.filter(h => h !== habit)
        : [...prev, habit]
    );
  };

  const handleSubstanceToggle = (substance) => {
    setSubstanceUse(prev => 
      prev.includes(substance) 
        ? prev.filter(s => s !== substance)
        : [...prev, substance]
    );
  };

  const handleOracleReaction = async (reactionId) => {
    if (!currentEntryId) return;
    try {
      await updateData('relapseEntries', currentEntryId, { oracleReaction: reactionId });
    } catch (error) {
      logger.error('Error saving Oracle reaction:', error);
    }
  };

  const submitRelapseEntry = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      setLoading(true);
      
      // Show Oracle modal with loading state
      openOracleLoading();

      // BER-139: proximity flag
      const occurredAt = new Date(eventOccurredAt);
      const nowMs = Date.now();
      const gapHours = (nowMs - occurredAt.getTime()) / 3_600_000;
      const entryProximityFlag = gapHours > 12 ? 'retrospective' : 'contemporaneous';
      const proximityNote = entryProximityFlag === 'retrospective'
        ? ' [ENTRY CONTEXT: This entry was written significantly after the event. The user\'s recollection may be reconstructed rather than accurate. Weight behavioral specifics cautiously and probe for what details may have been edited by hindsight.]'
        : '';

      const archetypeLabelForPrompt = resolveArchetypeLabel(selectedSelf);
      const habitLabelsForPrompt = selectedHabits.map(resolveHabitLabel).join(', ');
      const substanceLabelsForPrompt = substanceUse.map(resolveSubstanceLabel).join(', ');
      const entryText = `Pattern: ${archetypeLabelForPrompt}, Habits: ${habitLabelsForPrompt}, Substances: ${substanceLabelsForPrompt}, Reflection: ${reflection}${selectedPrecursors.length ? `, Precursor conditions: ${selectedPrecursors.join(', ')}` : ''}${proximityNote}`;
      oracleEntryTextRef.current = entryText;
      const pastReflections = relapseEntries.slice(-3).map(entry => entry.reflection).filter(Boolean);
      const { text: oracleFeedback, closingQuestion: oracleClosingQuestion } = await generateAIFeedback('relapse', entryText, pastReflections);

      // BER-182: auto-include physiological precursor if Oura signals are below threshold
      const effectivePrecursors = isPhysiologicalAlert
        ? [...new Set([...selectedPrecursors, 'Physiological'])]
        : selectedPrecursors;

      // Save the entry before revealing reactions so currentEntryId is set
      const entry = {
        selectedSelf,
        selectedHabits,
        substanceUse,
        reflection,
        oracleFeedback,
        ...(oracleClosingQuestion ? { oracleClosingQuestion } : {}),
        precursorConditions: effectivePrecursors,
        precursorContext: precursorContext.trim() || null,
        eventOccurredAt: occurredAt.toISOString(),
        entryProximityFlag,
        ...(isPhysiologicalAlert && ouraBiometrics ? {
          physiologicalSignal: {
            hrv: ouraBiometrics.hrv,
            readinessScore: ouraBiometrics.readinessScore,
            sleepScore: ouraBiometrics.sleepScore,
            restingHeartRate: ouraBiometrics.restingHeartRate,
            hrvBaseline,
            isHrvAlert,
            isReadinessAlert,
          },
        } : {}),
      };

      const savedEntry = await writeData('relapseEntries', entry);
      setCurrentEntryId(savedEntry.id);
      const now = new Date();
      setRelapseEntries(prev => [{ ...savedEntry, createdAt: now, timestamp: now }, ...prev]);

      // Show Oracle feedback in modal
      openOracleWithContent(oracleFeedback, getCachedTotalEntryCount());

      ouraToast.success('Relapse check-in logged');

      // BER-133: check for archetype-kill-list correlation on new entry
      const submittedArchetype = selectedSelf;
      const archNow = Date.now();
      const windowMs = 48 * 60 * 60 * 1000;
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      const activeTargets = killTargets.filter(t => t.status === 'active');
      for (const target of activeTargets) {
        const dismissKey = `rl_kl_arch_${submittedArchetype}_${target.id}`;
        const dismissedAt = localStorage.getItem(dismissKey);
        if (dismissedAt && archNow - parseInt(dismissedAt, 10) < sevenDaysMs) continue;
        const hasCorrelatedEscape = (target.escapeData || []).some(escape => {
          if (!escape.date) return false;
          return Math.abs(new Date(escape.date).getTime() - archNow) < windowMs;
        });
        if (hasCorrelatedEscape) {
          setArchetypeMatchPrompt({ targetName: target.title, targetId: target.id, archetype: submittedArchetype });
          break;
        }
      }

      // Clear form
      setSelectedSelf('');
      setSelectedHabits([]);
      setSubstanceUse([]);
      setReflection('');
      setSelectedPrecursors([]);
      setPrecursorContext('');
      setEventOccurredAt(new Date().toISOString().slice(0, 16));
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 3000);

    } catch (error) {
      logger.error("Error generating Oracle feedback:", error);
      if (redirectIfAuthLost(error)) return;
      openOracleWithContent("Oracle unavailable. Check-in recorded.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const nextStep = () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      submitRelapseEntry();
    }
  };

  const prevStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <div className="oura-card p-6">
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-light text-white tracking-tight">The Signal</h2>
          <div className="text-sm text-gray-500">Step {step} of 5</div>
        </div>
        {/* Pattern Data */}
        {relapseEntries.length > 0 && step === 2 && (
          <div className="mb-6 oura-card border-l-4 border-oura-purple p-5">
            <h3 className="text-oura-purple font-light text-base mb-4 tracking-wide">PATTERN DATA</h3>
            <div className="space-y-2">
              {archetypeFrequency[0] && (
                <div className="text-gray-300 text-sm bg-oura-darker p-3 rounded-xl">
                  Top archetype: {archetypeFrequency[0].label} ({archetypeFrequency[0].count}×)
                </div>
              )}
              {topHabit && (
                <div className="text-gray-300 text-sm bg-oura-darker p-3 rounded-xl">
                  Top trigger: {topHabit.label} ({topHabit.count}×)
                </div>
              )}
              {daysSinceLastRelapse !== null && (
                <div className="text-gray-300 text-sm bg-oura-darker p-3 rounded-xl">
                  Last entry: {daysSinceLastRelapse === 0 ? 'today' : `${daysSinceLastRelapse}d ago`}
                </div>
              )}
              <div className="text-gray-300 text-sm bg-oura-darker p-3 rounded-xl">
                This week: {weeklyEntryCounts.thisWeek} {weeklyEntryCounts.thisWeek === 1 ? 'entry' : 'entries'} / Last week: {weeklyEntryCounts.lastWeek}
              </div>
              <div className="text-gray-400 text-sm bg-oura-darker p-3 rounded-xl">
                Total entries: {relapseEntries.length}
              </div>
              {proximityStats && proximityStats.total > 0 && (
                <div className="text-gray-400 text-sm bg-oura-darker p-3 rounded-xl">
                  Data quality: {Math.round((proximityStats.contemporaneous / proximityStats.total) * 100)}% contemporaneous / {Math.round((proximityStats.retrospective / proximityStats.total) * 100)}% retrospective
                </div>
              )}
            </div>
          </div>
        )}

        {/* Days since last relapse + archetype frequency — step 2 only */}
        {step === 2 && daysSinceLastRelapse !== null && (
          <div className="mb-6 flex items-center gap-3 oura-card p-4">
            <div className={`text-4xl font-light tabular-nums ${daysSinceLastRelapse === 0 ? 'text-red-400' : daysSinceLastRelapse < 3 ? 'text-oura-amber' : 'text-oura-cyan'}`}>
              {daysSinceLastRelapse}
            </div>
            <div>
              <div className="text-white text-sm font-light">day{daysSinceLastRelapse !== 1 ? 's' : ''} since last relapse</div>
              <div className="text-gray-500 text-xs">{relapseEntries.length} total check-in{relapseEntries.length !== 1 ? 's' : ''}</div>
            </div>
          </div>
        )}

        {step === 2 && archetypeFrequency.length >= 2 && (
          <div className="mb-6 oura-card p-5">
            <h3 className="text-xs text-gray-500 tracking-widest uppercase mb-4">Archetype Frequency</h3>
            <div className="space-y-2.5">
              {archetypeFrequency.map(({ id, label, count }) => {
                const maxCount = archetypeFrequency[0].count;
                const pct = Math.round((count / maxCount) * 100);
                return (
                  <div key={id} className="flex items-center gap-3">
                    <div className="text-gray-400 text-xs w-36 shrink-0 truncate">{label}</div>
                    <div className="flex-1 bg-oura-border rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-oura-blue transition-all duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="text-gray-500 text-xs w-4 text-right shrink-0">{count}</div>
                  </div>
                );
              })}
            </div>
            {archetypeKillTargets.length > 0 && (
              <div className="mt-5 pt-4 border-t border-oura-border">
                <div className="text-[10px] text-[#858585] uppercase tracking-widest mb-3">Active Ledger targets associated with this archetype:</div>
                <div className="space-y-2">
                  {archetypeKillTargets.map(({ target, correlatedEscapes }) => (
                    <Link
                      key={target.id}
                      to="/ledger"
                      className="flex items-center justify-between px-3 py-2.5 bg-oura-darker rounded-xl hover:bg-oura-border transition-colors"
                    >
                      <span className="text-gray-300 text-sm truncate">{target.title}</span>
                      <span className="text-red-400 text-xs shrink-0 ml-2">{correlatedEscapes} correlated escape{correlatedEscapes !== 1 ? 's' : ''}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="w-full bg-oura-border rounded-full h-2">
          <div
            className="bg-oura-blue h-2 rounded-full transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          ></div>
        </div>
      </div>

      {step === 1 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">What conditions were present in the 24–48 hours before this?</h3>
          <p className="text-gray-500 text-sm">Select all that apply. Select at least one before proceeding.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {PRECURSOR_CONDITIONS.map((condition) => (
              <button
                key={condition}
                onClick={() => handlePrecursorToggle(condition)}
                className={`p-4 rounded-2xl text-left transition-all duration-200 ${
                  selectedPrecursors.includes(condition)
                    ? 'bg-oura-blue text-black font-medium shadow-oura-glow-blue'
                    : 'bg-oura-card text-gray-300 hover:bg-oura-darker border border-oura-border'
                }`}
              >
                {condition}
              </button>
            ))}
          </div>
          {/* BER-182: Physiological precursor — Oura Ring */}
          {ouraConnected && ouraBiometrics && !ouraLoading && (
            <div className={`p-4 rounded-2xl border ${isPhysiologicalAlert ? 'border-red-500 bg-red-500/10' : 'border-oura-border bg-oura-card'}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500 uppercase tracking-widest">Physiological — Oura</span>
                {isPhysiologicalAlert && (
                  <span className="text-xs text-red-400 font-medium tracking-wide">PRECURSOR DETECTED</span>
                )}
              </div>
              <div className="text-xs text-gray-600 mb-3">
                as of {ouraBiometrics.date}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {ouraBiometrics.hrv != null && (
                  <div className={`p-3 rounded-xl ${isHrvAlert ? 'bg-red-900/40' : 'bg-oura-darker'}`}>
                    <div className={`text-xl font-light tabular-nums ${isHrvAlert ? 'text-red-400' : 'text-white'}`}>{Math.round(ouraBiometrics.hrv)}</div>
                    <div className="text-xs text-gray-500 mt-0.5">HRV (rmssd){isHrvAlert ? ' — below baseline' : ''}</div>
                    {isHrvAlert && hrvBaseline != null && (
                      <div className="text-xs text-red-400/70 mt-1">Baseline: {Math.round(hrvBaseline)}</div>
                    )}
                  </div>
                )}
                {ouraBiometrics.readinessScore != null && (
                  <div className={`p-3 rounded-xl ${isReadinessAlert ? 'bg-red-900/40' : 'bg-oura-darker'}`}>
                    <div className={`text-xl font-light tabular-nums ${isReadinessAlert ? 'text-red-400' : 'text-white'}`}>{ouraBiometrics.readinessScore}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Readiness{isReadinessAlert ? ' — below 60' : ''}</div>
                  </div>
                )}
                {ouraBiometrics.sleepScore != null && (
                  <div className="p-3 rounded-xl bg-oura-darker">
                    <div className="text-xl font-light tabular-nums text-white">{ouraBiometrics.sleepScore}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Sleep score</div>
                  </div>
                )}
                {ouraBiometrics.restingHeartRate != null && (
                  <div className="p-3 rounded-xl bg-oura-darker">
                    <div className="text-xl font-light tabular-nums text-white">{ouraBiometrics.restingHeartRate}</div>
                    <div className="text-xs text-gray-500 mt-0.5">Resting HR (bpm)</div>
                  </div>
                )}
              </div>
              {isPhysiologicalAlert && (
                <div className="mt-3 text-xs text-red-400 border-t border-red-500/20 pt-3">
                  Auto-flagged as physiological precursor. Will be recorded with this entry.
                </div>
              )}
            </div>
          )}
          {!ouraConnected && !ouraLoading && (
            <div className="p-4 rounded-2xl border border-oura-border bg-oura-card">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-600 uppercase tracking-widest">Physiological</span>
                <button
                  type="button"
                  onClick={connectOura}
                  className="text-xs text-gray-500 hover:text-oura-blue transition-colors"
                >
                  Connect Oura Ring
                </button>
              </div>
              <p className="text-gray-600 text-xs mt-2">Connect Oura Ring to capture biometric precursors automatically.</p>
            </div>
          )}

          <div>
            <label className="text-gray-500 text-xs uppercase tracking-widest mb-2 block">One-sentence context <span className="text-gray-600">(optional)</span></label>
            <input
              type="text"
              value={precursorContext}
              onChange={(e) => setPrecursorContext(e.target.value)}
              placeholder="Brief context — what was happening..."
              className="w-full p-3 bg-oura-card text-white rounded-xl border border-oura-border focus:border-oura-blue focus:outline-none text-sm transition-colors"
            />
          </div>
        </div>
      )}

      {step === 2 && driftSignals.length > 0 && (
        <div className="mb-6 space-y-1 animate-fade-in-up">
          {driftSignals.map((signal, idx) => (
            <p key={idx} className="text-gray-400 text-sm lowercase">
              {formatDriftSignalText(signal)}
            </p>
          ))}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">Which pattern showed up today?</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ARCHETYPE_IDS.map((id) => (
              <button
                key={id}
                onClick={() => setSelectedSelf(id)}
                className={`p-4 rounded-2xl text-left transition-all duration-200 ${
                  selectedSelf === id
                    ? 'bg-oura-blue text-black font-medium shadow-oura-glow-blue'
                    : 'bg-oura-card text-gray-300 hover:bg-oura-darker border border-oura-border'
                }`}
              >
                {resolveArchetypeLabel(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">What patterns emerged?</h3>
          <p className="text-gray-500 text-sm">Skip if none apply.</p>
          <div className="grid grid-cols-1 gap-3">
            {HABIT_IDS.map((id) => (
              <button
                key={id}
                onClick={() => handleHabitToggle(id)}
                className={`p-4 rounded-2xl text-left transition-all duration-200 ${
                  selectedHabits.includes(id)
                    ? 'bg-oura-blue text-black font-medium shadow-oura-glow-blue'
                    : 'bg-oura-card text-gray-300 hover:bg-oura-darker border border-oura-border'
                }`}
              >
                {resolveHabitLabel(id)}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">Any substance use?</h3>
          <p className="text-gray-500 text-sm">Skip if none apply.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {SUBSTANCE_OPTIONS.map((substance) => (
              <button
                key={substance}
                onClick={() => handleSubstanceToggle(substance)}
                className={`p-4 rounded-2xl text-left transition-all duration-200 ${
                  substanceUse.includes(substance)
                    ? 'bg-oura-blue text-black font-medium shadow-oura-glow-blue'
                    : 'bg-oura-card text-gray-300 hover:bg-oura-darker border border-oura-border'
                }`}
              >
                {substance}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-6 animate-fade-in-up">
          <h3 className="text-xl font-light text-white tracking-tight">Reflection</h3>
          <div className="relative">
            <textarea
              value={reflection}
              onChange={(e) => setReflection(e.target.value)}
              placeholder="What led to this? What can you learn? How will you recover?"
              className="w-full h-32 p-4 pr-14 bg-oura-card text-white rounded-2xl border border-oura-border focus:border-oura-blue focus:outline-none resize-none transition-all duration-200"
            />
            <div className="absolute right-2 top-2">
              <VoiceInputButton
                onTranscript={(transcript) => {
                  setReflection(prev => prev + (prev ? ' ' : '') + transcript);
                }}
                disabled={loading}
              />
            </div>
          </div>
          <div>
            <label className="block text-gray-500 text-xs uppercase tracking-widest mb-2 font-medium">When did this happen?</label>
            <input
              type="datetime-local"
              value={eventOccurredAt}
              max={new Date().toISOString().slice(0, 16)}
              onChange={(e) => setEventOccurredAt(e.target.value)}
              className="w-full px-4 py-2.5 bg-oura-card text-white rounded-xl border border-oura-border focus:border-oura-blue focus:outline-none transition-colors text-sm"
            />
          </div>
        </div>
      )}

      {submitSuccess && (
        <div className="mb-6 oura-card border-l-4 border-oura-cyan p-4 animate-fade-in-up">
          <p className="text-gray-300 text-sm">✅ Relapse entry submitted successfully! Resetting form...</p>
        </div>
      )}

      {archetypeMatchPrompt && (
        <div className="mb-6 oura-card border border-oura-amber/30 bg-oura-amber/5 p-4 animate-fade-in-up">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-gray-300 text-sm leading-relaxed">
                <span className="text-oura-amber">{archetypeMatchPrompt.targetName}</span> has been escaped in similar contexts under {resolveArchetypeLabel(archetypeMatchPrompt.archetype)}. Review the autopsy?
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                to="/ledger"
                className="text-xs px-3 py-1.5 bg-oura-amber/20 text-oura-amber rounded-lg hover:bg-oura-amber/30 transition-colors"
              >
                Review
              </Link>
              <button
                onClick={() => {
                  localStorage.setItem(`rl_kl_arch_${archetypeMatchPrompt.archetype}_${archetypeMatchPrompt.targetId}`, Date.now().toString());
                  setArchetypeMatchPrompt(null);
                }}
                className="text-gray-600 hover:text-gray-400 text-sm transition-colors"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-between mt-8 gap-4">
        <button
          onClick={prevStep}
          disabled={step === 1 || submitSuccess}
          className="px-6 py-3 bg-oura-card text-white rounded-2xl disabled:opacity-30 hover:bg-oura-darker transition-all duration-200 border border-oura-border"
        >
          Previous
        </button>
        <button
          onClick={nextStep}
          disabled={loading || submitSuccess || (step === 1 && selectedPrecursors.length === 0) || (step === 2 && !selectedSelf)}
          className="px-6 py-3 bg-oura-blue text-black font-medium rounded-2xl disabled:opacity-30 hover:bg-blue-400 transition-all duration-200"
        >
          {loading ? 'Submitting...' : submitSuccess ? 'Success!' : (step === 5 ? 'Submit' : 'Next')}
        </button>
      </div>

      {loadError && (
        <div className="mt-10 oura-card p-8 text-center">
          <p className="text-[#ef4444] mb-4 text-sm">Failed to load relapse entries. Please check your connection.</p>
          <button
            onClick={loadRelapseEntries}
            className="px-5 py-2.5 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 rounded-xl hover:bg-[#ef4444]/20 transition-colors text-sm font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {!loadError && ((relapseEntries.length > 0 || archivedEntries.length > 0) ? (
        <div className="mt-10">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-2xl font-light text-white tracking-tight">
                {view === 'archive' ? 'Archive' : 'Recent Entries'}{' '}
                {view === 'active' && (
                  <span className="text-gray-500 text-lg">
                    ({searchQuery.trim() ? `${filteredRelapseEntries.length}/${relapseEntries.length}` : relapseEntries.length})
                  </span>
                )}
              </h3>
              <ArchiveToggle
                view={view}
                onChange={setView}
                activeCount={relapseEntries.length}
                archiveCount={archivedEntries.length}
              />
            </div>
            {view === 'active' && (
            <div className="relative w-full sm:w-72">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search entries..."
                className="w-full px-4 py-2.5 bg-oura-card text-white rounded-xl border border-oura-border focus:border-oura-blue focus:outline-none transition-colors"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white text-xs"
                >
                  Clear
                </button>
              )}
            </div>
            )}
          </div>

          {view === 'archive' && (
            <div className="space-y-3">
              {archivedEntries.length === 0 ? (
                <div className="oura-card p-10 text-center">
                  <p className="text-gray-500 text-sm">No archived entries.</p>
                </div>
              ) : archivedEntries.map(entry => (
                <div key={entry.id} className="oura-card p-5 opacity-75 hover:opacity-100 transition-opacity">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-oura-blue font-light">{resolveArchetypeLabel(entry.selectedSelf)}</div>
                      <div className="text-gray-500 text-xs mt-1">
                        Archived {entry.archivedAt ? new Date(entry.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                      </div>
                      {entry.reflection && <p className="text-gray-400 text-sm mt-3 leading-relaxed">{entry.reflection.substring(0, 180)}{entry.reflection.length > 180 ? '…' : ''}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => restoreRelapseEntry(entry)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-oura-blue/30 text-oura-blue hover:bg-oura-blue/10 transition-colors"
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => permanentlyDeleteRelapseEntry(entry)}
                        className="px-3 py-1.5 text-xs rounded-lg border border-[#b45309]/30 text-[#b45309] hover:bg-[#b45309]/10 transition-colors"
                      >
                        Delete permanently
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'active' && (filteredRelapseEntries.length > 0 ? (
            <div className="space-y-3">
              {filteredRelapseEntries.slice(0, 3).map((entry) => (
                <div key={entry.id} className="oura-card p-5 hover:shadow-oura-glow-sm transition-shadow duration-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-oura-blue font-light text-lg">{resolveArchetypeLabel(entry.selectedSelf)}</div>
                      <div className="text-gray-500 text-sm mt-2">
                        {entry.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                    <button
                      onClick={() => archiveRelapseEntry(entry)}
                      aria-label="Archive entry"
                      title="Archive"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-oura-darker transition-colors shrink-0"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="4" width="18" height="4" rx="1" />
                        <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-gray-400 text-sm mt-3 leading-relaxed">
                    {entry.reflection?.substring(0, 100)}...
                  </div>
                  {entry.precursorConditions?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {entry.precursorConditions.map(c => (
                        <span key={c} className="text-[10px] px-2 py-0.5 rounded-full bg-oura-darker text-gray-400 border border-oura-border">{c}</span>
                      ))}
                    </div>
                  )}
                  {entry.oracleFeedback && (
                    <div className="mt-4 p-4 bg-oura-darker border-l-4 border-oura-purple rounded-xl">
                      <h4 className="text-oura-purple font-light text-sm mb-2 tracking-wide">ORACLE'S JUDGMENT</h4>
                      <div className="text-gray-300 text-xs leading-relaxed">
                        {entry.oracleFeedback.substring(0, 150)}...
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="oura-card p-6 text-center">
              <div className="text-2xl mb-2 opacity-40">🧭</div>
              <p className="text-gray-300 text-sm">
                {searchQuery.trim() ? `No matches for “${searchQuery.trim()}”` : 'No entries to show yet.'}
              </p>
              {searchQuery.trim() && (
                <button
                  onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                  className="mt-3 px-4 py-2 bg-oura-card border border-oura-border text-gray-300 rounded-xl hover:text-white hover:border-gray-500 transition-all text-xs"
                >
                  Clear Search
                </button>
              )}
            </div>
          ))}

          {crossSignalTimeline.length >= 2 && (
            <div className="mt-8">
              <h4 className="text-xs text-gray-500 tracking-widest uppercase mb-4">7-Day Cross-Signal Timeline</h4>
              <div className="relative space-y-0">
                {crossSignalTimeline.map((event, idx) => (
                  <div key={event.id} className="flex items-start gap-3 pb-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${event.type === 'relapse' ? 'bg-oura-amber' : 'bg-red-500'}`} />
                      {idx < crossSignalTimeline.length - 1 && <div className="w-px flex-1 bg-oura-border mt-1" style={{ minHeight: '24px' }} />}
                    </div>
                    <div className="pb-1">
                      <div className="text-gray-300 text-sm">{event.label}</div>
                      <div className={`text-xs mt-0.5 ${event.type === 'relapse' ? 'text-oura-amber' : 'text-red-400'}`}>
                        {event.type === 'relapse' ? 'Relapse' : 'Ledger Escape'} · {new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-10 oura-card p-10 text-center">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-oura-darker flex items-center justify-center text-2xl">
            🧭
          </div>
          <h3 className="text-lg font-light text-white mb-2">No relapse entries logged</h3>
          <p className="text-gray-500 text-sm">Log a check-in above. Patterns only become visible once you track them.</p>
        </div>
      ))}

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => { closeOracle(); setCurrentEntryId(null); }}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
        onReaction={handleOracleReaction}
        entryText={oracleEntryTextRef.current || ''}
        entryModuleName="Relapse Radar"
        entryCount={oracleModal.entryCount}
      />
    </div>
  );
};

export default RelapseRadar;
