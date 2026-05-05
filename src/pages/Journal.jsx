import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { writeData, readUserData, updateData } from '../utils/firebaseUtils';
import { archiveEntry, restoreEntry, deleteArchivedEntry, subscribeToArchive } from '../utils/archiveUtils';
import { generateAIFeedback } from '../utils/aiFeedback';
import { getCachedTotalEntryCount } from '../utils/getBehavioralContext';
import VoiceInputButton from '../components/VoiceInputButton';
import OracleModal from '../components/OracleModal';
import ArchiveToggle from '../components/ArchiveToggle';
import { AppIcon } from '../components/AppIcons';
import { moodCategories, moodOptions, intensityLevels } from '../constants/moods';
import { redirectIfAuthLost } from '../utils/authErrorHandler';
import ouraToast from '../utils/toast';
import { useOracleModal } from '../hooks/useOracleModal';
import { SkeletonList, SkeletonJournalEntry } from '../components/SkeletonLoader';
import CrossModuleExtractionPrompts from '../components/CrossModuleExtractionPrompts';
import logger from '../utils/logger';
import {
  classifyAndExtract,
  stashKillListExtraction,
  stashRelapseExtraction,
  stashHardLessonExtraction,
} from '../utils/crossModuleExtraction';

// Custom SVG mood icons - Oura-style geometric designs
const MoodIcons = {
  electric: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  foggy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 14h16M4 10h16M4 18h12" opacity="0.6" />
      <circle cx="12" cy="8" r="4" opacity="0.3" />
    </svg>
  ),
  sharp: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7l2-7z" />
    </svg>
  ),
  hollow: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" opacity="0.3" />
    </svg>
  ),
  chaotic: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10" />
      <path d="M12 2c5.5 0 10 4.5 10 10s-4.5 10-10 10" opacity="0.5" />
      <path d="M2 12h20M12 2v20" opacity="0.3" />
    </svg>
  ),
  triumphant: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l3 6 6 1-4.5 4 1.5 6-6-3.5L6 19l1.5-6L3 9l6-1 3-6z" />
    </svg>
  ),
  heavy: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22V12M12 12L6 6M12 12l6-6" />
      <circle cx="12" cy="22" r="2" fill="currentColor" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
      <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" opacity="0.5" />
    </svg>
  ),
  focused: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" opacity="0.5" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
  radiant: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
    </svg>
  ),
  steady: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12h16" />
      <path d="M8 8h8M8 16h8" opacity="0.5" />
    </svg>
  ),
  calm: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12c2-2 4-3 6-3s4 2 6 2 4-1 6-3" />
      <path d="M2 16c2-2 4-3 6-3s4 2 6 2 4-1 6-3" opacity="0.5" />
    </svg>
  ),
};

// Mood/intensity taxonomy lives in [src/constants/moods.js] so the
// Journal page and the Quick Entry modal stay in sync.

// Intensity ring visualization component
const IntensityRing = ({ level, selected, onClick }) => {
  const rings = intensityLevels.find(l => l.value === level)?.rings || 1;
  const isActive = selected >= level;
  
  // Color gradient from cool to warm
  const getColor = (lvl) => {
    // Single-accent intensity scale — ring count already conveys level.
    const colors = ['#a855f7', '#a855f7', '#a855f7', '#a855f7', '#a855f7'];
    return colors[lvl - 1];
  };
  
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col items-center transition-all duration-300"
    >
      <div className="relative w-14 h-14 flex items-center justify-center">
        {[...Array(rings)].map((_, i) => (
          <div
            key={i}
            className={`absolute rounded-full border-2 transition-all duration-500 ${
              isActive 
                ? 'opacity-100' 
                : 'opacity-20 group-hover:opacity-40'
            }`}
            style={{
              width: `${28 + i * 10}px`,
              height: `${28 + i * 10}px`,
              borderColor: isActive ? getColor(level) : '#3a3a3a',
              animationDelay: `${i * 0.1}s`,
              boxShadow: isActive && selected === level ? `0 0 ${10 + i * 5}px ${getColor(level)}40` : 'none',
            }}
          />
        ))}
        <div 
          className={`w-3 h-3 rounded-full transition-all duration-300 ${
            isActive ? 'scale-100' : 'scale-50 opacity-30'
          }`}
          style={{ backgroundColor: isActive ? getColor(level) : '#3a3a3a' }}
        />
      </div>
    </button>
  );
};

