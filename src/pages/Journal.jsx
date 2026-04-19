import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { writeData, readUserData, deleteData, updateData } from '../utils/firebaseUtils';
import { generateAIFeedback, composeJournalContent } from '../utils/aiFeedback';
import { getCachedTotalEntryCount, getBehavioralContext } from '../utils/getBehavioralContext';
import VoiceInputButton from '../components/VoiceInputButton';
import OracleModal from '../components/OracleModal';
import ouraToast from '../utils/toast';
import { useOracleModal } from '../hooks/useOracleModal';
import { SkeletonList, SkeletonJournalEntry } from '../components/SkeletonLoader';
import CrossModuleExtractionPrompts from '../components/CrossModuleExtractionPrompts';
import logger from '../utils/logger';

// Journaling in Inner Ops is structured reflection for signal extraction,
// not mood logging. Mood icons / valence groupings were retired in
// UXR-002 Spec 3. Three-field frame: event → attribution → expansion.
// Field character minimums (ergonomic floors, not scoring inputs).
const EVENT_MIN = 30;
const ATTRIBUTION_MIN = 40;

// Pain/failure signals that suggest a journal entry contains a hard lesson
const PAIN_SIGNALS = /\b(mistake|regret|fail|failed|failure|lost|betrayed|betrayal|trusted|cost me|paid for|learned the hard way|should have|shouldn't have|never again|boundary|violated|ignored|warning|hurt|burned|screwed up|blew it|ruined|wrecked)\b/i;

export default function Journal() {
  const navigate = useNavigate();

  // Structured entry state
  const [event, setEvent] = useState('');
  const [attribution, setAttribution] = useState('');
  const [expansion, setExpansion] = useState('');
  const [eventOccurredAt, setEventOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));

  const [entries, setEntries] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const { oracleModal, openLoading: openOracleLoading, openWithContent: openOracleWithContent, close: closeOracle } = useOracleModal();
  const [currentEntryId, setCurrentEntryId] = useState(null);
  const pendingEntryDeletes = useRef(new Map());

  // State for rotating prompts
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // Entry editing state
  const [editingEntryId, setEditingEntryId] = useState(null);

  // Field validation — gates the expansion field and the submit button
  const eventValid = event.trim().length >= EVENT_MIN;
  const attributionValid = attribution.trim().length >= ATTRIBUTION_MIN;
  const expansionUnlocked = eventValid && attributionValid;

  // Extract the Oracle's closing question from recent entries (last sentence ending with ?)
  const oraclePrompts = useMemo(() => {
    try {
      const questions = [];
      for (const e of entries.slice(0, 10)) {
        if (!e.oracleJudgment || typeof e.oracleJudgment !== 'string') continue;
        const sentences = e.oracleJudgment.split(/(?<=[?])\s+/).filter(Boolean);
        const lastQ = [...sentences].reverse().find((s) => s.trim().endsWith('?'));
        if (lastQ && lastQ.trim().length > 15 && lastQ.trim().length < 200) {
          questions.push(lastQ.trim());
        }
        if (questions.length >= 3) break;
      }
      return questions;
    } catch {
      return [];
    }
  }, [entries]);

  // Structural prompts — focus on causal/attribution thinking, not mood.
  // These are optional aids for the expansion field only.
  const basePrompts = [
    "What exactly triggered the reaction, and what in you met it?",
    "Which specific assumption produced the interpretation you defaulted to?",
    "What did you tell yourself that justified the choice you made?",
    "What precedes this pattern — which conditions reliably set it off?",
    "What decision rule, if applied yesterday, would have changed the outcome?",
    "What did you protect short-term, and what did it cost long-term?",
    "What is the smallest concrete action the honest read demands?",
    "What sentence in your own write-up sounds true but is rationalization?",
  ];

  const journalPrompts = useMemo(
    () => [...oraclePrompts, ...basePrompts],
    [oraclePrompts]
  );

  useEffect(() => {
    loadJournalEntries();
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return entries;

    return entries.filter((entry) => {
      // Historical entries may have `mood` / `moodCategory` — we intentionally
      // do not include them in the search haystack. Content is the source of
      // truth.
      const haystack = [entry.content, entry.oracleJudgment]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [entries, searchQuery]);

  // Skeleton lifecycle
  useEffect(() => {
    let showTimer;
    let dwellTimer;

    if (loading) {
      showTimer = setTimeout(() => setShowSkeleton(true), 250);
    } else if (showSkeleton) {
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }

    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (dwellTimer) clearTimeout(dwellTimer);
    };
  }, [loading, showSkeleton]);

  // Rotating prompts — pauses while the user is typing in the expansion field
  useEffect(() => {
    if (isTextareaFocused) return;

    const interval = setInterval(() => {
      setPromptVisible(false);
      setTimeout(() => {
        setCurrentPromptIndex((prev) => (prev + 1) % journalPrompts.length);
        setPromptVisible(true);
      }, 300);
    }, 4000);

    return () => clearInterval(interval);
  }, [journalPrompts, isTextareaFocused]);

  const loadJournalEntries = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const savedEntries = await readUserData('journalEntries');
      logger.log("📔 Journal page: Loaded entries:", savedEntries.length);
      setEntries(savedEntries);
    } catch (error) {
      logger.error("❌ Error loading journal entries:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const resetEntryForm = () => {
    setEvent('');
    setAttribution('');
    setExpansion('');
    setEventOccurredAt(new Date().toISOString().slice(0, 16));
  };

  const cancelEdit = () => {
    setEditingEntryId(null);
    resetEntryForm();
  };

  const startEditEntry = (entryToEdit) => {
    setEditingEntryId(entryToEdit.id);
    // Structured entries carry explicit fields. Legacy entries only have
    // `content` — we load the raw content into the expansion field so the
    // user can rework it under the new frame without losing signal.
    if (entryToEdit.event || entryToEdit.attribution) {
      setEvent(entryToEdit.event || '');
      setAttribution(entryToEdit.attribution || '');
      setExpansion(entryToEdit.expansion || '');
    } else {
      setEvent('');
      setAttribution('');
      setExpansion(entryToEdit.content || '');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('journal-expansion-input')?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!eventValid || !attributionValid) return;

    setLoading(true);

    try {
      const content = composeJournalContent({ event, attribution, expansion });

      if (editingEntryId) {
        // Update existing entry — preserve oracle data; rewrite structured fields.
        await updateData('journalEntries', editingEntryId, {
          content,
          event,
          attribution,
          expansion: expansion || null,
        });
        setEntries(prev =>
          prev.map(e => e.id === editingEntryId
            ? { ...e, content, event, attribution, expansion: expansion || null }
            : e)
        );
        ouraToast.success('Journal entry updated');
        cancelEdit();
        return;
      }

      // New entry — generate Oracle feedback. BER-139: proximity flag.
      const occurredAt = new Date(eventOccurredAt);
      const nowMs = Date.now();
      const gapHours = (nowMs - occurredAt.getTime()) / 3_600_000;
      const entryProximityFlag = gapHours > 12 ? 'retrospective' : 'contemporaneous';
      const proximityNote = entryProximityFlag === 'retrospective'
        ? '\n\n[ENTRY CONTEXT: This entry was written significantly after the event. The user\'s recollection may be reconstructed rather than accurate. Weight behavioral specifics cautiously and probe for what details may have been edited by hindsight.]'
        : '';

      const pastEntries = entries.slice(-3).map(e => e.content);

      openOracleLoading();

      const { text: feedbackText, metacognitiveDepth } = await generateAIFeedback({
        moduleName: 'journal',
        event,
        attribution,
        expansion: `${expansion}${proximityNote}`,
        pastEntries,
      });

      const newEntry = await writeData('journalEntries', {
        content,
        event,
        attribution,
        expansion: expansion || null,
        eventOccurredAt: occurredAt.toISOString(),
        entryProximityFlag,
        oracleJudgment: feedbackText,
        ...(metacognitiveDepth ? { metacognitiveDepth } : {}),
      });
      setEntries(prev => [newEntry, ...prev]);
      setCurrentEntryId(newEntry.id);

      openOracleWithContent(feedbackText, getCachedTotalEntryCount(), metacognitiveDepth, content, 'journal');

      ouraToast.success('Journal entry saved');

      // Capture entry text before resetting — extraction runs in background after save
      const savedEntryText = content;
      setCrossModuleExtractions({ killList: null, relapseRadar: null });

      resetEntryForm();

      // Fire cross-module signal extraction — non-blocking
      runCrossModuleExtractions(savedEntryText);

    } catch (error) {
      logger.error("Error saving journal entry:", error);
      openOracleWithContent("Oracle unavailable. Entry saved. Submit again to request feedback.");
    } finally {
      setLoading(false);
    }
  };

  // Delete journal entry
  const deleteEntry = async (entryId) => {
    const entryToDelete = entries.find(e => e.id === entryId);
    const entryIndex = entries.findIndex(e => e.id === entryId);

    if (!entryToDelete) return;

    logger.log("🗑️ Journal: Deleting entry:", entryId);

    setEntries(prev => prev.filter(entry => entry.id !== entryId));

    const existingPending = pendingEntryDeletes.current.get(entryId);
    if (existingPending) {
      clearTimeout(existingPending.timeoutId);
      pendingEntryDeletes.current.delete(entryId);
    }

    const undoDelete = () => {
      const pending = pendingEntryDeletes.current.get(entryId);
      if (!pending) return;

      clearTimeout(pending.timeoutId);
      pendingEntryDeletes.current.delete(entryId);

      setEntries(prev => {
        if (prev.some(entry => entry.id === entryId)) return prev;
        const next = [...prev];
        const insertIndex = Math.min(pending.index, next.length);
        next.splice(insertIndex, 0, pending.entry);
        return next;
      });

      ouraToast.dismiss(pending.toastId);
      ouraToast.success('Deletion undone');
    };

    const toastId = ouraToast.warning(
      <div className="flex items-center gap-3">
        <span>Journal entry deleted</span>
        <button
          onClick={undoDelete}
          className="px-2 py-1 text-xs rounded-md border border-white/20 text-white hover:bg-white/10 transition-colors"
        >
          Undo
        </button>
      </div>,
      { duration: 5000 }
    );

    const timeoutId = setTimeout(async () => {
      try {
        await deleteData('journalEntries', entryId);
        logger.log('✅ Journal: Entry deleted successfully');
      } catch (error) {
        logger.error('❌ Journal: Error deleting entry:', error);
        setEntries(prev => {
          if (prev.some(entry => entry.id === entryId)) return prev;
          const next = [...prev];
          const insertIndex = Math.min(entryIndex, next.length);
          next.splice(insertIndex, 0, entryToDelete);
          return next;
        });
        ouraToast.error('Failed to delete journal entry');
      } finally {
        pendingEntryDeletes.current.delete(entryId);
      }
    }, 5000);

    pendingEntryDeletes.current.set(entryId, { timeoutId, entry: entryToDelete, index: entryIndex, toastId });
  };

  // Save oracle reaction
  const handleOracleReaction = async (reactionId) => {
    if (!currentEntryId) return;

    try {
      await updateData('journalEntries', currentEntryId, { oracleReaction: reactionId });
      setEntries(prev =>
        prev.map(e => e.id === currentEntryId ? { ...e, oracleReaction: reactionId } : e)
      );
      logger.log('Oracle reaction saved:', reactionId, 'for entry:', currentEntryId);
    } catch (error) {
      logger.error('Error saving oracle reaction:', error);
    }
  };

  // Cross-module extraction state
  const [crossModuleExtractions, setCrossModuleExtractions] = useState({ killList: null, relapseRadar: null });

  const extractionDedupeRef = useRef(new Set());
  const hashEntryText = (text) => {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
    return h.toString(36);
  };

  const runCrossModuleExtractions = async (entryText) => {
    const fp = hashEntryText(entryText || '');
    if (extractionDedupeRef.current.has(fp)) {
      logger.log('Cross-module extraction skipped (already attempted this session)');
      return;
    }
    extractionDedupeRef.current.add(fp);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });

      const { getAuth } = await import('firebase/auth');
      const uid = getAuth().currentUser?.uid;
      const behavioralCtx = await getBehavioralContext(uid).catch(() => null);

      const [killResult, relapseResult] = await Promise.all([
        oracleFn({
          entryText,
          moduleName: 'killListExtraction',
          userContext: {},
          tone: 'stoic',
          behavioralContext: behavioralCtx,
        }).catch(() => null),
        oracleFn({
          entryText,
          moduleName: 'relapseDetection',
          userContext: {},
          tone: 'stoic',
          behavioralContext: behavioralCtx,
        }).catch(() => null),
      ]);

      const parseExtraction = (result) => {
        if (!result?.data?.feedback) return null;
        try {
          const raw = result.data.feedback.trim();
          if (raw === 'null' || raw === '') return null;
          const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
          return JSON.parse(cleaned);
        } catch {
          return null;
        }
      };

      const killExtraction = parseExtraction(killResult);
      const relapseExtraction = parseExtraction(relapseResult);

      if (killExtraction || relapseExtraction) {
        setCrossModuleExtractions({ killList: killExtraction, relapseRadar: relapseExtraction });
      }
    } catch {
      // Extraction is best-effort
    }
  };

  const handleDismissKillListExtraction = () => {
    setCrossModuleExtractions(prev => ({ ...prev, killList: null }));
  };

  const handleDismissRelapseExtraction = () => {
    setCrossModuleExtractions(prev => ({ ...prev, relapseRadar: null }));
  };

  const handleConfirmKillListExtraction = (extraction) => {
    try {
      sessionStorage.setItem('kl_extraction_prefill', JSON.stringify(extraction));
    } catch { /* ignore storage errors */ }
    setCrossModuleExtractions(prev => ({ ...prev, killList: null }));
    navigate('/killlist');
  };

  const handleConfirmRelapseExtraction = (extraction) => {
    try {
      sessionStorage.setItem('relapse_extraction_prefill', JSON.stringify(extraction));
    } catch { /* ignore storage errors */ }
    setCrossModuleExtractions(prev => ({ ...prev, relapseRadar: null }));
    navigate('/relapse');
  };

  // Extract hard lesson from journal entry
  const [extracting, setExtracting] = useState(null);
  const extractLessonFromEntry = async (journalEntry) => {
    setExtracting(journalEntry.id);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const functions = getFunctions();
      const oracleFn = httpsCallable(functions, 'oracle', { timeout: 30000 });

      const result = await oracleFn({
        entryText: journalEntry.content,
        moduleName: 'lessonExtraction',
        userContext: {},
        tone: 'stoic',
      });

      let extracted = {};
      try {
        const raw = (result.data.feedback || '').trim();
        const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
        extracted = JSON.parse(cleaned);
      } catch {
        logger.warn('Oracle returned non-JSON for lesson extraction, using journal content as fallback');
      }

      await writeData('hardLessons', {
        eventCategory: extracted.suggestedCategory || '',
        eventDescription: extracted.eventDescription || journalEntry.content,
        myAssumption: extracted.myAssumption || '',
        signalIgnored: extracted.signalIgnored || '',
        costs: Array.isArray(extracted.suggestedCosts) ? extracted.suggestedCosts : [],
        costDescription: extracted.costDescription || '',
        extractedLesson: extracted.extractedLesson || '',
        ruleGoingForward: extracted.ruleGoingForward || '',
        isFinalized: false,
        isScarStub: false,
        isOracleExtracted: true,
        sourceJournalId: journalEntry.id,
        createdAt: new Date().toISOString(),
      });

      ouraToast.success('Oracle extracted a lesson — review and finalize it');
      navigate('/hardlessons');
    } catch (error) {
      logger.error('Error extracting lesson from journal:', error);
      try {
        await writeData('hardLessons', {
          eventCategory: '',
          eventDescription: journalEntry.content,
          myAssumption: '',
          signalIgnored: '',
          costs: [],
          costDescription: '',
          extractedLesson: '',
          ruleGoingForward: '',
          isFinalized: false,
          isScarStub: false,
          isOracleFailed: true,
          sourceJournalId: journalEntry.id,
          createdAt: new Date().toISOString(),
        });
        ouraToast.error('Oracle unavailable — draft created from your entry. Fill in the remaining fields manually.');
        navigate('/hardlessons');
      } catch (fallbackError) {
        logger.error('Fallback also failed:', fallbackError);
        ouraToast.error('Failed to create lesson');
      }
    } finally {
      setExtracting(null);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-10 animate-fade-in-up">
          <p className="text-[#5a5a5a] text-sm uppercase tracking-widest mb-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-3xl font-bold text-white mb-2">Journal</h1>
          <p className="text-[#8a8a8a]">Structured reflection for signal extraction. Name the event. Name what in you produced the reading.</p>
          <div className="mt-3 flex items-center gap-2 text-xs text-[#5a5a5a]">
            <span className="px-2 py-1 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]">+2 pts per entry</span>
            <span className="px-2 py-1 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]">7-day: +15 pts</span>
            <span className="px-2 py-1 bg-[#0a0a0a] rounded-lg border border-[#1a1a1a]">30-day: +40 pts</span>
          </div>
        </header>

        {/* Entry Form — three-field structural frame */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className={`oura-card p-6 mb-8 ${editingEntryId ? 'border border-[#4da6ff]/40' : ''}`}>
            {editingEntryId && (
              <div className="flex items-center justify-between mb-5 p-3 bg-[#4da6ff]/10 border border-[#4da6ff]/20 rounded-xl">
                <span className="text-[#4da6ff] text-sm font-medium">Editing entry — Oracle feedback will not regenerate on update</span>
                <button type="button" onClick={cancelEdit} className="text-[#4da6ff] text-xs hover:text-white transition-colors">Cancel</button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Field 1 — Event (required) */}
              <div>
                <label htmlFor="journal-event-input" className="block text-white text-sm font-medium mb-2">
                  What actually happened?
                </label>
                <p className="text-[#8a8a8a] text-xs mb-3">Name the event, the time, and one specific detail.</p>
                <textarea
                  id="journal-event-input"
                  value={event}
                  onChange={(e) => setEvent(e.target.value)}
                  rows={3}
                  className={`w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border ${
                    event.length > 0 && !eventValid ? 'border-[#ef4444]/40' : 'border-[#1a1a1a]'
                  } focus:border-[#00d4aa] focus:outline-none resize-none transition-colors`}
                  placeholder="Time, place, what occurred, one concrete detail."
                  required
                />
                <div className={`mt-1 text-[11px] ${eventValid ? 'text-[#5a5a5a]' : 'text-[#8a8a8a]'}`}>
                  {event.trim().length}/{EVENT_MIN} {eventValid ? '— ok' : '— minimum not met'}
                </div>
              </div>

              {/* Field 2 — Attribution (required) */}
              <div>
                <label htmlFor="journal-attribution-input" className="block text-white text-sm font-medium mb-2">
                  What in me produced this reading of it?
                </label>
                <p className="text-[#8a8a8a] text-xs mb-3">Name the assumption, fear, or frame that shaped your interpretation. Not how you felt — what produced the feeling.</p>
                <textarea
                  id="journal-attribution-input"
                  value={attribution}
                  onChange={(e) => setAttribution(e.target.value)}
                  rows={4}
                  className={`w-full p-4 bg-[#0a0a0a] text-white rounded-2xl border ${
                    attribution.length > 0 && !attributionValid ? 'border-[#ef4444]/40' : 'border-[#1a1a1a]'
                  } focus:border-[#00d4aa] focus:outline-none resize-none transition-colors`}
                  placeholder="The belief, pattern, or expectation in you that produced this read."
                  required
                />
                <div className={`mt-1 text-[11px] ${attributionValid ? 'text-[#5a5a5a]' : 'text-[#8a8a8a]'}`}>
                  {attribution.trim().length}/{ATTRIBUTION_MIN} {attributionValid ? '— ok' : '— minimum not met'}
                </div>
              </div>

              {/* Field 3 — Expansion (optional, gated) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor="journal-expansion-input" className="block text-white text-sm font-medium">
                    Expand (optional)
                  </label>
                  {!expansionUnlocked && (
                    <span className="text-[11px] text-[#5a5a5a]">Unlocks after fields 1 and 2</span>
                  )}
                </div>
                <p className="text-[#8a8a8a] text-xs mb-3">No minimum. Use this space for additional context, causal links, or questions.</p>

                {expansionUnlocked && (
                  <div className="mb-4">
                    <button
                      type="button"
                      onClick={() => {
                        const currentPrompt = journalPrompts[currentPromptIndex];
                        setExpansion(prev => prev + (prev ? '\n\n' : '') + currentPrompt + '\n');
                      }}
                      className={`text-left p-4 w-full bg-[#0a0a0a] border border-[#1a1a1a] hover:border-[#2a2a2a] text-[#d1d1d1] rounded-2xl text-sm transition-all duration-600 ${
                        promptVisible ? 'opacity-100' : 'opacity-0'
                      }`}
                      style={{ transition: 'opacity 0.6s ease-in-out' }}
                    >
                      <span className="block text-[10px] uppercase tracking-widest text-[#5a5a5a] mb-2">
                        {currentPromptIndex < oraclePrompts.length ? 'From the Oracle' : 'Structural prompt'}
                      </span>
                      <span className="leading-relaxed">
                        {journalPrompts[currentPromptIndex]}
                      </span>
                    </button>
                    <div className="mt-2 flex justify-center space-x-1">
                      {journalPrompts.map((_, index) => (
                        <div
                          key={index}
                          className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                            index === currentPromptIndex ? 'bg-[#4da6ff]' : 'bg-[#2a2a2a]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                <div className="relative">
                  <textarea
                    id="journal-expansion-input"
                    value={expansion}
                    onChange={(e) => setExpansion(e.target.value)}
                    onFocus={() => setIsTextareaFocused(true)}
                    onBlur={() => setIsTextareaFocused(false)}
                    rows={6}
                    disabled={!expansionUnlocked}
                    className={`w-full p-4 pr-14 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#00d4aa] focus:outline-none resize-none transition-colors ${
                      !expansionUnlocked ? 'opacity-40 cursor-not-allowed' : ''
                    }`}
                    placeholder={expansionUnlocked ? 'Additional context, causal links, questions.' : 'Complete fields 1 and 2 to unlock.'}
                  />
                  <div className="absolute right-2 top-2">
                    <VoiceInputButton
                      onTranscript={(transcript) => {
                        if (!expansionUnlocked) return;
                        setExpansion(prev => prev + (prev ? ' ' : '') + transcript);
                      }}
                      disabled={loading || !expansionUnlocked}
                    />
                  </div>
                </div>
              </div>

              {!editingEntryId && (
                <div>
                  <label className="block text-gray-500 text-xs uppercase tracking-widest mb-2 font-medium">When did this happen?</label>
                  <input
                    type="datetime-local"
                    value={eventOccurredAt}
                    max={new Date().toISOString().slice(0, 16)}
                    onChange={(e) => setEventOccurredAt(e.target.value)}
                    className="w-full px-4 py-2.5 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#00d4aa] focus:outline-none transition-colors text-sm"
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading || !eventValid || !attributionValid}
                  className="flex-1 bg-[#00d4aa] hover:bg-[#00e6b8] disabled:bg-[#1a1a1a] disabled:text-[#5a5a5a] text-black font-medium py-3 rounded-2xl transition-all duration-300"
                >
                  {loading ? 'Saving...' : editingEntryId ? 'Update Entry' : 'Save Entry'}
                </button>
                {editingEntryId && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-6 py-3 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-[#8a8a8a] hover:text-white border border-[#1a1a1a] rounded-2xl transition-all duration-300 font-medium"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>

        {/* Cross-module extraction prompts */}
        <CrossModuleExtractionPrompts
          extractions={crossModuleExtractions}
          onDismissKillList={handleDismissKillListExtraction}
          onDismissRelapseRadar={handleDismissRelapseExtraction}
          onConfirmKillList={handleConfirmKillListExtraction}
          onConfirmRelapseRadar={handleConfirmRelapseExtraction}
        />

        {/* Previous Entries */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h3 className="text-[#5a5a5a] text-xs uppercase tracking-widest">
              Previous Entries
              {searchQuery.trim() && (
                <span className="text-[#3a3a3a] ml-2">
                  ({filteredEntries.length}/{entries.length})
                </span>
              )}
            </h3>
            <div className="relative w-full sm:w-80">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search entries..."
                className="w-full px-4 py-2.5 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#00d4aa] focus:outline-none transition-colors"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a5a5a] hover:text-white text-xs"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          <div className="relative">
            <div className={`fade-pane ${showSkeleton ? 'visible' : 'hidden'}`}>
              <SkeletonList count={4} ItemComponent={SkeletonJournalEntry} />
            </div>

            <div className={`fade-pane ${showSkeleton ? 'hidden' : 'visible'}`}>
              {loadError ? (
                <div className="oura-card p-10 text-center">
                  <p className="text-[#ef4444] mb-4 text-sm">Failed to load journal entries. Please check your connection.</p>
                  <button
                    onClick={loadJournalEntries}
                    className="px-5 py-2.5 bg-[#ef4444]/10 text-[#ef4444] border border-[#ef4444]/30 rounded-xl hover:bg-[#ef4444]/20 transition-colors text-sm font-medium"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredEntries.length > 0 ? (
                <div className="space-y-4">
                  {filteredEntries.map((entry) => {
                    const dateSource = entry.timestamp?.toDate
                      ? entry.timestamp.toDate()
                      : entry.createdAt?.toDate
                        ? entry.createdAt.toDate()
                        : entry.timestamp
                          ? new Date(entry.timestamp)
                          : entry.createdAt
                            ? new Date(entry.createdAt)
                            : null;
                    const dateLabel = dateSource
                      ? dateSource.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : 'Unknown date';

                    return (
                      <div key={entry.id} className="oura-card p-6">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs text-[#5a5a5a] uppercase tracking-widest">{dateLabel}</span>
                          <div className="flex items-center space-x-2">
                            <button
                              onClick={() => startEditEntry(entry)}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#4da6ff]/10 text-[#4da6ff] hover:bg-[#4da6ff]/20 transition-colors"
                              title="Edit this entry"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => deleteEntry(entry.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#ef4444]/10 text-[#ef4444] hover:bg-[#ef4444]/20 transition-colors"
                              title="Delete this entry"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        <p className="text-[#d1d1d1] leading-relaxed mb-4 whitespace-pre-line">{entry.content}</p>

                        {entry.oracleJudgment && (
                          <div className="mt-4 p-4 bg-[#0a0a0a] border border-[#1a1a1a] border-l-2 border-l-[#a855f7] rounded-2xl">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-[#888] font-medium text-xs uppercase tracking-widest">Oracle</h4>
                              {entry.oracleReaction && typeof entry.oracleReaction === 'string' && (
                                <span className={`text-xs px-2 py-0.5 rounded-lg border ${
                                  entry.oracleReaction === 'landed' ? 'text-[#22c55e] border-[#22c55e]/30 bg-[#22c55e]/10' :
                                  entry.oracleReaction === 'disagree' ? 'text-[#ef4444] border-[#ef4444]/30 bg-[#ef4444]/10' :
                                  entry.oracleReaction === 'sit' ? 'text-[#f59e0b] border-[#f59e0b]/30 bg-[#f59e0b]/10' :
                                  'text-[#5a5a5a] border-[#5a5a5a]/30 bg-[#5a5a5a]/10'
                                }`}>
                                  {entry.oracleReaction === 'landed' && 'Landed'}
                                  {entry.oracleReaction === 'disagree' && 'Disagreed'}
                                  {entry.oracleReaction === 'sit' && 'Sitting with it'}
                                  {entry.oracleReaction === 'missed' && 'Missed'}
                                </span>
                              )}
                            </div>
                            <div className="text-[#f5f5f5] text-sm leading-relaxed whitespace-pre-line">
                              {typeof entry.oracleJudgment === 'string' ? entry.oracleJudgment : JSON.stringify(entry.oracleJudgment)}
                            </div>

                            {/* Legacy: show old follow-up data if present */}
                            {entry.userResponse && typeof entry.userResponse === 'string' && (
                              <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
                                <h5 className="text-[#888] font-medium text-xs mb-2 uppercase tracking-widest">Your Response</h5>
                                <div className="text-[#d1d1d1] text-sm leading-relaxed whitespace-pre-line">
                                  {entry.userResponse}
                                </div>
                              </div>
                            )}

                            {entry.oracleFollowUp && typeof entry.oracleFollowUp === 'string' && (
                              <div className="mt-4 pt-4 border-t border-[#1a1a1a]">
                                <h5 className="text-[#888] font-medium text-xs mb-2 uppercase tracking-widest">Oracle — Reflection</h5>
                                <div className="text-[#f5f5f5] text-sm leading-relaxed whitespace-pre-line">
                                  {entry.oracleFollowUp}
                                </div>
                              </div>
                            )}

                            {PAIN_SIGNALS.test(entry.content || '') ? (
                              <button
                                onClick={() => extractLessonFromEntry(entry)}
                                disabled={extracting === entry.id}
                                className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center gap-2 text-xs text-[#f59e0b] hover:text-[#fbbf24] disabled:text-[#3a3a3a] transition-colors w-full"
                              >
                                {extracting === entry.id ? (
                                  <>
                                    <span className="inline-block w-3 h-3 border border-[#f59e0b] border-t-transparent rounded-full animate-spin" />
                                    <span>Oracle is extracting the lesson...</span>
                                  </>
                                ) : (
                                  <>
                                    <span>⚡</span>
                                    <span>This sounds like it cost you something. Extract the lesson.</span>
                                  </>
                                )}
                              </button>
                            ) : (
                              <button
                                onClick={() => extractLessonFromEntry(entry)}
                                disabled={extracting === entry.id}
                                className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center gap-2 text-xs text-[#3a3a3a] hover:text-[#5a5a5a] disabled:text-[#2a2a2a] transition-colors w-full"
                              >
                                {extracting === entry.id ? (
                                  <>
                                    <span className="inline-block w-3 h-3 border border-[#3a3a3a] border-t-transparent rounded-full animate-spin" />
                                    <span>Extracting lesson...</span>
                                  </>
                                ) : (
                                  <span>Extract hard lesson</span>
                                )}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="oura-card p-12 text-center">
                  <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center text-2xl">
                    📝
                  </div>
                  <h3 className="text-lg font-light text-white mb-2">
                    {searchQuery.trim() ? `No matches for “${searchQuery.trim()}”` : 'No journal entries yet'}
                  </h3>
                  <p className="text-[#5a5a5a] text-sm mb-6">
                    {searchQuery.trim()
                      ? 'Try a different keyword or clear the search.'
                      : 'Honesty here is what gives the Oracle signal. Vagueness produces nothing useful.'}
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    {searchQuery.trim() ? (
                      <button
                        onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                        className="px-6 py-2.5 bg-transparent border border-[#1a1a1a] text-[#8a8a8a] hover:text-white hover:border-[#2a2a2a] rounded-xl transition-all duration-300 font-medium text-sm"
                      >
                        Clear Search
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          document.getElementById('journal-event-input')?.focus();
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="px-6 py-2.5 bg-[#4da6ff] hover:bg-[#357abd] text-white rounded-xl transition-all duration-300 font-medium text-sm"
                      >
                        Write Your First Entry
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* Oracle Modal */}
      <OracleModal
        isOpen={oracleModal.isOpen}
        onClose={() => {
          closeOracle();
          setCurrentEntryId(null);
        }}
        content={oracleModal.content}
        isLoading={oracleModal.isLoading}
        onReaction={handleOracleReaction}
        entryCount={oracleModal.entryCount}
        metacognitiveDepth={oracleModal.metacognitiveDepth}
        entryText={oracleModal.entryText}
        entryModuleName={oracleModal.entryModuleName}
      />
    </div>
  );
}