export default function Journal() {
  const navigate = useNavigate();
  const [entry, setEntry] = useState('');
  const [eventOccurredAt, setEventOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [mood, setMood] = useState('focused');
  const [selectedCategory, setSelectedCategory] = useState('Grounded');
  const [intensity, setIntensity] = useState(3);
  const [entries, setEntries] = useState([]);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [aiInsights, setAiInsights] = useState({ reflections: [], isGenerating: false, lastUpdated: null });
  const { oracleModal, openLoading: openOracleLoading, openWithContent: openOracleWithContent, close: closeOracle } = useOracleModal();
  const [currentEntryId, setCurrentEntryId] = useState(null); // Track which entry the modal is for
  const submittingRef = useRef(false);
  const entryTextareaRef = useRef(null);
  const [view, setView] = useState('active');
  const [archivedEntries, setArchivedEntries] = useState([]);
  
  // State for rotating prompts
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [promptVisible, setPromptVisible] = useState(true);
  const [isTextareaFocused, setIsTextareaFocused] = useState(false);

  // Auto-grow the entry textarea so longer entries don't get visually clipped
  // inside a fixed scrollable box. Reset to 'auto' first so the height shrinks
  // when content shrinks (deletion, reset, edit-load).
  useEffect(() => {
    const el = entryTextareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [entry]);

  // Entry editing state
  const [editingEntryId, setEditingEntryId] = useState(null);

  // Extract the Oracle's closing question from recent entries (last sentence ending with ?)
  const oraclePrompts = useMemo(() => {
    try {
      const questions = [];
      for (const e of entries.slice(0, 10)) {
        if (!e.oracleJudgment || typeof e.oracleJudgment !== 'string') continue;
        // Grab the last sentence that ends with a question mark
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

  // Reflective prompts surfaced one at a time. The Gibbs-cycle "action plan"
  // stage was removed — action commitments live in the Kill List module, and
  // the cross-module extraction layer already lifts kill-worthy patterns out
  // of journal entries automatically.
  const basePrompts = [
    "What triggered strong emotions today?",
    "What fear held me back today?",
    "What challenged me and how did I handle it?",
    "What did I avoid today, and what did I tell myself to justify it?",
    "What action produced the most leverage today?",
    "What patterns am I noticing in my behavior?",
    "What am I learning about myself?",
    "What would I do differently if I could replay today?",
  ];

  // Oracle questions surface first, then the standard prompts
  const journalPrompts = useMemo(
    () => [...oraclePrompts, ...basePrompts],
    [oraclePrompts]
  );

  useEffect(() => {
    loadJournalEntries();
  }, []);

  useEffect(() => {
    let unsub = null;
    let mounted = true;
    subscribeToArchive('journalEntries', (data) => {
      if (mounted) setArchivedEntries(data);
    }).then(u => {
      if (!mounted) { try { u(); } catch {} return; }
      unsub = u;
    });
    return () => { mounted = false; if (unsub) try { unsub(); } catch {} };
  }, []);

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) return entries;

    return entries.filter((entry) => {
      const moodLabel = moodOptions.find(m => m.value === entry.mood)?.label || '';
      const haystack = [
        entry.content,
        entry.oracleJudgment,
        moodLabel,
        entry.category
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [entries, searchQuery, moodOptions]);

  // Pass 2 Finding 16 remediation: consolidated skeleton lifecycle. One
  // effect owns both the show-delay and the dwell timer, both timers are
  // cleared on every change, and unmount cleans up regardless of which
  // phase we're in. Avoids the prior split-effect ordering edge cases.
  useEffect(() => {
    let showTimer;
    let dwellTimer;

    if (loading) {
      // Wait 250ms before showing — fast loads never flash the skeleton.
      showTimer = setTimeout(() => setShowSkeleton(true), 250);
    } else if (showSkeleton) {
      // Once shown, hold for 300ms so the transition doesn't blink.
      dwellTimer = setTimeout(() => setShowSkeleton(false), 300);
    }

    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (dwellTimer) clearTimeout(dwellTimer);
    };
  }, [loading, showSkeleton]);

  // Effect for rotating prompts — pauses while the user is typing
  useEffect(() => {
    if (isTextareaFocused) return; // don't rotate while writing

    const interval = setInterval(() => {
      setPromptVisible(false);
      setTimeout(() => {
        setCurrentPromptIndex((prev) => (prev + 1) % journalPrompts.length);
        setPromptVisible(true);
      }, 300);
    }, 4000);

    return () => clearInterval(interval);
  }, [journalPrompts, isTextareaFocused]);

  // Pass 2 Finding 9 remediation: ref-based read of `aiInsights.lastUpdated`
  // so the debounced effect doesn't capture stale state. Using a ref instead
  // of adding `aiInsights` to the dep list avoids re-subscribing every time
  // a generation completes (which would itself re-arm the timer).
  const aiInsightsRef = useRef(aiInsights);
  useEffect(() => {
    aiInsightsRef.current = aiInsights;
  }, [aiInsights]);

  // Dynamic AI insights generation
  useEffect(() => {
    let isMounted = true;

    const generateDynamicInsights = async () => {
      // Only generate if we have meaningful content and haven't generated recently
      const lastUpdated = aiInsightsRef.current?.lastUpdated;
      if (entry.length < 50 ||
          (lastUpdated && Date.now() - lastUpdated < 5000)) {
        return;
      }

      setAiInsights(prev => ({ ...prev, isGenerating: true }));

      try {
        // Create context from current entry state
        const currentContext = {
          mood,
          intensity,
          content: entry,
          wordCount: entry.trim().split(/\s+/).length
        };

        // Get recent entries for pattern analysis
        const recentEntries = entries.slice(0, 3);

        // Generate contextual insights
        const insights = await generateContextualInsights(currentContext, recentEntries);

        if (!isMounted) return;
        setAiInsights({
          reflections: insights,
          isGenerating: false,
          lastUpdated: Date.now()
        });
      } catch (error) {
        if (!isMounted) return;
        logger.error('Error generating dynamic insights:', error);
        setAiInsights(prev => ({
          ...prev,
          isGenerating: false,
          reflections: ['Insights are temporarily unavailable. Continue writing to explore your thoughts.']
        }));
      }
    };

    // Debounce the insight generation
    const timeoutId = setTimeout(generateDynamicInsights, 2000);
    return () => {
      clearTimeout(timeoutId);
      isMounted = false;
    };
  }, [entry, mood, intensity, entries]);

  // Generate contextual insights based on current writing
  const generateContextualInsights = async (currentContext, recentEntries) => {
    const { mood, intensity, content, wordCount } = currentContext;
    
    // Analyze writing patterns
    const insights = [];
    
    // Content-based insights
    if (content.toLowerCase().includes('stress') || content.toLowerCase().includes('overwhelm')) {
      insights.push("Consider: What specific stressors can you control vs. accept?");
    }
    
    if (content.toLowerCase().includes('angry') || content.toLowerCase().includes('frustrated')) {
      insights.push("Reflection: What boundary or value might have been crossed?");
    }
    
    if (content.toLowerCase().includes('grateful') || content.toLowerCase().includes('thankful')) {
      insights.push("What specifically are you grateful for, and what does that reveal about your values?");
    }
    
    // Mood and intensity insights
    if (mood === 'chaotic' && intensity >= 4) {
      insights.push("High chaos energy detected. Consider grounding techniques or channeling this into creative work.");
    }
    
    if (mood === 'hollow' || mood === 'heavy') {
      insights.push("These states often precede behavioral regression. What specifically triggered this?");
    }
    
    // Pattern analysis with recent entries
    if (recentEntries.length > 0) {
      const recentMoods = recentEntries.map(e => e.mood);
      const isRepeatingPattern = recentMoods.filter(m => m === mood).length >= 2;
      
      if (isRepeatingPattern) {
        insights.push(`Pattern notice: This is your ${recentMoods.filter(m => m === mood).length + 1}rd time feeling ${mood} recently. What's the common thread?`);
      }
    }
    
    // Writing depth insights
    if (wordCount > 200) {
      insights.push("Extended entry. What's driving this volume?");
    } else if (wordCount < 50 && content.length > 0) {
      insights.push("Low word count. What's not being said?");
    }
    
    // Default insight if none triggered
    if (insights.length === 0) {
      const moodInsights = {
        electric: "This energy is powerful. How can you direct it toward your goals?",
        foggy: "Foggy state. What was clear recently that is no longer clear?",
        sharp: "Your focus is cutting through noise. What truth is emerging?",
        hollow: "What specifically is absent right now?",
        chaotic: "What is triggering the scatter? Name the source.",
        triumphant: "What made this outcome possible? What would replicate it?",
        heavy: "Heavy state. What is its specific source?",
        light: "Low-resistance state. What's the highest-value move right now?",
        focused: "Sharp state. What deserves this level of attention?",
        radiant: "High-output state. What needs to be locked in right now?",
        steady: "Stability is a foundation. What can you build from this position?",
        calm: "Still water sees clearly. What do you notice from this state?"
      };
      
      insights.push(moodInsights[mood] || "What behavioral pattern is most active right now?");
    }
    
    return insights.slice(0, 3); // Limit to 3 insights max
  };

  const loadJournalEntries = async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const savedEntries = await readUserData('journalEntries');
      logger.log("📔 Journal page: Loaded entries:", savedEntries.length);
      savedEntries.forEach((entry, idx) => {
        logger.log(`  Entry ${idx + 1}: ID=${entry.id}, hasOracle=${!!entry.oracleJudgment}, hasFollowUp=${!!entry.oracleFollowUp}, content="${entry.content?.substring(0, 50)}..."`);
      });
      setEntries(savedEntries);
    } catch (error) {
      logger.error("❌ Error loading journal entries:", error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const cancelEdit = () => {
    setEditingEntryId(null);
    setEntry('');
    setMood(moodOptions[0].value);
    setIntensity(3);
    setActionPlan('');
    setAiInsights({ reflections: [], isGenerating: false, lastUpdated: null });
  };

  const startEditEntry = (entryToEdit) => {
    setEditingEntryId(entryToEdit.id);
    setEntry(entryToEdit.content || '');
    setMood(entryToEdit.mood || moodOptions[0].value);
    setIntensity(entryToEdit.intensity || 3);
    // Switch category tab to match the saved mood
    const cat = moodCategories.find(c => c.moods.some(m => m.value === entryToEdit.mood));
    if (cat) setSelectedCategory(cat.name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.getElementById('journal-entry-input')?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!entry.trim()) return;
    // Double-submit guard — prevent duplicate writes if the user clicks
    // before the in-flight submit returns.
    if (submittingRef.current) return;
    submittingRef.current = true;

    setLoading(true);

    try {
      if (editingEntryId) {
        // Update existing entry — preserve oracle data, just update content/mood/intensity
        await updateData('journalEntries', editingEntryId, {
          content: entry,
          mood,
          intensity,
        });
        setEntries(prev =>
          prev.map(e => e.id === editingEntryId ? { ...e, content: entry, mood, intensity } : e)
        );
        ouraToast.success('Journal entry updated');
        cancelEdit();
        return;
      }

      // New entry — generate Oracle feedback
      const moodLabel = moodOptions.find(m => m.value === mood)?.label || mood;

      // BER-139: proximity flag
      const occurredAt = new Date(eventOccurredAt);
      const nowMs = Date.now();
      const gapHours = (nowMs - occurredAt.getTime()) / 3_600_000;
      const entryProximityFlag = gapHours > 12 ? 'retrospective' : 'contemporaneous';
      const proximityNote = entryProximityFlag === 'retrospective'
        ? '\n[ENTRY CONTEXT: This entry was written significantly after the event. The user\'s recollection may be reconstructed rather than accurate. Weight behavioral specifics cautiously and probe for what details may have been edited by hindsight.]'
        : '';

      const inputText = `Mood: ${moodLabel} (${intensity}/5)\n${entry}${proximityNote}`;
      const pastEntries = entries.slice(-3).map(e => e.content);

      openOracleLoading();

      const { text: feedbackText, metacognitiveDepth, closingQuestion } = await generateAIFeedback('journal', inputText, pastEntries);

      const newEntry = await writeData('journalEntries', {
        content: entry,
        mood,
        intensity,
        eventOccurredAt: occurredAt.toISOString(),
        entryProximityFlag,
        oracleJudgment: feedbackText,
        ...(metacognitiveDepth ? { metacognitiveDepth } : {}),
        ...(closingQuestion ? { oracleClosingQuestion: closingQuestion } : {}),
      });
      setEntries(prev => [newEntry, ...prev]);
      setCurrentEntryId(newEntry.id);

      openOracleWithContent(feedbackText, getCachedTotalEntryCount(), metacognitiveDepth, inputText, 'journal');

      ouraToast.success('Journal entry saved');

      // Capture entry text before resetting form — extraction runs in background after save
      const savedEntryText = entry;
      setCrossModuleExtractions({ killList: null, relapseRadar: null });

      setEntry('');
      setMood(moodOptions[0].value);
      setIntensity(3);
      setEventOccurredAt(new Date().toISOString().slice(0, 16));
      setAiInsights({ reflections: [], isGenerating: false, lastUpdated: null });

      // Fire cross-module signal extraction — non-blocking
      runCrossModuleExtractions(savedEntryText);

    } catch (error) {
      logger.error("Error saving journal entry:", error);
      if (redirectIfAuthLost(error)) return;
      openOracleWithContent("Oracle unavailable. Entry saved. Submit again to request feedback.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  // Archive journal entry (was hard delete). Archive is recoverable via
  // the Archive view, so the former 5-sec-undo toast is unnecessary.
  const archiveEntryById = async (entryId) => {
    const entry = entries.find(e => e.id === entryId);
    const entryIndex = entries.findIndex(e => e.id === entryId);
    if (!entry) return;

    setEntries(prev => prev.filter(e => e.id !== entryId));

    try {
      await archiveEntry('journalEntries', entry);
      ouraToast.success('Entry archived');
    } catch (error) {
      logger.error('❌ Journal: Error archiving entry:', error);
      setEntries(prev => {
        if (prev.some(e => e.id === entryId)) return prev;
        const next = [...prev];
        const insertIndex = Math.min(entryIndex, next.length);
        next.splice(insertIndex, 0, entry);
        return next;
      });
      ouraToast.error('Failed to archive entry');
    }
  };

  const restoreArchivedJournalEntry = async (archived) => {
    try {
      await restoreEntry('journalEntries', archived);
      setEntries(prev => [{ ...archived, archivedAt: undefined }, ...prev]);
      ouraToast.success('Entry restored');
    } catch (error) {
      logger.error('❌ Journal: Error restoring entry:', error);
      if (redirectIfAuthLost(error)) return;
      // Optimistic state was not yet updated, so no rollback is needed.
      // Refresh from server to make sure the local list reflects truth.
      loadJournalEntries();
      ouraToast.error('Failed to restore entry');
    }
  };

  const permanentlyDeleteJournalEntry = async (archived) => {
    if (!window.confirm('Permanently delete this entry? This cannot be undone.')) return;
    try {
      await deleteArchivedEntry('journalEntries', archived);
      ouraToast.success('Entry permanently deleted');
    } catch (error) {
      logger.error('❌ Journal: Error permanently deleting entry:', error);
      ouraToast.error('Failed to delete entry');
    }
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

  // Cross-module extraction state — Kill List contract + Relapse Radar signal detection
  const [crossModuleExtractions, setCrossModuleExtractions] = useState({ killList: null, relapseRadar: null, hardLesson: null });
  // Per-entry reconsideration cards: { [entryId]: { killList, relapseRadar, hardLesson, loading? } }.
  // Populated by handleReconsiderEntry; rendered inline below the corresponding past entry.
  const [entryReconsiderations, setEntryReconsiderations] = useState({});

  // Runs the Oracle classifier first, then conditionally fires only the
  // extractors the classifier flags as warranted. See
  // src/utils/crossModuleExtraction.js for the full flow. Returns
  // `{ killList, relapseRadar, hardLesson, classification }` on success, null
  // on dedupe-skip or unrecoverable error. Callers decide where to render —
  // the on-save flow populates the top-of-list state; the per-entry
  // "Reconsider" flow populates `entryReconsiderations[entry.id]`.
  const runCrossModuleExtractions = async (entryText, { forceRefresh = false } = {}) => {
    const results = await classifyAndExtract(entryText, { forceRefresh });
    if (results && (results.killList || results.relapseRadar || results.hardLesson)) {
      setCrossModuleExtractions({
        killList: results.killList,
        relapseRadar: results.relapseRadar,
        hardLesson: results.hardLesson,
      });
    }
    return results;
  };

  const handleDismissKillListExtraction = () => {
    setCrossModuleExtractions(prev => ({ ...prev, killList: null }));
  };

  const handleDismissRelapseExtraction = () => {
    setCrossModuleExtractions(prev => ({ ...prev, relapseRadar: null }));
  };

  const handleConfirmKillListExtraction = (extraction) => {
    stashKillListExtraction(extraction);
    setCrossModuleExtractions(prev => ({ ...prev, killList: null }));
    navigate('/ledger');
  };

  const handleConfirmRelapseExtraction = (extraction) => {
    stashRelapseExtraction(extraction);
    setCrossModuleExtractions(prev => ({ ...prev, relapseRadar: null }));
    navigate('/relapse');
  };

  // Hard Lesson card — top-of-list (just-saved entry) handlers.
  const handleDismissHardLessonExtraction = () => {
    setCrossModuleExtractions(prev => ({ ...prev, hardLesson: null }));
  };

  const handleConfirmHardLessonExtraction = (extraction) => {
    stashHardLessonExtraction(extraction, currentEntryId);
    setCrossModuleExtractions(prev => ({ ...prev, hardLesson: null }));
    navigate('/hardlessons');
  };

  // Per-entry "Reconsider this entry" — re-runs all three Oracle classifications
  // on demand for any past entry. Replaces the always-on per-entry button.
  const updateReconsidered = (entryId, partial) => {
    setEntryReconsiderations(prev => ({
      ...prev,
      [entryId]: { ...(prev[entryId] || {}), ...partial },
    }));
  };

  const handleReconsiderEntry = async (entry) => {
    if (!entry?.id || !entry?.content) return;
    const existing = entryReconsiderations[entry.id];
    if (existing?.loading) return;
    updateReconsidered(entry.id, { loading: true });
    try {
      const results = await runCrossModuleExtractions(entry.content, { forceRefresh: true });
      if (results) {
        const anySignal = !!(results.killList || results.relapseRadar || results.hardLesson);
        if (anySignal) {
          updateReconsidered(entry.id, {
            killList: results.killList,
            relapseRadar: results.relapseRadar,
            hardLesson: results.hardLesson,
            loading: false,
          });
        } else {
          updateReconsidered(entry.id, { killList: null, relapseRadar: null, hardLesson: null, loading: false });
          ouraToast.info('Oracle found nothing further to investigate in this entry.');
        }
      } else {
        updateReconsidered(entry.id, { loading: false });
        ouraToast.error('Oracle was unavailable. Try again shortly.');
      }
    } catch (err) {
      logger.error('Error reconsidering entry:', err);
      updateReconsidered(entry.id, { loading: false });
      ouraToast.error('Oracle was unavailable. Try again shortly.');
    }
  };

  // Per-entry confirm/dismiss handlers — they parameterize the slot and entry
  // so the inline cards can clear their own state independently of the
  // top-of-list extractions.
  const makeReconsideredDismiss = (entryId, slot) => () => updateReconsidered(entryId, { [slot]: null });

  const makeReconsideredConfirmKillList = (entryId) => (extraction) => {
    stashKillListExtraction(extraction);
    updateReconsidered(entryId, { killList: null });
    navigate('/ledger');
  };

  const makeReconsideredConfirmRelapse = (entryId) => (extraction) => {
    stashRelapseExtraction(extraction);
    updateReconsidered(entryId, { relapseRadar: null });
    navigate('/relapse');
  };

  const makeReconsideredConfirmHardLesson = (entryId) => (extraction) => {
    stashHardLessonExtraction(extraction, entryId);
    updateReconsidered(entryId, { hardLesson: null });
    navigate('/hardlessons');
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Oura-style Header */}
        <header className="mb-10 animate-fade-in-up">
          <p className="text-[#858585] text-sm uppercase tracking-widest mb-2">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-2xl bg-[#a855f7]/10 border border-[#a855f7]/20 flex items-center justify-center shrink-0">
              <AppIcon name="journal" size={22} color="#a855f7" glow={false} />
            </div>
            <h1 className="text-3xl font-bold text-white">Journal</h1>
          </div>
          <div className="border-l-4 border-[#a855f7] pl-4 py-1">
            <p className="text-[#ababab]">Write freely. The Oracle reads for signal.</p>
          </div>
        </header>

        {/* 30-Day Mood Calendar */}
        {entries.length > 0 && (
          <section className="mb-8 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
            <div className="oura-card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#858585] text-xs uppercase tracking-widest">30-Day Mood</h3>
                <div className="flex items-center gap-3 text-[10px] text-[#858585]">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-[#4da6ff]" />Energized</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-[#8a8a8a]" />Grounded</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm inline-block bg-[#b45309]" />Challenged</span>
                </div>
              </div>
              {(() => {
                const today = new Date();
                const toLocalKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                const todayKey = toLocalKey(today);
                // Build date→last-entry map for last 30 days
                const entryMap = {};
                entries.forEach(e => {
                  const raw = e.createdAt || e.timestamp;
                  if (!raw) return;
                  const d = raw.toDate ? raw.toDate() : new Date(raw);
                  if (isNaN(d.getTime())) return; // guard unresolved server timestamps
                  const k = toLocalKey(d);
                  entryMap[k] = e; // keep most recent per day
                });
                const getMoodColor = (mood) => {
                  if (['electric','light','radiant','triumphant'].includes(mood)) return '#4da6ff';
                  if (['focused','sharp','steady','calm'].includes(mood)) return '#8a8a8a';
                  if (['heavy','hollow','foggy','chaotic'].includes(mood)) return '#b45309';
                  return '#3a3a3a';
                };
                const days = Array.from({ length: 30 }, (_, i) => {
                  const d = new Date(today);
                  d.setDate(today.getDate() - (29 - i));
                  return d;
                });
                return (
                  <div className="grid grid-cols-10 gap-1.5">
                    {days.map((day) => {
                      const k = toLocalKey(day);
                      const e = entryMap[k];
                      const color = e ? getMoodColor(e.mood) : null;
                      const intensity = e?.intensity || 3;
                      const opacity = color ? 0.25 + (intensity / 5) * 0.75 : 1;
                      const isToday = k === todayKey;
                      return (
                        <div
                          key={k}
                          title={`${day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${e ? `: ${e.mood}` : ': no entry'}`}
                          className={`h-7 rounded-md transition-all duration-300 cursor-default ${isToday ? 'ring-1 ring-white/40' : ''}`}
                          style={{ backgroundColor: color || '#1a1a1a', opacity }}
                        />
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* Entry Form */}
        <section className="mb-10 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className={`oura-card p-6 mb-8 ${editingEntryId ? 'border border-[#a855f7]/40' : ''}`}>
            {editingEntryId && (
              <div className="flex items-center justify-between mb-5 p-3 bg-[#a855f7]/10 border border-[#a855f7]/20 rounded-xl">
                <span className="text-[#a855f7] text-sm font-medium">Editing entry — Oracle feedback will not regenerate on update</span>
                <button type="button" onClick={cancelEdit} className="text-[#a855f7] text-xs hover:text-white transition-colors">Cancel</button>
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Dynamic AI Insights */}
              {(aiInsights.reflections.length > 0 || aiInsights.isGenerating) && (
                <div className="mb-6 p-5 bg-[#0a0a0a] border border-[#a855f7]/20 rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[#a855f7] font-medium text-sm uppercase tracking-wider">🧠 Live Insights</h3>
                    {aiInsights.isGenerating && (
                      <div className="flex items-center text-[#a855f7] text-xs">
                        <div className="animate-spin rounded-full h-3 w-3 border-b border-[#a855f7] mr-2"></div>
                        Analyzing...
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {aiInsights.isGenerating && aiInsights.reflections.length === 0 ? (
                      <div className="text-[#d8b4fe] text-sm bg-[#a855f7]/10 p-3 rounded-xl animate-pulse">
                        Generating contextual insights based on your writing...
                      </div>
                    ) : (
                      aiInsights.reflections.map((insight, idx) => (
                        // Pass 2 Finding 3 remediation: free-form AI strings can
                        // collide; use index as the key — the list is append-only
                        // and never reordered, so positional keys are safe here.
                        <div key={idx} className="text-[#d8b4fe] text-sm bg-[#a855f7]/10 p-3 rounded-xl transition-all duration-300 ease-in-out">
                          {insight}
                        </div>
                      ))
                    )}
                  </div>
                  {aiInsights.reflections.length > 0 && (
                    <div className="mt-3 text-xs text-[#ababab]">
                      💡 Insights update as you write • Based on mood, content, and patterns
                </div>
              )}
            </div>
          )}

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-widest mb-4 font-medium">How are you feeling?</label>
                
                {/* Mood History Mini-visualization */}
                {entries.length > 0 && (
                  <div className="mb-4 flex items-center gap-2">
                    <span className="text-[#858585] text-xs">Recent:</span>
                    <div className="flex gap-1">
                      {entries.slice(0, 5).map((e, i) => {
                        const moodData = moodOptions.find(m => m.value === e.mood);
                        return (
                          <div 
                            key={i}
                            className="w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110"
                            style={{ 
                              backgroundColor: `${moodData?.color || '#5a5a5a'}20`,
                              color: moodData?.color || '#5a5a5a'
                            }}
                            title={`${moodData?.label || e.mood} - ${e.timestamp?.toDate ? e.timestamp.toDate().toLocaleDateString() : e.createdAt ? new Date(e.createdAt).toLocaleDateString() : new Date(e.timestamp).toLocaleDateString()}`}
                          >
                            <div className="w-3 h-3">
                              {MoodIcons[e.mood] || <div className="w-2 h-2 rounded-full bg-current" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Category Tabs */}
                <div className="flex gap-2 mb-5">
                  {moodCategories.map((cat) => (
                    <button
                      key={cat.name}
                      type="button"
                      onClick={() => setSelectedCategory(cat.name)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                        selectedCategory === cat.name
                          ? `${cat.bgColor} border-2 ${cat.borderColor}`
                          : 'bg-[#0a0a0a] text-[#858585] border border-[#1a1a1a] hover:border-[#2a2a2a] hover:text-[#ababab]'
                      }`}
                      style={{ color: selectedCategory === cat.name ? cat.color : undefined }}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Mood Options Grid */}
                <div className="grid grid-cols-4 gap-3">
                  {moodCategories.find(c => c.name === selectedCategory)?.moods.map((option) => {
                    const category = moodCategories.find(c => c.name === selectedCategory);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMood(option.value)}
                        className={`group relative p-4 rounded-2xl border-2 transition-all duration-300 ${
                          mood === option.value
                            ? `${category.borderColor} ${category.bgColor} scale-[1.02]`
                            : 'border-transparent bg-[#0a0a0a] hover:bg-[#111] hover:border-[#2a2a2a]'
                        }`}
                        style={{ 
                          boxShadow: mood === option.value ? `0 0 20px ${category.color}30` : 'none'
                        }}
                      >
                        <div 
                          className={`w-8 h-8 mx-auto mb-2 transition-transform duration-300 ${mood === option.value ? 'scale-110' : 'group-hover:scale-105'}`}
                          style={{ color: mood === option.value ? category.color : '#5a5a5a' }}
                        >
                          {MoodIcons[option.value]}
                        </div>
                        <div className={`text-xs font-medium tracking-wide transition-colors duration-300 text-center ${
                          mood === option.value ? '' : 'text-[#ababab] group-hover:text-white'
                        }`} style={{ color: mood === option.value ? category.color : undefined }}>
                          {option.label}
                        </div>
                        <div className="text-[10px] text-[#858585] mt-1 text-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {option.description}
                        </div>
                        {mood === option.value && (
                          <div 
                            className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-6 h-1 rounded-full"
                            style={{ backgroundColor: category.color }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-gray-500 text-xs uppercase tracking-widest mb-6 font-medium">Intensity Level</label>
                <div className="space-y-5">
                  {/* Ring-based intensity visualization */}
                  <div className="flex justify-between items-center px-4">
                    {intensityLevels.map((level) => (
                      <IntensityRing
                        key={level.value}
                        level={level.value}
                        selected={intensity}
                        onClick={() => setIntensity(level.value)}
                      />
                    ))}
                  </div>
                  
                  {/* Progress line with gradient */}
                  <div className="relative h-1 mx-4 bg-[#1a1a1a] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${((intensity - 1) / 4) * 100}%`,
                        background: `linear-gradient(90deg, #a855f7 0%, #c084fc 100%)`,
                        boxShadow: '0 0 8px rgba(168, 85, 247, 0.25)',
                      }}
                    />
                  </div>
                  
                  {/* Selected intensity card */}
                  <div className="text-center p-5 bg-gradient-to-b from-[#0a0a0a] to-black rounded-2xl border border-[#1a1a1a]">
                    <div className="text-white text-lg font-light tracking-wide mb-1">
                      {intensityLevels.find(level => level.value === intensity)?.label}
                    </div>
                    <div className="text-[#858585] text-sm font-light">
                      {intensityLevels.find(level => level.value === intensity)?.description}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[#ababab] text-sm uppercase tracking-wider mb-4">What's on your mind?</label>

                <div className="mb-6">
                  <div className="mb-4 h-20 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        const currentPrompt = journalPrompts[currentPromptIndex];
                        setEntry(prev => prev + (prev ? '\n\n' : '') + currentPrompt + '\n');
                      }}
                      className={`text-center p-5 ${
                        currentPromptIndex < oraclePrompts.length
                          ? 'bg-gradient-to-r from-[#a855f7]/80 to-[#a855f7]/40 hover:from-[#a855f7] hover:to-[#a855f7]/60 border border-[#a855f7]/30'
                          : 'bg-gradient-to-r from-[#a855f7] to-[#9333ea] hover:from-[#9333ea] hover:to-[#7e22ce]'
                      } text-white rounded-2xl text-sm font-medium transition-all duration-600 transform ${
                        promptVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                      } min-h-[5rem] flex items-center justify-center shadow-lg hover:shadow-xl max-w-2xl mx-auto w-full`}
                      style={{
                        transition: 'opacity 0.6s ease-in-out, transform 0.6s ease-in-out'
                      }}
                    >
                      <span className="text-center leading-relaxed px-4">
                        {journalPrompts[currentPromptIndex]}
                      </span>
                    </button>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-[#858585] mb-2">
                      {currentPromptIndex < oraclePrompts.length
                        ? 'From the Oracle • Click to continue this thread'
                        : `Prompt ${currentPromptIndex - oraclePrompts.length + 1} of ${basePrompts.length} • Click to add to your entry`}
                    </p>
                    <div className="flex justify-center space-x-1">
                      {journalPrompts.map((_, index) => (
                        <div
                          key={index}
                          className={`w-2 h-2 rounded-full transition-colors duration-300 ${
                            index === currentPromptIndex ? 'bg-[#a855f7]' : 'bg-[#2a2a2a]'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <textarea
                    id="journal-entry-input"
                    ref={entryTextareaRef}
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    onFocus={() => setIsTextareaFocused(true)}
                    onBlur={() => setIsTextareaFocused(false)}
                    rows={6}
                    style={{ minHeight: '11rem' }}
                    className="w-full p-4 pr-14 bg-[#0a0a0a] text-white rounded-2xl border border-[#1a1a1a] focus:border-[#a855f7] focus:outline-none resize-none transition-colors overflow-hidden"
                    placeholder="Write about your day, thoughts, feelings, challenges, or victories..."
                    required
                  />
                  <div className="absolute right-2 top-2">
                    <VoiceInputButton
                      onTranscript={(transcript) => {
                        setEntry(prev => prev + (prev ? ' ' : '') + transcript);
                      }}
                      disabled={loading}
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
                    className="w-full px-4 py-2.5 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#a855f7] focus:outline-none transition-colors text-sm"
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading || !entry.trim()}
                  className="flex-1 bg-white hover:bg-[#d1d1d1] hover:shadow-[0_0_24px_rgba(77,166,255,0.15)] disabled:bg-[#1a1a1a] disabled:text-[#858585] disabled:shadow-none text-black font-medium py-3 rounded-2xl transition-all duration-300"
                >
                  {loading ? 'Saving...' : editingEntryId ? 'Update Entry' : 'Save Entry'}
                </button>
                {editingEntryId && (
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="px-6 py-3 bg-[#0a0a0a] hover:bg-[#1a1a1a] text-[#ababab] hover:text-white border border-[#1a1a1a] rounded-2xl transition-all duration-300 font-medium"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>

        {/* Cross-module suggestions for the most recent entry — Oracle classifies on save. */}
        <CrossModuleExtractionPrompts
          extractions={crossModuleExtractions}
          onDismissKillList={handleDismissKillListExtraction}
          onDismissRelapseRadar={handleDismissRelapseExtraction}
          onDismissHardLesson={handleDismissHardLessonExtraction}
          onConfirmKillList={handleConfirmKillListExtraction}
          onConfirmRelapseRadar={handleConfirmRelapseExtraction}
          onConfirmHardLesson={handleConfirmHardLessonExtraction}
        />

        {/* Previous Entries */}
        <section className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h3 className="text-[#858585] text-xs uppercase tracking-widest">
                {view === 'archive' ? 'Archive' : 'Previous Entries'}
                {searchQuery.trim() && view === 'active' && (
                  <span className="text-[#858585] ml-2">
                    ({filteredEntries.length}/{entries.length})
                  </span>
                )}
              </h3>
              <ArchiveToggle
                view={view}
                onChange={setView}
                activeCount={entries.length}
                archiveCount={archivedEntries.length}
              />
            </div>
            {view === 'active' && (
              <div className="relative w-full sm:w-80">
                <input
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search entries..."
                  className="w-full px-4 py-2.5 bg-[#0a0a0a] text-white rounded-xl border border-[#1a1a1a] focus:border-[#a855f7] focus:outline-none transition-colors"
                />
                {searchInput && (
                  <button
                    onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#858585] hover:text-white text-xs"
                  >
                    Clear
                  </button>
                )}
              </div>
            )}
          </div>

          {view === 'archive' && (
            <div className="space-y-4">
              {archivedEntries.length === 0 ? (
                <div className="oura-card p-10 text-center">
                  <p className="text-[#858585] text-sm">No archived entries.</p>
                </div>
              ) : archivedEntries.map(entry => {
                const moodOption = moodOptions.find(m => m.value === entry.mood);
                return (
                  <div key={entry.id} className="oura-card p-6 opacity-75 hover:opacity-100 transition-opacity">
                    <div className="flex items-center justify-between mb-4">
                      {moodOption ? (
                        <div className="flex items-center space-x-3">
                          <div className="w-10 h-10 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center" style={{ color: moodOption.color }}>
                            <span className="w-5 h-5 block">{MoodIcons[moodOption.value]}</span>
                          </div>
                          <div>
                            <p className="text-white text-sm font-medium">{moodOption.label}</p>
                            <p className="text-[#858585] text-xs">Archived {entry.archivedAt ? new Date(entry.archivedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</p>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[#858585] text-xs uppercase tracking-widest">Archived Entry</div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => restoreArchivedJournalEntry(entry)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/10 transition-colors"
                        >
                          Restore
                        </button>
                        <button
                          onClick={() => permanentlyDeleteJournalEntry(entry)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-[#b45309]/30 text-[#b45309] hover:bg-[#b45309]/10 transition-colors"
                        >
                          Delete permanently
                        </button>
                      </div>
                    </div>
                    <p className="text-[#d1d1d1] leading-relaxed text-sm">{entry.content}</p>
                  </div>
                );
              })}
            </div>
          )}

          {view === 'active' && (
          <div className="relative">
            <div className={`fade-pane ${showSkeleton ? 'visible' : 'hidden'}`}>
              <SkeletonList count={4} ItemComponent={SkeletonJournalEntry} />
            </div>

            <div className={`fade-pane ${showSkeleton ? 'hidden' : 'visible'}`}>
              {loadError ? (
                <div className="oura-card p-10 text-center">
                  <p className="text-[#b45309] mb-4 text-sm">Failed to load journal entries. Please check your connection.</p>
                  <button
                    onClick={loadJournalEntries}
                    className="px-5 py-2.5 bg-transparent text-[#b45309] border border-[#b45309]/30 rounded-xl hover:bg-[#b45309]/10 transition-colors text-sm font-medium"
                  >
                    Retry
                  </button>
                </div>
              ) : filteredEntries.length > 0 ? (
                <div className="space-y-4">
                  {filteredEntries.map((entry, mapIndex) => {
                    const moodOption = moodOptions.find(m => m.value === entry.mood);
                    const intensityLabel = intensityLevels.find(i => i.value === entry.intensity)?.label;

                    // Log each entry being rendered
                    if (mapIndex < 3) {
                      logger.log(`📝 Rendering entry ${mapIndex + 1}: ID=${entry.id}`);
                    }

                    return (
                      <div key={entry.id} className="oura-card p-6">
                        <div className="flex items-center justify-between mb-4">
                          {moodOption ? (
                            <div className="flex items-center space-x-3">
                              <div className="w-10 h-10 rounded-full bg-[#0a0a0a] border border-[#1a1a1a] flex items-center justify-center" style={{ color: moodOption.color }}>
                                <span className="w-5 h-5 block">{MoodIcons[moodOption.value]}</span>
                              </div>
                              <div>
                                <p className="text-white text-sm font-medium">{moodOption.label}</p>
                                {intensityLabel && <p className="text-[#858585] text-xs">{intensityLabel}</p>}
                              </div>
                            </div>
                          ) : (
                            <div className="text-[#858585] text-xs uppercase tracking-widest">Entry</div>
                          )}
                          <div className="flex items-center space-x-2">
                            <span className="text-xs text-[#858585]">
                              {entry.timestamp?.toDate ?
                                entry.timestamp.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) :
                                entry.createdAt?.toDate ?
                                  entry.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) :
                                  entry.timestamp ?
                                    new Date(entry.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) :
                                    entry.createdAt ?
                                      new Date(entry.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) :
                                      'Unknown date'
                              }
                            </span>
                            <button
                              onClick={() => startEditEntry(entry)}
                              className="w-8 h-8 flex items-center justify-center rounded-full text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors"
                              aria-label="Edit this entry"
                              title="Edit this entry"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => archiveEntryById(entry.id)}
                              className="w-8 h-8 flex items-center justify-center rounded-full text-[#858585] hover:text-white hover:bg-[#1a1a1a] transition-colors"
                              aria-label="Archive this entry"
                              title="Archive this entry"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="4" width="18" height="4" rx="1" />
                                <path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" />
                                <line x1="10" y1="12" x2="14" y2="12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <p className="text-[#d1d1d1] leading-relaxed mb-4">{entry.content}</p>

                        {entry.oracleJudgment && (
                          <div className="mt-4 p-4 bg-[#0a0a0a] border border-[#1a1a1a] border-l-2 border-l-[#a855f7] rounded-2xl">
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-[#888] font-medium text-xs uppercase tracking-widest">Oracle</h4>
                              {entry.oracleReaction && typeof entry.oracleReaction === 'string' && (
                                <span className={`text-xs px-2 py-0.5 rounded-lg border ${
                                  entry.oracleReaction === 'landed' ? 'text-white border-white/30 bg-transparent' :
                                  entry.oracleReaction === 'disagree' ? 'text-[#b45309] border-[#b45309]/30 bg-transparent' :
                                  entry.oracleReaction === 'sit' ? 'text-[#ababab] border-[#2a2a2a] bg-transparent' :
                                  'text-[#858585] border-[#2a2a2a] bg-transparent'
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

                            {/* Reconsider this entry — re-runs all three Oracle classifications
                                (Ledger / Signal / Hard Lessons) and surfaces whichever cards apply.
                                Replaces the always-on "Extract Lesson" button with a content-aware,
                                on-demand action. */}
                            {(() => {
                              const reconsidered = entryReconsiderations[entry.id];
                              const isLoading = !!reconsidered?.loading;
                              return (
                                <button
                                  onClick={() => handleReconsiderEntry(entry)}
                                  disabled={isLoading}
                                  className="mt-4 pt-3 border-t border-[#1a1a1a] flex items-center gap-2 text-xs text-[#ababab] hover:text-white disabled:text-[#858585] transition-colors w-full"
                                >
                                  {isLoading ? (
                                    <>
                                      <span className="inline-block w-3 h-3 border border-[#8a8a8a] border-t-transparent rounded-full animate-spin" />
                                      <span>Oracle is reconsidering this entry...</span>
                                    </>
                                  ) : (
                                    <span>Reconsider this entry</span>
                                  )}
                                </button>
                              );
                            })()}

                            {/* Inline cross-module suggestions surfaced by "Reconsider this entry". */}
                            {entryReconsiderations[entry.id] && !entryReconsiderations[entry.id].loading && (
                              <div className="mt-3">
                                <CrossModuleExtractionPrompts
                                  extractions={entryReconsiderations[entry.id]}
                                  onDismissKillList={makeReconsideredDismiss(entry.id, 'killList')}
                                  onDismissRelapseRadar={makeReconsideredDismiss(entry.id, 'relapseRadar')}
                                  onDismissHardLesson={makeReconsideredDismiss(entry.id, 'hardLesson')}
                                  onConfirmKillList={makeReconsideredConfirmKillList(entry.id)}
                                  onConfirmRelapseRadar={makeReconsideredConfirmRelapse(entry.id)}
                                  onConfirmHardLesson={makeReconsideredConfirmHardLesson(entry.id)}
                                />
                              </div>
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
                  <p className="text-[#858585] text-sm mb-6">
                    {searchQuery.trim()
                      ? 'Try a different keyword or clear the search.'
                      : 'Honesty here is what gives the Oracle signal. Vagueness produces nothing useful.'}
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                    {searchQuery.trim() ? (
                      <button
                        onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                        className="px-6 py-2.5 bg-transparent border border-[#1a1a1a] text-[#ababab] hover:text-white hover:border-[#2a2a2a] rounded-xl transition-all duration-300 font-medium text-sm"
                      >
                        Clear Search
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            document.getElementById('journal-entry-input')?.focus();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="px-6 py-2.5 bg-[#a855f7] hover:bg-[#9333ea] text-white rounded-xl transition-all duration-300 font-medium text-sm"
                        >
                          Write Your First Entry
                        </button>
                        <button
                          onClick={() => {
                            document.getElementById('journal-entry-input')?.focus();
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="px-6 py-2.5 bg-transparent border border-[#1a1a1a] text-[#ababab] hover:text-white hover:border-[#2a2a2a] rounded-xl transition-all duration-300 font-medium text-sm"
                        >
                          Use a Prompt
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
          )}
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
